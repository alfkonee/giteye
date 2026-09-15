use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::{IgnoreRuleRequest, IgnoreRuleResult, IgnoreScope};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Appends ignore patterns and optionally updates the selected tracked paths.
///
/// Existing rules do not prevent an explicitly requested index action.
pub fn add_ignore_rules(
    repo_path: &Path,
    request: &IgnoreRuleRequest,
) -> Result<IgnoreRuleResult, AppError> {
    validate_selected_path(&request.path)?;
    let patterns = normalize_patterns(&request.patterns)?;
    let root = repository_root(repo_path)?;
    let target = ignore_file_path(&root, request.scope)?;
    let tracked = if request.affect_tracked {
        let mut tracked = tracked_paths(&root, &request.path)?;
        let directory = tracked.iter().any(|entry| entry.path != request.path)
            || fs::symlink_metadata(root.join(&request.path))
                .map(|metadata| metadata.is_dir())
                .unwrap_or(false);
        if patterns != [exact_pattern(&request.path, directory)] {
            return Err(AppError::GitError(
                "Changing tracked paths requires the exact selected file or folder pattern"
                    .to_string(),
            ));
        }
        validate_tracked_action(&root, &request.path, request.scope, &mut tracked)?;
        tracked
    } else {
        Vec::new()
    };
    let affected: Vec<&TrackedPath> = tracked
        .iter()
        .filter(|entry| request.scope == IgnoreScope::Repository || !entry.skip_worktree)
        .collect();
    let input = nul_paths(&affected);
    if request.scope == IgnoreScope::Repository && !affected.is_empty() {
        remove_cached(&root, &input, true)?;
    }

    let existed = match fs::symlink_metadata(&target) {
        Ok(metadata) if metadata.is_file() => true,
        Ok(_) => {
            return Err(AppError::InvalidPath(format!(
                "Ignore target must be a regular file, not a directory or symlink: {}",
                target.display()
            )));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(AppError::IoError(error.to_string())),
    };
    let existing = if existed {
        fs::read_to_string(&target).map_err(|error| AppError::IoError(error.to_string()))?
    } else {
        String::new()
    };

    let mut known: Vec<String> = existing
        .lines()
        .map(|line| line.trim_end_matches('\r').to_string())
        .filter(|line| !line.trim().is_empty())
        .collect();

    let mut added = Vec::new();
    let mut skipped = Vec::new();
    for pattern in patterns {
        if known.iter().any(|line| line == &pattern) {
            skipped.push(pattern);
        } else {
            known.push(pattern.clone());
            added.push(pattern);
        }
    }

    if !added.is_empty() {
        let newline = if existing.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };
        let mut content = existing.clone();
        if !content.is_empty() && !content.ends_with('\n') {
            content.push_str(newline);
        }
        for pattern in &added {
            content.push_str(pattern);
            content.push_str(newline);
        }

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| AppError::IoError(error.to_string()))?;
        }
        fs::write(&target, content).map_err(|error| AppError::IoError(error.to_string()))?;
    }

    let mutation = if affected.is_empty() {
        Ok(String::new())
    } else {
        match request.scope {
            IgnoreScope::Repository => {
                // The ignore file can itself be selected and staged. Appending
                // rules must not invalidate the staged-content safety check.
                let staged_target = affected.iter().find(|entry| {
                    !added.is_empty() && entry.staged && root.join(&entry.path) == target
                });
                let safety = match staged_target {
                    Some(entry) => validate_staged_content(&root, entry),
                    None => Ok(()),
                };
                safety.and_then(|()| remove_cached(&root, &input, false))
            }
            IgnoreScope::Local => GitCli::run_with_input(
                &root,
                &["update-index", "--skip-worktree", "-z", "--stdin"],
                &input,
            ),
        }
    };
    if let Err(error) = mutation {
        if !added.is_empty() {
            let rollback = if existed {
                fs::write(&target, &existing)
            } else {
                fs::remove_file(&target)
            };
            if let Err(rollback_error) = rollback {
                return Err(AppError::IoError(format!(
                    "{error}; could not restore {}: {rollback_error}",
                    target.display()
                )));
            }
        }
        return Err(error);
    }

    Ok(IgnoreRuleResult {
        file: display_path(&root, &target),
        added,
        skipped,
        affected_tracked: affected.len(),
    })
}

fn validate_selected_path(path: &str) -> Result<(), AppError> {
    crate::git::submodule_service::validate_relative_path(path)?;
    if path.contains(['\0', '\r', '\n'])
        || path.split('/').any(|part| {
            part.is_empty() || part == "." || part == ".." || part.eq_ignore_ascii_case(".git")
        })
        || Path::new(path).components().any(|component| {
            component
                .as_os_str()
                .to_str()
                .is_some_and(|part| part.eq_ignore_ascii_case(".git"))
        })
    {
        return Err(AppError::InvalidPath(path.to_string()));
    }
    Ok(())
}

fn exact_pattern(path: &str, directory: bool) -> String {
    let mut pattern = String::with_capacity(path.len() + 2);
    pattern.push('/');
    for character in path.chars() {
        if matches!(character, '\\' | '*' | '?' | '[' | ']') {
            pattern.push('\\');
        }
        pattern.push(character);
    }
    if directory {
        pattern.push('/');
    } else {
        let trailing_spaces = pattern.len() - pattern.trim_end_matches(' ').len();
        pattern.truncate(pattern.len() - trailing_spaces);
        for _ in 0..trailing_spaces {
            pattern.push_str("\\ ");
        }
    }
    pattern
}

struct TrackedPath {
    path: String,
    object_id: String,
    symlink: bool,
    skip_worktree: bool,
    staged: bool,
}

fn tracked_paths(root: &Path, selected: &str) -> Result<Vec<TrackedPath>, AppError> {
    // GitCli's string helpers decode lossily. Reject non-UTF-8 index paths rather
    // than risk mutating a different path after replacement-character decoding.
    let output = GitCli::command()
        .args([
            "--literal-pathspecs",
            "ls-files",
            "-v",
            "--stage",
            "-z",
            "--",
            selected,
        ])
        .current_dir(root)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(error.to_string())
            }
        })?;
    if !output.status.success() {
        return Err(AppError::GitError(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    let listing = String::from_utf8(output.stdout).map_err(|_| {
        AppError::InvalidPath("Selected folder contains a non-UTF-8 tracked path".to_string())
    })?;
    let mut entries = Vec::new();
    for record in listing.split('\0').filter(|record| !record.is_empty()) {
        let (header, path) = record
            .split_once('\t')
            .ok_or_else(|| AppError::GitError("Invalid index entry".to_string()))?;
        let mut fields = header.split_whitespace();
        let flag = fields.next();
        let mode = fields.next();
        let object_id = fields.next();
        let stage = fields.next();
        if stage != Some("0") {
            return Err(AppError::GitError(
                "Resolve selected path conflicts before ignoring tracked files".to_string(),
            ));
        }
        if mode == Some("160000") {
            return Err(AppError::GitError(
                "Tracked ignore actions do not support submodules".to_string(),
            ));
        }
        if !matches!(mode, Some("100644" | "100755" | "120000"))
            || object_id.is_none()
            || fields.next().is_some()
            || (path != selected
                && !path
                    .strip_prefix(selected)
                    .is_some_and(|suffix| suffix.starts_with('/')))
        {
            return Err(AppError::GitError(
                "Invalid selected index entry".to_string(),
            ));
        }
        entries.push(TrackedPath {
            path: path.to_string(),
            object_id: object_id.unwrap().to_string(),
            symlink: mode == Some("120000"),
            skip_worktree: matches!(flag, Some("S" | "s")),
            staged: false,
        });
    }
    Ok(entries)
}

fn validate_tracked_action(
    root: &Path,
    selected: &str,
    scope: IgnoreScope,
    entries: &mut [TrackedPath],
) -> Result<(), AppError> {
    if entries.is_empty() {
        return Ok(());
    }
    let staged = GitCli::run(
        root,
        &[
            "--literal-pathspecs",
            "diff",
            "--cached",
            "--name-only",
            "--no-renames",
            "-z",
            "--",
            selected,
        ],
    )?;
    if scope == IgnoreScope::Local && !staged.is_empty() {
        return Err(AppError::GitError(
            "Commit or unstage selected changes before using skip-worktree".to_string(),
        ));
    }
    let staged: HashSet<&str> = staged.split('\0').filter(|path| !path.is_empty()).collect();
    for entry in entries {
        entry.staged = staged.contains(entry.path.as_str());
        if scope == IgnoreScope::Local {
            let metadata = fs::symlink_metadata(root.join(&entry.path)).map_err(|error| {
                AppError::GitError(format!(
                    "Cannot hide a missing or inaccessible tracked path {}: {error}",
                    entry.path
                ))
            })?;
            if !metadata.is_file() && !metadata.file_type().is_symlink() {
                return Err(AppError::GitError(format!(
                    "Tracked path is not a file: {}",
                    entry.path
                )));
            }
        } else if entry.staged {
            // Non-force rm normally protects staged data, but missing files and
            // skip-worktree/assume-unchanged bits can bypass its worktree check.
            // Verify unique staged content is actually retained on disk.
            validate_staged_content(root, entry)?;
        }
    }
    Ok(())
}

fn validate_staged_content(root: &Path, entry: &TrackedPath) -> Result<(), AppError> {
    let unsafe_staged = || {
        AppError::GitError(format!(
            "Staged content for {} differs from the working file; commit or unstage it first",
            entry.path
        ))
    };
    let path = root.join(&entry.path);
    let metadata = fs::symlink_metadata(&path).map_err(|_| unsafe_staged())?;
    if entry.symlink != metadata.file_type().is_symlink()
        || (!metadata.is_file() && !metadata.file_type().is_symlink())
    {
        return Err(unsafe_staged());
    }
    let object_id = if entry.symlink {
        let destination = fs::read_link(path).map_err(|_| unsafe_staged())?;
        GitCli::run_with_input(
            root,
            &["hash-object", "--stdin"],
            destination.to_str().ok_or_else(unsafe_staged)?,
        )?
    } else {
        GitCli::run(
            root,
            &[
                "hash-object",
                &format!("--path={}", entry.path),
                "--",
                &entry.path,
            ],
        )?
    };
    if object_id.trim() != entry.object_id {
        return Err(unsafe_staged());
    }
    Ok(())
}

fn nul_paths(entries: &[&TrackedPath]) -> String {
    let mut input = String::new();
    for entry in entries {
        input.push_str(&entry.path);
        input.push('\0');
    }
    input
}

fn remove_cached(root: &Path, input: &str, dry_run: bool) -> Result<String, AppError> {
    let mut args = vec![
        "--literal-pathspecs",
        "rm",
        "--cached",
        "--quiet",
        "--pathspec-from-file=-",
        "--pathspec-file-nul",
    ];
    if dry_run {
        args.push("--dry-run");
    }
    GitCli::run_with_input(root, &args, input)
}

fn normalize_patterns(patterns: &[String]) -> Result<Vec<String>, AppError> {
    let mut normalized = Vec::new();
    for pattern in patterns {
        // Only strip line terminators: trailing spaces can be meaningful when escaped.
        let pattern = pattern.trim_matches(|c| c == '\n' || c == '\r');
        if pattern.trim().is_empty() {
            return Err(AppError::GitError(
                "Ignore pattern cannot be empty".to_string(),
            ));
        }
        if pattern.contains('\n') || pattern.contains('\r') {
            return Err(AppError::GitError(
                "Ignore pattern cannot span multiple lines".to_string(),
            ));
        }
        normalized.push(pattern.to_string());
    }

    if normalized.is_empty() {
        return Err(AppError::GitError(
            "At least one ignore pattern is required".to_string(),
        ));
    }

    Ok(normalized)
}

fn ignore_file_path(repo_path: &Path, scope: IgnoreScope) -> Result<PathBuf, AppError> {
    match scope {
        IgnoreScope::Repository => Ok(repository_root(repo_path)?.join(".gitignore")),
        // Worktrees and submodules keep their real Git directory elsewhere, so ask Git for it.
        IgnoreScope::Local => {
            let git_dir = GitCli::run(repo_path, &["rev-parse", "--absolute-git-dir"])?;
            let git_dir = git_dir.trim();
            if git_dir.is_empty() {
                return Err(AppError::RepositoryNotFound(
                    repo_path.to_string_lossy().to_string(),
                ));
            }
            let info = Path::new(git_dir).join("info");
            match fs::symlink_metadata(&info) {
                Ok(metadata) if !metadata.is_dir() => {
                    return Err(AppError::InvalidPath(format!(
                        "Git info path must be a directory, not a symlink: {}",
                        info.display()
                    )));
                }
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                    return Err(AppError::IoError(error.to_string()));
                }
                _ => {}
            }
            Ok(info.join("exclude"))
        }
    }
}

fn repository_root(repo_path: &Path) -> Result<PathBuf, AppError> {
    let toplevel = GitCli::run(repo_path, &["rev-parse", "--show-toplevel"])?;
    let toplevel = toplevel.trim();
    if toplevel.is_empty() {
        return Err(AppError::RepositoryNotFound(
            repo_path.to_string_lossy().to_string(),
        ));
    }
    Ok(PathBuf::from(toplevel))
}

fn display_path(repo_path: &Path, target: &Path) -> String {
    let root = repository_root(repo_path).unwrap_or_else(|_| repo_path.to_path_buf());
    target
        .strip_prefix(&root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-ignore-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create temp dir");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn init_repo(path: &Path) {
        let output = Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(path)
            .output()
            .expect("run git init");
        assert!(output.status.success(), "git init failed");
    }

    fn request(patterns: &[&str], scope: IgnoreScope) -> IgnoreRuleRequest {
        IgnoreRuleRequest {
            path: "selected".to_string(),
            patterns: patterns.iter().map(|p| p.to_string()).collect(),
            scope,
            affect_tracked: false,
        }
    }

    fn tracked_request(path: &str, pattern: &str, scope: IgnoreScope) -> IgnoreRuleRequest {
        IgnoreRuleRequest {
            path: path.to_string(),
            patterns: vec![pattern.to_string()],
            scope,
            affect_tracked: true,
        }
    }

    fn git(path: &Path, args: &[&str]) -> String {
        GitCli::run(path, args).expect("run fixture git command")
    }

    fn commit_files(path: &Path, files: &[(&str, &str)]) {
        for (name, content) in files {
            let file = path.join(name);
            fs::create_dir_all(file.parent().expect("file parent")).expect("create fixture parent");
            fs::write(file, content).expect("write fixture file");
        }
        git(path, &["add", "--all"]);
        git(
            path,
            &[
                "-c",
                "user.name=Ignore Tests",
                "-c",
                "user.email=ignore@example.com",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-m",
                "Fixture",
            ],
        );
    }

    #[test]
    fn appends_patterns_to_repository_gitignore() {
        let temp = TestDir::new("append");
        init_repo(&temp.path);

        let result = add_ignore_rules(
            &temp.path,
            &request(&["/build/", "*.log"], IgnoreScope::Repository),
        )
        .expect("add ignore rules");

        assert_eq!(result.file, ".gitignore");
        assert_eq!(result.added, vec!["/build/", "*.log"]);
        assert!(result.skipped.is_empty());
        assert_eq!(
            fs::read_to_string(temp.path.join(".gitignore")).expect("read gitignore"),
            "/build/\n*.log\n"
        );
    }

    #[test]
    fn separates_appended_patterns_from_unterminated_last_line() {
        let temp = TestDir::new("no-trailing-newline");
        init_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "node_modules/").expect("seed gitignore");

        add_ignore_rules(&temp.path, &request(&["*.log"], IgnoreScope::Repository))
            .expect("add ignore rules");

        assert_eq!(
            fs::read_to_string(temp.path.join(".gitignore")).expect("read gitignore"),
            "node_modules/\n*.log\n"
        );
    }

    #[test]
    fn skips_patterns_already_present() {
        let temp = TestDir::new("dedupe");
        init_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "*.log\n").expect("seed gitignore");

        let result = add_ignore_rules(
            &temp.path,
            &request(&["*.log", "/dist/", "/dist/"], IgnoreScope::Repository),
        )
        .expect("add ignore rules");

        assert_eq!(result.added, vec!["/dist/"]);
        assert_eq!(result.skipped, vec!["*.log", "/dist/"]);
        assert_eq!(
            fs::read_to_string(temp.path.join(".gitignore")).expect("read gitignore"),
            "*.log\n/dist/\n"
        );
    }

    #[test]
    fn writes_local_patterns_to_info_exclude() {
        let temp = TestDir::new("local");
        init_repo(&temp.path);

        let result = add_ignore_rules(&temp.path, &request(&["/scratch/"], IgnoreScope::Local))
            .expect("add ignore rules");

        assert_eq!(result.file, ".git/info/exclude");
        assert!(fs::read_to_string(temp.path.join(".git/info/exclude"))
            .expect("read exclude")
            .contains("/scratch/"));
        assert!(!temp.path.join(".gitignore").exists());
    }

    #[test]
    fn ignored_path_is_reported_by_git() {
        let temp = TestDir::new("effective");
        init_repo(&temp.path);
        fs::create_dir_all(temp.path.join("build")).expect("create dir");
        fs::write(temp.path.join("build/out.bin"), "binary").expect("write file");

        add_ignore_rules(&temp.path, &request(&["/build/"], IgnoreScope::Repository))
            .expect("add ignore rules");

        let (status, _) = GitCli::run_allowing_statuses(
            &temp.path,
            &["check-ignore", "-q", "--", "build/out.bin"],
            &[0, 1],
        )
        .expect("run check-ignore");
        assert_eq!(status, 0, "pattern should make the path ignored");
    }

    #[test]
    fn preserves_crlf_line_endings() {
        let temp = TestDir::new("crlf");
        init_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "node_modules/\r\n").expect("seed gitignore");

        add_ignore_rules(&temp.path, &request(&["*.log"], IgnoreScope::Repository))
            .expect("add ignore rules");

        assert_eq!(
            fs::read_to_string(temp.path.join(".gitignore")).expect("read gitignore"),
            "node_modules/\r\n*.log\r\n"
        );
    }

    #[test]
    fn rejects_blank_and_multiline_patterns() {
        let temp = TestDir::new("invalid");
        init_repo(&temp.path);

        assert!(add_ignore_rules(&temp.path, &request(&["   "], IgnoreScope::Repository)).is_err());
        assert!(
            add_ignore_rules(&temp.path, &request(&["a\nb"], IgnoreScope::Repository)).is_err()
        );
        assert!(add_ignore_rules(&temp.path, &request(&[], IgnoreScope::Repository)).is_err());
        assert!(!temp.path.join(".gitignore").exists());
    }

    #[test]
    fn shared_folder_untracks_clean_and_modified_files_even_when_rule_exists() {
        let temp = TestDir::new("shared-folder");
        init_repo(&temp.path);
        commit_files(
            &temp.path,
            &[
                ("cache/clean.txt", "clean\n"),
                ("cache/modified.txt", "base\n"),
                ("other.txt", "other\n"),
            ],
        );
        fs::write(temp.path.join("cache/modified.txt"), "local work\n").unwrap();
        fs::write(temp.path.join(".gitignore"), "/cache/\n").unwrap();

        let result = add_ignore_rules(
            &temp.path,
            &tracked_request("cache", "/cache/", IgnoreScope::Repository),
        )
        .unwrap();

        assert_eq!(result.affected_tracked, 2);
        assert!(result.added.is_empty());
        assert_eq!(result.skipped, ["/cache/"]);
        assert_eq!(git(&temp.path, &["ls-files", "-z"]), "other.txt\0");
        assert_eq!(
            git(
                &temp.path,
                &["diff", "--cached", "--name-only", "--diff-filter=D", "-z"]
            ),
            "cache/clean.txt\0cache/modified.txt\0"
        );
        assert_eq!(
            fs::read(temp.path.join("cache/clean.txt")).unwrap(),
            b"clean\n"
        );
        assert_eq!(
            fs::read(temp.path.join("cache/modified.txt")).unwrap(),
            b"local work\n"
        );
        assert_eq!(
            fs::read(temp.path.join(".gitignore")).unwrap(),
            b"/cache/\n"
        );
    }

    #[test]
    fn shared_action_preserves_unique_staged_content_even_with_missing_or_hidden_worktree() {
        for state in ["modified", "missing", "skip-worktree"] {
            let temp = TestDir::new(state);
            init_repo(&temp.path);
            commit_files(&temp.path, &[("config.txt", "base\n")]);
            fs::write(temp.path.join("config.txt"), "unique staged\n").unwrap();
            git(&temp.path, &["add", "--", "config.txt"]);
            if state == "missing" {
                fs::remove_file(temp.path.join("config.txt")).unwrap();
            } else {
                fs::write(temp.path.join("config.txt"), "different local\n").unwrap();
                if state == "skip-worktree" {
                    git(
                        &temp.path,
                        &["update-index", "--skip-worktree", "--", "config.txt"],
                    );
                }
            }
            let index_before = git(&temp.path, &["ls-files", "--stage", "-v", "-z"]);

            assert!(add_ignore_rules(
                &temp.path,
                &tracked_request("config.txt", "/config.txt", IgnoreScope::Repository),
            )
            .is_err());

            assert_eq!(git(&temp.path, &["show", ":config.txt"]), "unique staged\n");
            assert_eq!(
                git(&temp.path, &["ls-files", "--stage", "-v", "-z"]),
                index_before
            );
            assert!(!temp.path.join(".gitignore").exists());
            if state != "missing" {
                assert_eq!(
                    fs::read(temp.path.join("config.txt")).unwrap(),
                    b"different local\n"
                );
            }
        }
    }

    #[test]
    fn shared_action_allows_staged_content_when_retained_on_disk() {
        let temp = TestDir::new("safe-staged");
        init_repo(&temp.path);
        commit_files(&temp.path, &[("config.txt", "base\n")]);
        fs::write(temp.path.join("config.txt"), "staged and local\n").unwrap();
        git(&temp.path, &["add", "--", "config.txt"]);

        let result = add_ignore_rules(
            &temp.path,
            &tracked_request("config.txt", "/config.txt", IgnoreScope::Repository),
        )
        .unwrap();

        assert_eq!(result.affected_tracked, 1);
        assert_eq!(git(&temp.path, &["ls-files", "-z"]), "");
        assert_eq!(
            fs::read(temp.path.join("config.txt")).unwrap(),
            b"staged and local\n"
        );
    }

    #[test]
    fn local_action_hides_changes_without_untracking_or_changing_local_bytes() {
        let temp = TestDir::new("skip-worktree");
        init_repo(&temp.path);
        commit_files(&temp.path, &[("config.txt", "base\n")]);
        fs::write(temp.path.join("config.txt"), "local configuration\n").unwrap();
        let request = tracked_request("config.txt", "/config.txt", IgnoreScope::Local);

        let first = add_ignore_rules(&temp.path, &request).unwrap();

        assert_eq!(first.affected_tracked, 1);
        assert_eq!(git(&temp.path, &["ls-files", "-v", "-z"]), "S config.txt\0");
        assert_eq!(git(&temp.path, &["show", ":config.txt"]), "base\n");
        assert_eq!(
            git(&temp.path, &["diff", "--name-only", "--", "config.txt"]),
            ""
        );
        assert_eq!(
            fs::read(temp.path.join("config.txt")).unwrap(),
            b"local configuration\n"
        );

        let repeated = add_ignore_rules(&temp.path, &request).unwrap();
        assert_eq!(repeated.affected_tracked, 0);
        assert!(repeated.added.is_empty());
        assert_eq!(repeated.skipped, ["/config.txt"]);
    }

    #[test]
    fn local_action_rejects_staged_and_missing_files_before_writing_rules() {
        for state in ["staged", "missing"] {
            let temp = TestDir::new(state);
            init_repo(&temp.path);
            commit_files(&temp.path, &[("config.txt", "base\n")]);
            if state == "staged" {
                fs::write(temp.path.join("config.txt"), "staged\n").unwrap();
                git(&temp.path, &["add", "--", "config.txt"]);
            } else {
                fs::remove_file(temp.path.join("config.txt")).unwrap();
            }
            let exclude = fs::read(temp.path.join(".git/info/exclude")).unwrap();
            let index = git(&temp.path, &["ls-files", "--stage", "-v", "-z"]);

            assert!(add_ignore_rules(
                &temp.path,
                &tracked_request("config.txt", "/config.txt", IgnoreScope::Local),
            )
            .is_err());

            assert_eq!(
                fs::read(temp.path.join(".git/info/exclude")).unwrap(),
                exclude
            );
            assert_eq!(git(&temp.path, &["ls-files", "--stage", "-v", "-z"]), index);
        }
    }

    #[test]
    fn rules_only_keeps_tracked_changes_visible_in_both_scopes() {
        for scope in [IgnoreScope::Repository, IgnoreScope::Local] {
            let temp = TestDir::new("rules-only");
            init_repo(&temp.path);
            commit_files(&temp.path, &[("config.txt", "base\n")]);
            fs::write(temp.path.join("config.txt"), "local\n").unwrap();
            let mut request = tracked_request("config.txt", "/config.txt", scope);
            request.affect_tracked = false;
            let index = git(&temp.path, &["ls-files", "--stage", "-v", "-z"]);

            let result = add_ignore_rules(&temp.path, &request).unwrap();

            assert_eq!(result.affected_tracked, 0);
            assert_eq!(git(&temp.path, &["ls-files", "--stage", "-v", "-z"]), index);
            assert_eq!(
                git(&temp.path, &["diff", "--name-only", "-z"]),
                "config.txt\0"
            );
            assert_eq!(fs::read(temp.path.join("config.txt")).unwrap(), b"local\n");
        }
    }

    #[test]
    fn tracked_actions_treat_pathspec_metacharacters_and_options_literally() {
        for scope in [IgnoreScope::Repository, IgnoreScope::Local] {
            let temp = TestDir::new("literal");
            init_repo(&temp.path);
            commit_files(
                &temp.path,
                &[
                    ("-draft[1].log", "selected\n"),
                    ("-draft1.log", "unrelated\n"),
                ],
            );

            let result = add_ignore_rules(
                &temp.path,
                &tracked_request("-draft[1].log", r"/-draft\[1\].log", scope),
            )
            .unwrap();

            assert_eq!(result.affected_tracked, 1);
            assert_eq!(
                fs::read(temp.path.join("-draft[1].log")).unwrap(),
                b"selected\n"
            );
            assert_eq!(git(&temp.path, &["show", ":-draft1.log"]), "unrelated\n");
            let expected = if scope == IgnoreScope::Repository {
                "H -draft1.log\0"
            } else {
                "H -draft1.log\0S -draft[1].log\0"
            };
            assert_eq!(git(&temp.path, &["ls-files", "-v", "-z"]), expected);
        }
    }

    #[cfg(unix)]
    #[test]
    fn shared_folder_handles_nul_delimited_descendants_and_escaped_trailing_spaces() {
        let temp = TestDir::new("unusual");
        init_repo(&temp.path);
        commit_files(
            &temp.path,
            &[
                ("cache[1]/line\nbreak", "newline\n"),
                ("cache[1]/tab\tname", "tab\n"),
                (":(glob)*?.txt ", "literal\n"),
            ],
        );
        let folder = add_ignore_rules(
            &temp.path,
            &tracked_request("cache[1]", r"/cache\[1\]/", IgnoreScope::Repository),
        )
        .unwrap();
        let file = add_ignore_rules(
            &temp.path,
            &tracked_request(
                ":(glob)*?.txt ",
                r"/:(glob)\*\?.txt\ ",
                IgnoreScope::Repository,
            ),
        )
        .unwrap();

        assert_eq!(folder.affected_tracked, 2);
        assert_eq!(file.affected_tracked, 1);
        assert_eq!(git(&temp.path, &["ls-files", "-z"]), "");
        assert_eq!(
            fs::read(temp.path.join("cache[1]/line\nbreak")).unwrap(),
            b"newline\n"
        );
        assert_eq!(
            fs::read(temp.path.join("cache[1]/tab\tname")).unwrap(),
            b"tab\n"
        );
        assert_eq!(
            fs::read(temp.path.join(":(glob)*?.txt ")).unwrap(),
            b"literal\n"
        );
        let (status, _) = GitCli::run_allowing_statuses(
            &temp.path,
            &["check-ignore", "-q", "--", "./:(glob)*?.txt "],
            &[0, 1],
        )
        .unwrap();
        assert_eq!(status, 0);
    }

    #[test]
    fn local_mutation_failure_restores_existing_or_absent_ignore_file() {
        for existing in [true, false] {
            let temp = TestDir::new("rollback");
            init_repo(&temp.path);
            commit_files(&temp.path, &[("config.txt", "base\n")]);
            let exclude = temp.path.join(".git/info/exclude");
            if existing {
                fs::write(&exclude, "existing\r\n").unwrap();
            } else {
                fs::remove_file(&exclude).unwrap();
            }
            fs::write(temp.path.join(".git/index.lock"), "locked").unwrap();

            assert!(add_ignore_rules(
                &temp.path,
                &tracked_request("config.txt", "/config.txt", IgnoreScope::Local),
            )
            .is_err());

            if existing {
                assert_eq!(fs::read(&exclude).unwrap(), b"existing\r\n");
            } else {
                assert!(!exclude.exists());
            }
            assert_eq!(git(&temp.path, &["ls-files", "-v", "-z"]), "H config.txt\0");
            assert_eq!(fs::read(temp.path.join("config.txt")).unwrap(), b"base\n");
        }
    }

    #[test]
    fn selecting_staged_ignore_file_rolls_back_appended_rule_and_preserves_index() {
        let temp = TestDir::new("ignore-self");
        init_repo(&temp.path);
        commit_files(&temp.path, &[(".gitignore", "base\n")]);
        fs::write(temp.path.join(".gitignore"), "base\nstaged\n").unwrap();
        git(&temp.path, &["add", "--", ".gitignore"]);
        git(
            &temp.path,
            &["update-index", "--skip-worktree", "--", ".gitignore"],
        );

        assert!(add_ignore_rules(
            &temp.path,
            &tracked_request(".gitignore", "/.gitignore", IgnoreScope::Repository),
        )
        .is_err());

        assert_eq!(git(&temp.path, &["show", ":.gitignore"]), "base\nstaged\n");
        assert_eq!(
            fs::read(temp.path.join(".gitignore")).unwrap(),
            b"base\nstaged\n"
        );
    }

    #[test]
    fn rejects_unsafe_selection_and_broad_pattern_without_mutation() {
        let temp = TestDir::new("unsafe");
        init_repo(&temp.path);
        commit_files(&temp.path, &[("config.txt", "base\n")]);
        for path in [
            "",
            ".",
            "../outside",
            "/absolute",
            ".git/config",
            "folder/../config.txt",
        ] {
            assert!(add_ignore_rules(
                &temp.path,
                &tracked_request(path, "/config.txt", IgnoreScope::Repository),
            )
            .is_err());
        }
        assert!(add_ignore_rules(
            &temp.path,
            &tracked_request("config.txt", "*.txt", IgnoreScope::Repository),
        )
        .is_err());
        assert!(!temp.path.join(".gitignore").exists());
        assert_eq!(git(&temp.path, &["ls-files", "-v", "-z"]), "H config.txt\0");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlink_ignore_target_without_changing_its_destination() {
        let temp = TestDir::new("symlink");
        init_repo(&temp.path);
        commit_files(&temp.path, &[("config.txt", "base\n")]);
        let outside = TestDir::new("outside");
        fs::write(outside.path.join("rules"), "private\n").unwrap();
        std::os::unix::fs::symlink(outside.path.join("rules"), temp.path.join(".gitignore"))
            .unwrap();

        assert!(add_ignore_rules(
            &temp.path,
            &tracked_request("config.txt", "/config.txt", IgnoreScope::Repository),
        )
        .is_err());

        assert_eq!(fs::read(outside.path.join("rules")).unwrap(), b"private\n");
        assert_eq!(git(&temp.path, &["ls-files", "-v", "-z"]), "H config.txt\0");
    }

    #[test]
    fn conflicts_and_gitlinks_reject_the_entire_folder_action() {
        for kind in ["conflict", "gitlink"] {
            for scope in [IgnoreScope::Repository, IgnoreScope::Local] {
                let temp = TestDir::new(kind);
                init_repo(&temp.path);
                commit_files(
                    &temp.path,
                    &[("cache/clean", "clean\n"), ("cache/entry", "base\n")],
                );
                if kind == "conflict" {
                    let object_id = git(&temp.path, &["rev-parse", "HEAD:cache/entry"]);
                    let object_id = object_id.trim();
                    let input = format!(
                        "0 {}\tcache/entry\n100644 {object_id} 1\tcache/entry\n100644 {object_id} 2\tcache/entry\n",
                        "0".repeat(object_id.len()),
                    );
                    GitCli::run_with_input(&temp.path, &["update-index", "--index-info"], &input)
                        .unwrap();
                } else {
                    let commit = git(&temp.path, &["rev-parse", "HEAD"]);
                    git(
                        &temp.path,
                        &[
                            "update-index",
                            "--add",
                            "--cacheinfo",
                            "160000",
                            commit.trim(),
                            "cache/module",
                        ],
                    );
                }
                let index = git(&temp.path, &["ls-files", "--stage", "-v", "-z"]);
                let exclude = fs::read(temp.path.join(".git/info/exclude")).unwrap();

                assert!(
                    add_ignore_rules(&temp.path, &tracked_request("cache", "/cache/", scope),)
                        .is_err()
                );

                assert_eq!(git(&temp.path, &["ls-files", "--stage", "-v", "-z"]), index);
                assert!(!temp.path.join(".gitignore").exists());
                assert_eq!(
                    fs::read(temp.path.join(".git/info/exclude")).unwrap(),
                    exclude
                );
                assert_eq!(fs::read(temp.path.join("cache/clean")).unwrap(), b"clean\n");
                assert_eq!(fs::read(temp.path.join("cache/entry")).unwrap(), b"base\n");
            }
        }
    }
}
