use crate::errors::AppError;
use crate::git::{cli::GitCli, rebase_service};
use crate::models::rebase::*;
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::fs::{Dir, OpenOptions};
use cap_tempfile::TempFile;
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;

const TEXT_LIMIT: usize = 2 * 1024 * 1024;

fn io(error: impl std::fmt::Display) -> AppError {
    AppError::IoError(error.to_string())
}
fn invalid(message: &str) -> AppError {
    AppError::GitError(message.into())
}

struct SafePath {
    root: PathBuf,
    absolute: PathBuf,
    parent: Dir,
    name: OsString,
    missing_parent: bool,
}

fn safe_path(repo_path: &Path, file_path: &str) -> Result<SafePath, AppError> {
    let path = Path::new(file_path);
    if file_path.is_empty()
        || file_path.contains('\0')
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || path.components().any(|part| {
            part.as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(".git")
        })
    {
        return Err(AppError::InvalidPath(file_path.into()));
    }
    let root = PathBuf::from(GitCli::run(repo_path, &["rev-parse", "--show-toplevel"])?.trim())
        .canonicalize()
        .map_err(io)?;
    let mut parent = Dir::open_ambient_dir(&root, cap_std::ambient_authority()).map_err(io)?;
    let components: Vec<_> = path.components().collect();
    let mut missing_parent = false;
    for part in &components[..components.len() - 1] {
        match parent.open_dir_nofollow(part.as_os_str()) {
            Ok(directory) => parent = directory,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                missing_parent = true;
                break;
            }
            Err(_) => {
                return Err(invalid(
                    "The conflict path has a symlinked or non-directory parent.",
                ))
            }
        }
        if parent.symlink_metadata(".git").is_ok() {
            return Err(invalid(
                "Resolve files inside a nested repository from that repository, not its parent.",
            ));
        }
    }
    Ok(SafePath {
        absolute: root.join(path),
        root,
        parent,
        name: path.file_name().unwrap().to_os_string(),
        missing_parent,
    })
}

fn git_bytes(repo: &Path, args: &[&str]) -> Result<Vec<u8>, AppError> {
    let output = GitCli::command()
        .current_dir(repo)
        .env("GIT_LITERAL_PATHSPECS", "1")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .args(args)
        .output()
        .map_err(io)?;
    if !output.status.success() {
        return Err(invalid(String::from_utf8_lossy(&output.stderr).trim()));
    }
    Ok(output.stdout)
}

#[derive(Clone)]
struct Entry {
    mode: String,
    oid: String,
    stage: u8,
}

fn entries(repo: &Path, file: &str, undo: bool) -> Result<(Vec<Entry>, Vec<u8>), AppError> {
    let bytes = git_bytes(
        repo,
        &[
            "ls-files",
            if undo { "--resolve-undo" } else { "--stage" },
            "-z",
            "--",
            file,
        ],
    )?;
    let mut entries = Vec::new();
    for row in bytes.split(|b| *b == 0).filter(|r| !r.is_empty()) {
        let Some(tab) = row.iter().position(|b| *b == b'\t') else {
            continue;
        };
        if &row[tab + 1..] != file.as_bytes() {
            continue;
        }
        let header = std::str::from_utf8(&row[..tab]).map_err(io)?;
        let fields: Vec<_> = header.split(' ').collect();
        if fields.len() == 3 {
            entries.push(Entry {
                mode: fields[0].into(),
                oid: fields[1].into(),
                stage: fields[2].parse().map_err(io)?,
            });
        }
    }
    Ok((entries, bytes))
}

#[derive(Clone, PartialEq, Eq)]
enum Worktree {
    Missing,
    File(Vec<u8>, bool),
    LargeFile([u8; 32], bool),
    Symlink(PathBuf),
    Directory,
    Unsupported,
}

fn worktree(path: &SafePath) -> Result<Worktree, AppError> {
    read_worktree(path, false)
}

fn read_worktree(path: &SafePath, bounded: bool) -> Result<Worktree, AppError> {
    if path.missing_parent {
        return Ok(Worktree::Missing);
    }
    let metadata = match path.parent.symlink_metadata(&path.name) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Worktree::Missing),
        Err(error) => return Err(io(error)),
    };
    if metadata.is_symlink() {
        return path
            .parent
            .read_link_contents(&path.name)
            .map(Worktree::Symlink)
            .map_err(io);
    }
    if metadata.is_dir() {
        return Ok(Worktree::Directory);
    }
    if !metadata.is_file() {
        return Ok(Worktree::Unsupported);
    }
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    let mut file = path.parent.open_with(&path.name, &options).map_err(io)?;
    #[cfg(unix)]
    let executable = {
        use cap_std::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    };
    #[cfg(not(unix))]
    let executable = false;
    let mut bytes = Vec::new();
    if bounded {
        Read::by_ref(&mut file)
            .take((TEXT_LIMIT + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(io)?;
        if bytes.len() > TEXT_LIMIT {
            let mut digest = Sha256::new();
            digest.update(&bytes);
            let mut buffer = [0u8; 64 * 1024];
            loop {
                let count = file.read(&mut buffer).map_err(io)?;
                if count == 0 {
                    break;
                }
                digest.update(&buffer[..count]);
            }
            return Ok(Worktree::LargeFile(digest.finalize().into(), executable));
        }
    } else {
        file.read_to_end(&mut bytes).map_err(io)?;
    }
    Ok(Worktree::File(bytes, executable))
}

fn same_worktree(path: &SafePath, expected: &Worktree) -> Result<bool, AppError> {
    let actual = read_worktree(path, true)?;
    Ok(match (&actual, expected) {
        (Worktree::LargeFile(digest, executable), Worktree::File(bytes, expected_executable)) => {
            executable == expected_executable
                && digest.as_slice() == Sha256::digest(bytes).as_slice()
        }
        _ => &actual == expected,
    })
}

fn fingerprint(hash: &mut Sha256, value: &Worktree) {
    match value {
        Worktree::Missing => hash.update(b"missing"),
        Worktree::Directory => hash.update(b"directory"),
        Worktree::Unsupported => hash.update(b"unsupported"),
        Worktree::File(bytes, executable) => {
            hash.update(if *executable { b"100755" } else { b"100644" });
            hash.update(bytes);
        }
        Worktree::LargeFile(digest, executable) => {
            hash.update(if *executable {
                b"large-100755"
            } else {
                b"large-100644"
            });
            hash.update(digest);
        }
        Worktree::Symlink(target) => {
            hash.update(b"120000");
            hash.update(target.as_os_str().as_encoded_bytes());
        }
    }
}

fn stage(
    repo: &Path,
    entry: Option<&Entry>,
    label: &str,
    kind: &mut &'static str,
) -> Result<ConflictStage, AppError> {
    let Some(entry) = entry else {
        return Ok(ConflictStage {
            present: false,
            oid: None,
            mode: None,
            content: None,
            label: label.into(),
        });
    };
    let mut content = None;
    if entry.mode != "160000" {
        let size = GitCli::run(repo, &["cat-file", "-s", &entry.oid])?
            .trim()
            .parse::<usize>()
            .map_err(io)?;
        if size > TEXT_LIMIT {
            if *kind == "text" {
                *kind = "oversized";
            }
        } else {
            let bytes = git_bytes(repo, &["cat-file", "blob", &entry.oid])?;
            if bytes.contains(&0) {
                if *kind == "text" {
                    *kind = "binary";
                }
            } else {
                match String::from_utf8(bytes) {
                    Ok(text) => content = Some(text),
                    Err(_) => {
                        if *kind == "text" {
                            *kind = "unsupported";
                        }
                    }
                }
            }
        }
    }
    Ok(ConflictStage {
        present: true,
        oid: Some(entry.oid.clone()),
        mode: Some(entry.mode.clone()),
        content,
        label: label.into(),
    })
}

pub fn get_conflict_content(
    repo_path: &Path,
    file_path: &str,
) -> Result<ConflictContent, AppError> {
    let snapshot = rebase_service::get_operation_summary(repo_path)?;
    let operation_id = snapshot
        .id
        .clone()
        .ok_or_else(|| invalid("No Git operation is active. Reload the repository."))?;
    let path = safe_path(repo_path, file_path)?;
    let (index_entries, index_bytes) = entries(&path.root, file_path, false)?;
    let (undo_entries, undo_bytes) = entries(&path.root, file_path, true)?;
    let stages = if index_entries.iter().any(|e| e.stage > 0) {
        &index_entries
    } else {
        &undo_entries
    };
    if stages.is_empty() {
        return Err(invalid(
            "This path has no conflict or saved resolve-undo entry. Reload the conflict list.",
        ));
    }
    let mut kind = if stages
        .iter()
        .chain(index_entries.iter())
        .any(|e| e.mode == "160000")
    {
        "submodule"
    } else if stages
        .iter()
        .chain(index_entries.iter())
        .any(|e| e.mode == "120000")
    {
        "symlink"
    } else {
        "text"
    };
    let mut base = stage(
        &path.root,
        stages.iter().find(|e| e.stage == 1),
        "Base",
        &mut kind,
    )?;
    let mut ours = stage(
        &path.root,
        stages.iter().find(|e| e.stage == 2),
        &snapshot.current_label,
        &mut kind,
    )?;
    let mut theirs = stage(
        &path.root,
        stages.iter().find(|e| e.stage == 3),
        &snapshot.incoming_label,
        &mut kind,
    )?;
    let worktree = read_worktree(&path, true)?;
    let result = match &worktree {
        Worktree::LargeFile(_, _) => {
            if kind == "text" {
                kind = "oversized";
            }
            None
        }
        Worktree::File(bytes, _) if bytes.len() > TEXT_LIMIT => {
            if kind == "text" {
                kind = "oversized";
            }
            None
        }
        Worktree::File(bytes, _) if bytes.contains(&0) => {
            if kind == "text" {
                kind = "binary";
            }
            None
        }
        Worktree::File(bytes, _) => match std::str::from_utf8(bytes) {
            Ok(text) => Some(text.into()),
            Err(_) => {
                if kind == "text" {
                    kind = "unsupported";
                }
                None
            }
        },
        Worktree::Symlink(_) => {
            if kind != "submodule" {
                kind = "symlink";
            }
            None
        }
        Worktree::Directory | Worktree::Unsupported => {
            if kind != "submodule" {
                kind = "unsupported";
            }
            None
        }
        Worktree::Missing => None,
    };
    let submodule = if kind == "submodule" {
        Some(submodule_state(&path, &ours, &theirs)?)
    } else {
        None
    };
    if submodule.as_ref().is_some_and(|state| state.initialized) {
        for stage in [&mut base, &mut ours, &mut theirs] {
            if let Some(oid) = &stage.oid {
                if let Ok(subject) =
                    GitCli::run(&path.absolute, &["show", "-s", "--format=%s", oid, "--"])
                {
                    stage.label = format!("{} — {}", stage.label, subject.trim_end());
                }
            }
        }
    }
    let mut revision = Sha256::new();
    revision.update(operation_id.as_bytes());
    revision.update(file_path.as_bytes());
    revision.update(index_bytes);
    revision.update(undo_bytes);
    revision.update(serde_json::to_vec(&snapshot.current).map_err(io)?);
    fingerprint(&mut revision, &worktree);
    revision.update(serde_json::to_vec(&submodule).map_err(io)?);
    let regions = if kind == "text" {
        result.as_deref().map(conflict_regions).unwrap_or_default()
    } else {
        Vec::new()
    };
    let warning = match kind {
        "submodule" => Some("Only the parent index pointer is changed. Nested files are never checked out or cleaned; uncommitted nested changes are not included in a pointer.".into()),
        "symlink" => Some("Symbolic link conflict: choose a side or delete. Link targets are never followed.".into()),
        "binary" | "unsupported" | "oversized" => Some("This file cannot be edited losslessly as text. Choose a whole side, delete, or resolve with an external tool.".into()),
        _ => None,
    };
    Ok(ConflictContent {
        file_path: file_path.into(),
        absolute_path: path.absolute.to_string_lossy().into(),
        operation_id,
        revision: format!("{:x}", revision.finalize()),
        kind: kind.into(),
        base,
        ours,
        theirs,
        result,
        result_exists: !matches!(worktree, Worktree::Missing),
        regions,
        submodule,
        warning,
    })
}

fn submodule_state(
    path: &SafePath,
    ours: &ConflictStage,
    theirs: &ConflictStage,
) -> Result<ConflictSubmodule, AppError> {
    let initialized = !path.missing_parent
        && path
            .parent
            .open_dir_nofollow(&path.name)
            .ok()
            .is_some_and(|dir| dir.symlink_metadata(".git").is_ok());
    let head = if initialized {
        GitCli::run(&path.absolute, &["rev-parse", "--verify", "HEAD"])
            .ok()
            .map(|s| s.trim().into())
    } else {
        None
    };
    let dirty = initialized
        && git_bytes(
            &path.absolute,
            &["status", "--porcelain", "--untracked-files=normal"],
        )
        .map(|s| !s.is_empty())
        .unwrap_or(true);
    let relationship = match (&ours.oid, &theirs.oid) {
        (Some(a), Some(b)) if a == b => "identical",
        (Some(a), Some(b)) if initialized => {
            let forward =
                GitCli::run_with_status(&path.absolute, &["merge-base", "--is-ancestor", a, b])?;
            let reverse =
                GitCli::run_with_status(&path.absolute, &["merge-base", "--is-ancestor", b, a])?;
            if forward.status_code == 0 {
                "currentAncestorOfIncoming"
            } else if reverse.status_code == 0 {
                "incomingAncestorOfCurrent"
            } else if forward.status_code == 1 && reverse.status_code == 1 {
                "divergent"
            } else {
                "objectsUnavailable"
            }
        }
        (None, _) | (_, None) => "addedOrDeleted",
        _ => "objectsUnavailable",
    };
    Ok(ConflictSubmodule {
        head,
        dirty,
        initialized,
        relationship: relationship.into(),
    })
}

/// Offsets cross the IPC boundary as JavaScript UTF-16 offsets, not UTF-8 byte offsets.
pub fn conflict_regions(text: &str) -> Vec<ConflictRegion> {
    let mut lines = Vec::new();
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        lines.push((offset, line));
        offset += line.len();
    }
    let mut regions = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let (start, line) = lines[i];
        let width = line.bytes().take_while(|b| *b == b'<').count();
        if width < 7 || !line[width..].starts_with([' ', '\r', '\n']) {
            i += 1;
            continue;
        }
        let marker = |line: &str, symbol: char| {
            let count = line.chars().take_while(|c| *c == symbol).count();
            count == width && (line.len() == count || line[count..].starts_with([' ', '\r', '\n']))
        };
        let current_start = start + line.len();
        let mut separator = None;
        let mut base = None;
        let mut end = None;
        let mut j = i + 1;
        while j < lines.len() {
            if marker(lines[j].1, '<') {
                break;
            }
            if marker(lines[j].1, '|') && separator.is_none() {
                base = Some(j);
            }
            if marker(lines[j].1, '=') {
                if separator.is_some() {
                    break;
                }
                separator = Some(j);
            }
            if marker(lines[j].1, '>') {
                end = Some(j);
                break;
            }
            j += 1;
        }
        if let (Some(sep), Some(last)) = (separator, end) {
            let finish = lines[last].0 + lines[last].1.len();
            let current_end = base.map(|b| lines[b].0).unwrap_or(lines[sep].0);
            regions.push(ConflictRegion {
                id: format!("region-{}", regions.len()),
                start: text[..start].encode_utf16().count(),
                end: text[..finish].encode_utf16().count(),
                current: text[current_start..current_end].into(),
                incoming: text[lines[sep].0 + lines[sep].1.len()..lines[last].0].into(),
                base: base.map(|b| text[lines[b].0 + lines[b].1.len()..lines[sep].0].into()),
            });
            i = last + 1;
        } else {
            i += 1;
        }
    }
    regions
}

struct IndexTransaction {
    path: PathBuf,
    index: PathBuf,
}
impl IndexTransaction {
    fn new(repo: &Path) -> Result<Self, AppError> {
        let output = GitCli::run(
            repo,
            &["rev-parse", "--path-format=absolute", "--git-path", "index"],
        )?;
        let index = PathBuf::from(output.trim());
        let path = index.with_file_name("index.lock");
        let mut lock = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| {
                invalid("Git's index is locked. Wait for the other Git operation to finish.")
            })?;
        let transaction = Self { path, index };
        let mut current = fs::File::open(&transaction.index).map_err(io)?;
        std::io::copy(&mut current, &mut lock).map_err(io)?;
        lock.sync_all().map_err(io)?;
        Ok(transaction)
    }
    fn update(
        &self,
        repo: &Path,
        file: &str,
        target: Option<(&str, &str)>,
    ) -> Result<(), AppError> {
        let mut command = GitCli::command();
        command
            .current_dir(repo)
            .env("GIT_INDEX_FILE", &self.path)
            .env("GIT_LITERAL_PATHSPECS", "1");
        match target {
            Some((mode, oid)) => {
                command.args(["update-index", "--add", "--cacheinfo", mode, oid, file]);
            }
            None => {
                command.args(["update-index", "--force-remove", "--", file]);
            }
        }
        let output = command.output().map_err(io)?;
        if !output.status.success() {
            return Err(invalid(String::from_utf8_lossy(&output.stderr).trim()));
        }
        Ok(())
    }
    fn commit(mut self) -> Result<(), AppError> {
        fs::rename(&self.path, &self.index).map_err(io)?;
        self.path = PathBuf::new();
        Ok(())
    }
}
impl Drop for IndexTransaction {
    fn drop(&mut self) {
        if !self.path.as_os_str().is_empty() {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn write_worktree(path: &SafePath, value: &Worktree) -> Result<(), AppError> {
    if path.missing_parent {
        if matches!(value, Worktree::Missing) {
            return Ok(());
        }
        let relative = path.absolute.strip_prefix(&path.root).map_err(io)?;
        let mut parent =
            Dir::open_ambient_dir(&path.root, cap_std::ambient_authority()).map_err(io)?;
        for part in relative.parent().into_iter().flat_map(Path::components) {
            match parent.create_dir(part.as_os_str()) {
                Ok(()) => (),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
                Err(error) => return Err(io(error)),
            }
            parent = parent.open_dir_nofollow(part.as_os_str()).map_err(io)?;
            if parent.symlink_metadata(".git").is_ok() {
                return Err(invalid("Refusing to write inside a nested repository."));
            }
        }
        let created = SafePath {
            root: path.root.clone(),
            absolute: path.absolute.clone(),
            parent,
            name: path.name.clone(),
            missing_parent: false,
        };
        if worktree(&created)? != Worktree::Missing {
            return Err(invalid(
                "A file appeared while preparing its directory. Reload before retrying.",
            ));
        }
        return write_worktree(&created, value);
    }
    match value {
        Worktree::Missing => match path.parent.remove_file(&path.name) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(io(e)),
        },
        Worktree::File(bytes, executable) => {
            let mut temporary = TempFile::new(&path.parent).map_err(io)?;
            temporary.as_file_mut().write_all(bytes).map_err(io)?;
            #[cfg(unix)]
            {
                use cap_std::fs::PermissionsExt;
                temporary
                    .as_file()
                    .set_permissions(cap_std::fs::Permissions::from_mode(if *executable {
                        0o755
                    } else {
                        0o644
                    }))
                    .map_err(io)?;
            }
            #[cfg(not(unix))]
            let _ = executable;
            temporary.replace(&path.name).map_err(io)
        }
        Worktree::Symlink(target) => {
            // A fresh exclusive temporary directory pins the link destination; rename never follows the existing link.
            let directory = format!(
                ".giteye-link-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(io)?
                    .as_nanos()
            );
            path.parent.create_dir(&directory).map_err(io)?;
            let result = (|| {
                let child = path.parent.open_dir_nofollow(&directory).map_err(io)?;
                #[cfg(unix)]
                child.symlink_contents(target, "link").map_err(io)?;
                #[cfg(windows)]
                child.symlink_file(target, "link").map_err(io)?;
                child.rename("link", &path.parent, &path.name).map_err(io)
            })();
            let _ = path.parent.remove_dir(&directory);
            result
        }
        _ => Err(invalid("Refusing to replace a directory or special file.")),
    }
}

fn hash_blob(repo: &Path, file: Option<&str>, bytes: &[u8]) -> Result<String, AppError> {
    let mut command = GitCli::command();
    command
        .current_dir(repo)
        .args(["hash-object", "-w", "--stdin"]);
    if let Some(file) = file {
        command.args(["--path", file]);
    }
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(io)?;
    child.stdin.take().unwrap().write_all(bytes).map_err(io)?;
    let output = child.wait_with_output().map_err(io)?;
    if !output.status.success() {
        return Err(invalid(String::from_utf8_lossy(&output.stderr).trim()));
    }
    Ok(std::str::from_utf8(&output.stdout)
        .map_err(io)?
        .trim()
        .into())
}

pub fn save_conflict_result(
    repo: &Path,
    request: &ConflictResolutionRequest,
) -> Result<(), AppError> {
    resolve(repo, request, false)
}
pub fn mark_conflict_resolved(
    repo: &Path,
    request: &ConflictResolutionRequest,
) -> Result<(), AppError> {
    resolve(repo, request, true)
}

fn resolve(repo: &Path, request: &ConflictResolutionRequest, mark: bool) -> Result<(), AppError> {
    // Reserve Git's real index lock for both draft and staged writes. Other Git clients cannot resolve/abort between the checks and publication.
    let transaction = IndexTransaction::new(repo)?;
    let content = get_conflict_content(repo, &request.file_path)?;
    if content.operation_id != request.operation_id || content.revision != request.expected_revision
    {
        return Err(invalid("The operation or file changed. Your draft was not written. Reload and compare before retrying."));
    }
    let path = safe_path(repo, &request.file_path)?;
    let prior = worktree(&path)?;
    let selected = match &request.resolution {
        ConflictResolution::Side {
            side: ConflictSide::Ours,
        } => Some(&content.ours),
        ConflictResolution::Side {
            side: ConflictSide::Theirs,
        } => Some(&content.theirs),
        _ => None,
    };
    if content.kind == "submodule" {
        if !mark {
            return Err(invalid("Submodule pointer choices are drafts until Mark resolved; no nested worktree is written."));
        }
        let oid = match &request.resolution {
            ConflictResolution::Side { .. } => {
                let side = selected.unwrap();
                if side.present && side.mode.as_deref() != Some("160000") {
                    return Err(invalid(
                        "Mixed file/submodule conflicts require manual Git resolution.",
                    ));
                }
                side.oid.clone()
            }
            ConflictResolution::Delete => None,
            ConflictResolution::SubmoduleHead => {
                let head = content
                    .submodule
                    .as_ref()
                    .and_then(|s| s.head.clone())
                    .ok_or_else(|| invalid("The submodule is not initialized or has no HEAD."))?;
                if !git_bytes(&path.absolute, &["ls-files", "--unmerged", "-z"])?.is_empty() {
                    return Err(invalid(
                        "Resolve the nested repository's conflicts before using its HEAD.",
                    ));
                }
                Some(head)
            }
            _ => {
                return Err(invalid(
                    "A submodule conflict must be resolved with a commit pointer, never text.",
                ))
            }
        };
        transaction.update(
            &path.root,
            &request.file_path,
            oid.as_deref().map(|id| ("160000", id)),
        )?;
        if get_conflict_content(repo, &request.file_path)?.revision != request.expected_revision {
            return Err(invalid(
                "Submodule state changed before staging. Reload before retrying.",
            ));
        }
        return transaction.commit();
    }
    if matches!(request.resolution, ConflictResolution::Keep) {
        if !mark {
            return Err(invalid(
                "Keep worktree is applied only with Mark resolved; no draft write is needed.",
            ));
        }
        let (mode, oid) = match &prior {
            Worktree::File(bytes, executable) => (
                if *executable { "100755" } else { "100644" },
                Some(hash_blob(&path.root, Some(&request.file_path), bytes)?),
            ),
            Worktree::Symlink(target) => (
                "120000",
                Some(hash_blob(
                    &path.root,
                    None,
                    target.as_os_str().as_encoded_bytes(),
                )?),
            ),
            Worktree::Missing => ("100644", None),
            _ => {
                return Err(invalid(
                    "Only an ordinary file, symbolic link, or deletion can be kept.",
                ))
            }
        };
        transaction.update(
            &path.root,
            &request.file_path,
            oid.as_deref().map(|oid| (mode, oid)),
        )?;
        if get_conflict_content(repo, &request.file_path)?.revision != request.expected_revision {
            return Err(invalid(
                "The external result changed before staging. Reload before retrying.",
            ));
        }
        return transaction.commit();
    }
    if matches!(prior, Worktree::Directory | Worktree::Unsupported) {
        return Err(invalid(
            "Refusing to overwrite a directory or special file. Resolve this path externally.",
        ));
    }
    let (next, mode, oid) = match &request.resolution {
        ConflictResolution::Text {
            content: text,
            mode,
        } => {
            if content.kind != "text" || text.len() > TEXT_LIMIT {
                return Err(invalid(
                    "This conflict cannot safely accept an editable text result.",
                ));
            }
            let executable = match mode.as_deref() {
                Some("100755") => true,
                Some("100644") => false,
                Some(_) => {
                    return Err(invalid(
                        "Editable text can only use regular file modes 100644 or 100755.",
                    ))
                }
                None => {
                    matches!(&prior, Worktree::File(_, true))
                        || content.ours.mode.as_deref() == Some("100755")
                }
            };
            let oid = if mark {
                Some(hash_blob(
                    &path.root,
                    Some(&request.file_path),
                    text.as_bytes(),
                )?)
            } else {
                None
            };
            (
                Worktree::File(text.as_bytes().to_vec(), executable),
                if executable { "100755" } else { "100644" },
                oid,
            )
        }
        ConflictResolution::Side { .. } => {
            let side = selected.unwrap();
            if let Some(oid) = side.oid.as_deref() {
                let bytes = git_bytes(&path.root, &["cat-file", "blob", oid])?;
                let mode = side.mode.as_deref().unwrap_or("100644");
                let value = if mode == "120000" {
                    #[cfg(unix)]
                    {
                        use std::os::unix::ffi::OsStringExt;
                        Worktree::Symlink(PathBuf::from(OsString::from_vec(bytes)))
                    }
                    #[cfg(not(unix))]
                    {
                        Worktree::Symlink(PathBuf::from(String::from_utf8(bytes).map_err(io)?))
                    }
                } else {
                    Worktree::File(bytes, mode == "100755")
                };
                (value, mode, Some(oid.to_string()))
            } else {
                (Worktree::Missing, "100644", None)
            }
        }
        ConflictResolution::Delete => (Worktree::Missing, "100644", None),
        ConflictResolution::SubmoduleHead | ConflictResolution::Keep => {
            return Err(invalid("This resolution is not applicable to this file."))
        }
    };
    // Prepare index changes first; failure cannot damage either the real index or worktree.
    if mark {
        transaction.update(
            &path.root,
            &request.file_path,
            oid.as_deref().map(|oid| (mode, oid)),
        )?;
    }
    if get_conflict_content(repo, &request.file_path)?.revision != request.expected_revision
        || !same_worktree(&path, &prior)?
    {
        return Err(invalid(
            "The file changed while preparing the resolution. Your draft was not written.",
        ));
    }
    write_worktree(&path, &next)?;
    if mark {
        if !same_worktree(&safe_path(repo, &request.file_path)?, &next)? {
            return Err(invalid("An external edit arrived while staging. The newer file was preserved; reload before retrying."));
        }
        if let Err(error) = transaction.commit() {
            let current_path = safe_path(repo, &request.file_path)?;
            if same_worktree(&current_path, &next)? {
                write_worktree(&current_path, &prior)?;
            }
            return Err(error);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deleted_side_and_missing_parent_are_not_confused_with_empty_content() {
        let repo = Repo::new();
        repo.commit("dir/file.txt", b"base\n", "Base");
        git(&repo.0, &["switch", "-c", "incoming"]);
        repo.commit("dir/file.txt", b"incoming\n", "Incoming");
        git(&repo.0, &["switch", "main"]);
        git(&repo.0, &["rm", "dir/file.txt"]);
        git(&repo.0, &["commit", "-m", "Delete"]);
        assert_ne!(
            GitCli::run_with_status(&repo.0, &["merge", "--no-edit", "incoming"])
                .unwrap()
                .status_code,
            0
        );
        fs::remove_file(repo.0.join("dir/file.txt")).unwrap();
        fs::remove_dir(repo.0.join("dir")).unwrap();
        let content = get_conflict_content(&repo.0, "dir/file.txt").unwrap();
        assert!(!content.ours.present);
        assert!(!content.result_exists);
        assert!(content.result.is_none());
        mark_conflict_resolved(
            &repo.0,
            &request(
                &content,
                ConflictResolution::Side {
                    side: ConflictSide::Theirs,
                },
            ),
        )
        .unwrap();
        assert_eq!(
            fs::read(repo.0.join("dir/file.txt")).unwrap(),
            b"incoming\n"
        );
        let resolved = get_conflict_content(&repo.0, "dir/file.txt").unwrap();
        mark_conflict_resolved(&repo.0, &request(&resolved, ConflictResolution::Delete)).unwrap();
        assert!(!repo.0.join("dir/file.txt").exists());
        assert!(git(&repo.0, &["ls-files", "--", "dir/file.txt"]).is_empty());
    }

    #[test]
    fn keep_stages_external_binary_result_without_overwriting_it() {
        let repo = Repo::conflict(b"base\0", b"ours\0", b"theirs\0");
        let resolved = b"externally merged\xff\0";
        fs::write(repo.0.join("file.txt"), resolved).unwrap();
        let content = get_conflict_content(&repo.0, "file.txt").unwrap();
        mark_conflict_resolved(&repo.0, &request(&content, ConflictResolution::Keep)).unwrap();
        assert_eq!(fs::read(repo.0.join("file.txt")).unwrap(), resolved);
        assert_eq!(
            git_bytes(&repo.0, &["show", ":file.txt"]).unwrap(),
            resolved
        );
    }

    struct Repo(PathBuf);
    impl Repo {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "giteye-conflict-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir(&path).unwrap();
            git(&path, &["init", "-b", "main"]);
            git(&path, &["config", "user.name", "Conflict Test"]);
            git(&path, &["config", "user.email", "conflict@example.test"]);
            git(&path, &["config", "commit.gpgsign", "false"]);
            git(&path, &["config", "rerere.enabled", "false"]);
            Self(path)
        }
        fn commit(&self, file: &str, content: &[u8], message: &str) -> String {
            if let Some(parent) = self.0.join(file).parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(self.0.join(file), content).unwrap();
            git(&self.0, &["add", "--", file]);
            git(&self.0, &["commit", "-m", message]);
            git(&self.0, &["rev-parse", "HEAD"])
        }
        fn conflict(base: &[u8], ours: &[u8], theirs: &[u8]) -> Self {
            let repo = Self::new();
            repo.commit("file.txt", base, "Base");
            git(&repo.0, &["switch", "-c", "incoming"]);
            repo.commit("file.txt", theirs, "Incoming");
            git(&repo.0, &["switch", "main"]);
            repo.commit("file.txt", ours, "Current");
            assert_ne!(
                GitCli::run_with_status(&repo.0, &["merge", "--no-edit", "incoming"])
                    .unwrap()
                    .status_code,
                0
            );
            repo
        }
    }
    impl Drop for Repo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn git(repo: &Path, args: &[&str]) -> String {
        GitCli::run(repo, args).unwrap().trim_end().into()
    }
    fn request(
        content: &ConflictContent,
        resolution: ConflictResolution,
    ) -> ConflictResolutionRequest {
        ConflictResolutionRequest {
            operation_id: content.operation_id.clone(),
            file_path: content.file_path.clone(),
            expected_revision: content.revision.clone(),
            resolution,
        }
    }

    #[test]
    fn draft_save_is_unstaged_and_stale_write_preserves_external_edit() {
        let repo = Repo::conflict(b"base\n", b"ours\n", b"theirs\n");
        let content = get_conflict_content(&repo.0, "file.txt").unwrap();
        save_conflict_result(
            &repo.0,
            &request(
                &content,
                ConflictResolution::Text {
                    content: "\u{feff}resolved\r\n".into(),
                    mode: None,
                },
            ),
        )
        .unwrap();
        assert_eq!(
            fs::read(repo.0.join("file.txt")).unwrap(),
            "\u{feff}resolved\r\n".as_bytes()
        );
        assert!(!git(&repo.0, &["ls-files", "--unmerged"]).is_empty());
        let draft = get_conflict_content(&repo.0, "file.txt").unwrap();
        fs::write(repo.0.join("file.txt"), b"external\n").unwrap();
        assert!(mark_conflict_resolved(
            &repo.0,
            &request(
                &draft,
                ConflictResolution::Text {
                    content: "old draft\n".into(),
                    mode: None,
                }
            )
        )
        .is_err());
        assert_eq!(fs::read(repo.0.join("file.txt")).unwrap(), b"external\n");
        assert!(!git(&repo.0, &["ls-files", "--unmerged"]).is_empty());
    }

    #[test]
    fn mark_stages_exact_buffer_and_preserves_original_sides_for_revisit() {
        let repo = Repo::conflict(b"base\n", b"ours\n", b"theirs\n");
        let content = get_conflict_content(&repo.0, "file.txt").unwrap();
        mark_conflict_resolved(
            &repo.0,
            &request(
                &content,
                ConflictResolution::Text {
                    content: "merged\n".into(),
                    mode: None,
                },
            ),
        )
        .unwrap();
        assert!(git(&repo.0, &["ls-files", "--unmerged"]).is_empty());
        assert_eq!(
            git_bytes(&repo.0, &["show", ":file.txt"]).unwrap(),
            b"merged\n"
        );
        let resolved = get_conflict_content(&repo.0, "file.txt").unwrap();
        assert_eq!(resolved.operation_id, content.operation_id);
        assert_eq!(resolved.ours.content.as_deref(), Some("ours\n"));
        assert_eq!(resolved.result.as_deref(), Some("merged\n"));
        assert_ne!(resolved.revision, content.revision);
        mark_conflict_resolved(
            &repo.0,
            &request(
                &resolved,
                ConflictResolution::Text {
                    content: "revisited\n".into(),
                    mode: None,
                },
            ),
        )
        .unwrap();
        assert_eq!(
            git_bytes(&repo.0, &["show", ":file.txt"]).unwrap(),
            b"revisited\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn text_side_choice_stages_the_selected_executable_mode() {
        use std::os::unix::fs::PermissionsExt;

        let repo = Repo::new();
        repo.commit("file.txt", b"base\n", "Base");
        git(&repo.0, &["switch", "-c", "incoming"]);
        fs::write(repo.0.join("file.txt"), b"incoming\n").unwrap();
        fs::set_permissions(repo.0.join("file.txt"), fs::Permissions::from_mode(0o755)).unwrap();
        git(&repo.0, &["add", "--", "file.txt"]);
        git(&repo.0, &["commit", "-m", "Executable incoming"]);
        git(&repo.0, &["switch", "main"]);
        repo.commit("file.txt", b"current\n", "Current");
        assert_ne!(
            GitCli::run_with_status(&repo.0, &["merge", "--no-edit", "incoming"])
                .unwrap()
                .status_code,
            0
        );
        let content = get_conflict_content(&repo.0, "file.txt").unwrap();
        assert_eq!(content.ours.mode.as_deref(), Some("100644"));
        assert_eq!(content.theirs.mode.as_deref(), Some("100755"));
        mark_conflict_resolved(
            &repo.0,
            &request(
                &content,
                ConflictResolution::Text {
                    content: "incoming\n".into(),
                    mode: Some("100755".into()),
                },
            ),
        )
        .unwrap();
        assert!(git(&repo.0, &["ls-files", "-s", "--", "file.txt"]).starts_with("100755 "));
        assert_ne!(
            fs::metadata(repo.0.join("file.txt"))
                .unwrap()
                .permissions()
                .mode()
                & 0o111,
            0
        );
    }

    #[test]
    fn empty_stage_is_present_and_binary_side_is_never_lossy() {
        let repo = Repo::conflict(b"base\n", b"", b"changed\n");
        let content = get_conflict_content(&repo.0, "file.txt").unwrap();
        assert!(content.ours.present);
        assert_eq!(content.ours.content.as_deref(), Some(""));
        mark_conflict_resolved(
            &repo.0,
            &request(
                &content,
                ConflictResolution::Side {
                    side: ConflictSide::Ours,
                },
            ),
        )
        .unwrap();
        assert_eq!(fs::read(repo.0.join("file.txt")).unwrap(), b"");
        let binary = Repo::conflict(b"base\0\n", b"\xffours\0", b"\xfetheirs\0");
        let content = get_conflict_content(&binary.0, "file.txt").unwrap();
        assert_eq!(content.kind, "binary");
        assert!(content.result.is_none());
        mark_conflict_resolved(
            &binary.0,
            &request(
                &content,
                ConflictResolution::Side {
                    side: ConflictSide::Theirs,
                },
            ),
        )
        .unwrap();
        assert_eq!(
            fs::read(binary.0.join("file.txt")).unwrap(),
            b"\xfetheirs\0"
        );
        assert_eq!(
            git_bytes(&binary.0, &["show", ":file.txt"]).unwrap(),
            b"\xfetheirs\0"
        );
    }

    #[test]
    fn non_utf8_and_oversized_stages_refuse_text_replacement() {
        let repo = Repo::conflict(b"base\n", b"\xffours\n", b"\xfetheirs\n");
        let content = get_conflict_content(&repo.0, "file.txt").unwrap();
        assert_eq!(content.kind, "unsupported");
        assert!(save_conflict_result(
            &repo.0,
            &request(
                &content,
                ConflictResolution::Text {
                    content: "replacement".into(),
                    mode: None,
                }
            )
        )
        .is_err());
        let large = vec![b'x'; TEXT_LIMIT + 1];
        let repo = Repo::conflict(b"base\n", &large, b"incoming\n");
        let content = get_conflict_content(&repo.0, "file.txt").unwrap();
        assert_eq!(content.kind, "oversized");
        assert!(content.ours.content.is_none());
        mark_conflict_resolved(
            &repo.0,
            &request(
                &content,
                ConflictResolution::Side {
                    side: ConflictSide::Ours,
                },
            ),
        )
        .unwrap();
        assert_eq!(fs::read(repo.0.join("file.txt")).unwrap(), large);
    }

    #[test]
    fn failed_stage_preparation_leaves_worktree_and_index_unchanged() {
        let repo = Repo::conflict(b"base\n", b"ours\n", b"theirs\n");
        let content = get_conflict_content(&repo.0, "file.txt").unwrap();
        let before = fs::read(repo.0.join("file.txt")).unwrap();
        fs::write(repo.0.join(".gitattributes"), "file.txt filter=broken\n").unwrap();
        git(&repo.0, &["config", "filter.broken.clean", "false"]);
        git(&repo.0, &["config", "filter.broken.required", "true"]);
        assert!(mark_conflict_resolved(
            &repo.0,
            &request(
                &content,
                ConflictResolution::Text {
                    content: "merged".into(),
                    mode: None,
                }
            )
        )
        .is_err());
        assert_eq!(fs::read(repo.0.join("file.txt")).unwrap(), before);
        assert!(!git(&repo.0, &["ls-files", "--unmerged"]).is_empty());
        assert!(!repo.0.join(".git/index.lock").exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_ancestors_are_rejected_and_leaf_targets_are_never_read_or_written() {
        use std::os::unix::fs::symlink;
        let repo = Repo::conflict(b"base\n", b"ours\n", b"theirs\n");
        let outside = Repo::new();
        fs::write(outside.0.join("secret"), b"untouched").unwrap();
        symlink(&outside.0, repo.0.join("escape")).unwrap();
        assert!(get_conflict_content(&repo.0, "escape/secret").is_err());
        let original = get_conflict_content(&repo.0, "file.txt").unwrap();
        fs::remove_file(repo.0.join("file.txt")).unwrap();
        symlink(outside.0.join("secret"), repo.0.join("file.txt")).unwrap();
        assert!(save_conflict_result(
            &repo.0,
            &request(
                &original,
                ConflictResolution::Text {
                    content: "bad".into(),
                    mode: None,
                }
            )
        )
        .is_err());
        let leaf = get_conflict_content(&repo.0, "file.txt").unwrap();
        assert_eq!(leaf.kind, "symlink");
        assert!(leaf.result.is_none());
        mark_conflict_resolved(
            &repo.0,
            &request(
                &leaf,
                ConflictResolution::Side {
                    side: ConflictSide::Ours,
                },
            ),
        )
        .unwrap();
        assert_eq!(fs::read(outside.0.join("secret")).unwrap(), b"untouched");
        assert_eq!(fs::read(repo.0.join("file.txt")).unwrap(), b"ours\n");
        assert!(get_conflict_content(&repo.0, "../outside").is_err());
        assert!(get_conflict_content(&repo.0, ".git/config").is_err());
    }

    #[test]
    fn pointer_resolution_changes_only_parent_index_and_detects_nested_head_changes() {
        let parent = Repo::conflict(b"base\n", b"ours\n", b"theirs\n");
        let nested = parent.0.join("module");
        fs::create_dir(&nested).unwrap();
        git(&nested, &["init", "-b", "main"]);
        git(&nested, &["config", "user.name", "Nested"]);
        git(&nested, &["config", "user.email", "nested@example.test"]);
        git(&nested, &["config", "commit.gpgsign", "false"]);
        fs::write(nested.join("keep"), b"nested").unwrap();
        git(&nested, &["add", "."]);
        git(&nested, &["commit", "-m", "Nested"]);
        let current = git(&nested, &["rev-parse", "HEAD"]);
        let incoming = git(&parent.0, &["rev-parse", "incoming"]);
        GitCli::run_with_input(
            &parent.0,
            &["update-index", "--index-info"],
            &format!("160000 {current} 2\tmodule\n160000 {incoming} 3\tmodule\n"),
        )
        .unwrap();
        fs::write(nested.join("keep"), b"dirty nested").unwrap();
        let content = get_conflict_content(&parent.0, "module").unwrap();
        assert_eq!(content.kind, "submodule");
        assert!(content.submodule.as_ref().unwrap().dirty);
        assert!(save_conflict_result(
            &parent.0,
            &request(
                &content,
                ConflictResolution::Side {
                    side: ConflictSide::Theirs
                }
            )
        )
        .is_err());
        mark_conflict_resolved(
            &parent.0,
            &request(
                &content,
                ConflictResolution::Side {
                    side: ConflictSide::Theirs,
                },
            ),
        )
        .unwrap();
        assert_eq!(git(&nested, &["rev-parse", "HEAD"]), current);
        assert_eq!(fs::read(nested.join("keep")).unwrap(), b"dirty nested");
        assert!(git(&parent.0, &["ls-files", "--stage", "module"])
            .starts_with(&format!("160000 {incoming} 0")));
        let resolved = get_conflict_content(&parent.0, "module").unwrap();
        git(&nested, &["add", "keep"]);
        git(&nested, &["commit", "-m", "Manual nested resolution"]);
        assert!(mark_conflict_resolved(
            &parent.0,
            &request(&resolved, ConflictResolution::SubmoduleHead)
        )
        .is_err());
        let refreshed = get_conflict_content(&parent.0, "module").unwrap();
        mark_conflict_resolved(
            &parent.0,
            &request(&refreshed, ConflictResolution::SubmoduleHead),
        )
        .unwrap();
        let next = git(&nested, &["rev-parse", "HEAD"]);
        assert!(git(&parent.0, &["ls-files", "--stage", "module"])
            .starts_with(&format!("160000 {next} 0")));
    }

    #[test]
    fn regions_use_utf16_offsets_and_preserve_diff3_line_endings() {
        let text = "😀\r\n<<<<<<< current\r\nours\r\n||||||| base\r\nbase\r\n=======\r\ntheirs\r\n>>>>>>> incoming\r\nsuffix";
        let regions = conflict_regions(text);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].start, 4);
        assert_eq!(
            regions[0].end,
            text[..text.find("suffix").unwrap()].encode_utf16().count()
        );
        assert_eq!(regions[0].current, "ours\r\n");
        assert_eq!(regions[0].base.as_deref(), Some("base\r\n"));
        assert_eq!(regions[0].incoming, "theirs\r\n");
        assert!(conflict_regions("<<<<<<< ours\nunfinished").is_empty());
    }
}
