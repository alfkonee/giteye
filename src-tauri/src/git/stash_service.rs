use crate::errors::AppError;
use crate::git::cli::{required_git_arg, GitCli};
use crate::git::{branch_service, diff_service, rebase_service};
use crate::models::{DiffResult, StashEntry, StashFile, StashSection, StashTarget};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};

const STASH_PREFIX: &str = "stash@{";
type RepoLock = Arc<Mutex<()>>;
static STASH_LOCKS: LazyLock<Mutex<HashMap<PathBuf, RepoLock>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// GitEye operations are serialized per shared Git directory. External Git
// processes aren't: validate selectors again immediately before deletion.
pub(crate) fn with_stash_lock<T>(
    repo_path: &Path,
    operation: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let common_dir = GitCli::run(repo_path, &["rev-parse", "--git-common-dir"])?;
    let common_dir = Path::new(common_dir.trim());
    let common_dir = if common_dir.is_absolute() {
        common_dir.to_path_buf()
    } else {
        repo_path.join(common_dir)
    };
    let key = common_dir
        .canonicalize()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let lock = STASH_LOCKS
        .lock()
        .map_err(|error| AppError::IoError(error.to_string()))?
        .entry(key)
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone();
    let _guard = lock.lock().map_err(|error| AppError::IoError(error.to_string()))?;
    operation()
}

fn ensure_no_operation(repo_path: &Path) -> Result<(), AppError> {
    if rebase_service::get_operation_summary(repo_path)?.operation.is_some() {
        return Err(AppError::GitError(
            "Finish or abort the current Git operation and resolve conflicts first.".into(),
        ));
    }
    Ok(())
}

fn ensure_clean(repo_path: &Path) -> Result<(), AppError> {
    if !GitCli::run(repo_path, &["status", "--porcelain", "--untracked-files=all"])?
        .trim()
        .is_empty()
    {
        return Err(AppError::GitError(
            "Working tree and index must be clean before creating a branch from a stash.".into(),
        ));
    }
    Ok(())
}

fn validate_oid(oid: &str) -> Result<&str, AppError> {
    if !matches!(oid.len(), 40 | 64) || !oid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::GitError("A complete stash commit hash is required.".into()));
    }
    Ok(oid)
}

fn stash_parents(repo_path: &Path, oid: &str) -> Result<(String, String, Option<String>), AppError> {
    let oid = validate_oid(oid)?;
    let line = GitCli::run(repo_path, &["rev-list", "--parents", "-n", "1", oid])?;
    let mut parts = line.split_whitespace();
    if parts.next() != Some(oid) {
        return Err(AppError::GitError("The stash commit no longer exists.".into()));
    }
    let base = parts.next().ok_or_else(|| AppError::GitError("Invalid stash parent commit.".into()))?;
    let index = parts.next().ok_or_else(|| AppError::GitError("Invalid stash index commit.".into()))?;
    let untracked = parts.next().map(str::to_string);
    if parts.next().is_some() {
        return Err(AppError::GitError("Invalid stash parent count.".into()));
    }
    Ok((base.to_string(), index.to_string(), untracked))
}

fn verify_listed_selector(entries: &[StashEntry], stash: &StashTarget) -> Result<(), AppError> {
    let expected = validate_oid(&stash.commit_hash)?;
    if parse_stash_index(&stash.name).is_none() {
        return Err(AppError::GitError("Invalid stash selector.".into()));
    }
    let mut matches = entries.iter().filter(|entry| entry.commit_hash == expected);
    if !matches!(matches.next(), Some(entry) if entry.name == stash.name) || matches.next().is_some() {
        return Err(AppError::GitError(format!(
            "{} changed, was removed, or shares its commit with another stash entry. Refresh stashes before continuing.",
            stash.name
        )));
    }
    Ok(())
}

fn verify_selector(repo_path: &Path, stash: &StashTarget) -> Result<(), AppError> {
    verify_listed_selector(&list_stashes(repo_path)?, stash)
}

pub fn list_stashes(repo_path: &Path) -> Result<Vec<StashEntry>, AppError> {
    let output = GitCli::run(
        repo_path,
        &["stash", "list", "--format=%gd%x00%H%x00%h%x00%gs%x00%cI%x00%P"],
    )?;

    Ok(output
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(parse_stash_line)
        .collect())
}

pub fn create_stash(
    repo_path: &Path,
    message: Option<&str>,
    include_untracked: bool,
) -> Result<(), AppError> {
    with_stash_lock(repo_path, || {
        ensure_no_operation(repo_path)?;
        create_stash_unlocked(repo_path, message, include_untracked, &[])
    })
}

fn create_stash_unlocked(
    repo_path: &Path,
    message: Option<&str>,
    include_untracked: bool,
    paths: &[String],
) -> Result<(), AppError> {
    let trimmed_message = message.map(str::trim).filter(|value| !value.is_empty());
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("--include-untracked");
    }
    if let Some(value) = trimmed_message {
        args.extend(["--message", value]);
    }
    if !paths.is_empty() {
        args.push("--");
        args.extend(paths.iter().map(String::as_str));
    }
    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn create_stash_for_paths(
    repo_path: &Path,
    message: Option<&str>,
    include_untracked: bool,
    paths: &[String],
) -> Result<(), AppError> {
    with_stash_lock(repo_path, || {
        ensure_no_operation(repo_path)?;
        create_stash_unlocked(repo_path, message, include_untracked, paths)
    })
}

pub fn apply_stash(repo_path: &Path, stash: &StashTarget) -> Result<(), AppError> {
    with_stash_lock(repo_path, || {
        ensure_no_operation(repo_path)?;
        verify_selector(repo_path, stash)?;
        GitCli::run(repo_path, &["stash", "apply", "--index", &stash.commit_hash])?;
        Ok(())
    })
}

pub fn pop_stash(repo_path: &Path, stash: &StashTarget) -> Result<(), AppError> {
    with_stash_lock(repo_path, || {
        ensure_no_operation(repo_path)?;
        verify_selector(repo_path, stash)?;
        // Apply by immutable OID; a conflict must retain the saved entry.
        GitCli::run(repo_path, &["stash", "apply", "--index", &stash.commit_hash])?;
        drop_verified(repo_path, stash).map_err(|error| AppError::GitError(format!(
            "Stash applied, but the saved entry was retained: {error}"
        )))
    })
}

pub fn preview_stash(repo_path: &Path, stash: &StashTarget) -> Result<Vec<String>, AppError> {
    verify_selector(repo_path, stash)?;
    let output = GitCli::run(
        repo_path,
        &["stash", "show", "--stat", "--include-untracked", &stash.commit_hash],
    )?;
    let lines = non_empty_lines(&output);
    if lines.is_empty() {
        Ok(vec![format!("Stash {} contains no file changes", stash.name)])
    } else {
        Ok(lines)
    }
}

/// `git stash drop` only accepts `stash@{n}` selectors, so an external Git
/// process can renumber entries between verification and deletion. The removal
/// is therefore confirmed afterwards; a wrongly removed entry is stored back
/// with `git stash store` so no unrelated saved work is lost.
pub(crate) fn drop_with_interpose(
    repo_path: &Path,
    stash: &StashTarget,
    interpose: impl FnOnce() -> Result<(), AppError>,
) -> Result<(), AppError> {
    let before = list_stashes(repo_path)?;
    verify_listed_selector(&before, stash)?;
    interpose()?;
    GitCli::run(repo_path, &["stash", "drop", &stash.name])?;
    reconcile_drop(repo_path, stash, &before)
}

pub(crate) fn drop_verified(repo_path: &Path, stash: &StashTarget) -> Result<(), AppError> {
    drop_with_interpose(repo_path, stash, || Ok(()))
}

fn reconcile_drop(
    repo_path: &Path,
    stash: &StashTarget,
    before: &[StashEntry],
) -> Result<(), AppError> {
    let expected = validate_oid(&stash.commit_hash)?;
    let after = list_stashes(repo_path)?;
    let removed: Vec<&StashEntry> = before
        .iter()
        .filter(|entry| after.iter().all(|kept| kept.commit_hash != entry.commit_hash))
        .collect();
    match removed.as_slice() {
        // Exactly the verified entry disappeared; nothing external intervened.
        [entry] if entry.commit_hash == expected => Ok(()),
        [] => Err(AppError::GitError(format!(
            "{} was already removed or never existed. Refresh stashes before continuing.",
            stash.name
        ))),
        removed => {
            for entry in removed {
                let message = format!("restored after external stash change: {}", entry.message);
                GitCli::run(
                    repo_path,
                    &["stash", "store", "-m", &message, &entry.commit_hash],
                )
                .map_err(|error| {
                    AppError::GitError(format!(
                        "Stash list changed while dropping {}, and {} could not be restored automatically. It is not lost; recover it with: git stash store -m restored {}. Original error: {error}",
                        stash.name, entry.name, entry.commit_hash
                    ))
                })?;
            }
            Err(AppError::GitError(format!(
                "The stash list changed while dropping {}. Removed entries were restored, so nothing was lost. Refresh stashes and try again.",
                stash.name
            )))
        }
    }
}

pub fn drop_stash(repo_path: &Path, stash: &StashTarget) -> Result<(), AppError> {
    with_stash_lock(repo_path, || drop_verified(repo_path, stash))
}

pub fn create_branch_from_stash(
    repo_path: &Path,
    name: &str,
    stash: &StashTarget,
) -> Result<(), AppError> {
    with_stash_lock(repo_path, || {
        ensure_no_operation(repo_path)?;
        ensure_clean(repo_path)?;
        verify_selector(repo_path, stash)?;
        let name = required_git_arg(name, "branch name")?;
        GitCli::run(repo_path, &["check-ref-format", "--branch", name])?;
        let (base, _, _) = stash_parents(repo_path, &stash.commit_hash)?;
        // Match git stash branch: switch to the saved first parent, apply --index,
        // consume the entry only if the application succeeds.
        branch_service::create_branch(repo_path, name, true, Some(&base)).map_err(|error| {
            AppError::GitError(format!(
                "Could not create or switch to branch {name}. The stash was retained; check whether the branch was created: {error}"
            ))
        })?;
        GitCli::run(repo_path, &["stash", "apply", "--index", &stash.commit_hash])
            .map_err(|error| AppError::GitError(format!(
                "Branch {name} was created, but applying the stash failed. The saved entry was retained: {error}"
            )))?;
        drop_verified(repo_path, stash).map_err(|error| AppError::GitError(format!(
            "Branch {name} has the restored changes, but the saved stash was retained: {error}"
        )))
    })
}

pub fn get_stash_files(repo_path: &Path, commit_hash: &str) -> Result<Vec<StashFile>, AppError> {
    let (base, index, untracked) = stash_parents(repo_path, commit_hash)?;
    let mut files = Vec::new();
    for (section, from, to) in [
        (StashSection::Staged, base.as_str(), index.as_str()),
        (StashSection::Unstaged, index.as_str(), commit_hash),
    ] {
        let output = GitCli::run(repo_path, &[
            "diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", from, to, "--"
        ])?;
        files.extend(output.split('\0').filter(|path| !path.is_empty()).map(|path| StashFile {
            path: path.to_string(), section
        }));
    }
    if let Some(untracked) = untracked {
        let output = GitCli::run(repo_path, &["ls-tree", "-r", "-z", "--name-only", &untracked])?;
        files.extend(output.split('\0').filter(|path| !path.is_empty()).map(|path| StashFile {
            path: path.to_string(), section: StashSection::Untracked
        }));
    }
    Ok(files)
}

pub fn get_stash_diff(
    repo_path: &Path,
    commit_hash: &str,
    section: StashSection,
    file_path: Option<&str>,
) -> Result<DiffResult, AppError> {
    let (base, index, untracked) = stash_parents(repo_path, commit_hash)?;
    let (from, to) = match section {
        StashSection::Staged => (Some(base.as_str()), index.as_str()),
        StashSection::Unstaged => (Some(index.as_str()), commit_hash),
        StashSection::Untracked => (None, untracked.as_deref().ok_or_else(|| {
            AppError::GitError("This stash has no untracked snapshot.".into())
        })?),
    };
    diff_service::get_stash_snapshot_diff(repo_path, from, to, file_path)
}

fn non_empty_lines(output: &str) -> Vec<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_stash_line(line: &str) -> Option<StashEntry> {
    let mut parts = line.split('\0');
    let name = parts.next()?.to_string();
    let commit_hash = parts.next()?.to_string();
    let short_hash = parts.next()?.to_string();
    let raw_subject = parts.next().unwrap_or_default();
    let timestamp = parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let mut parents = parts.next()?.split_whitespace();
    let base_commit_hash = parents.next()?.to_string();
    let index_commit_hash = Some(parents.next()?.to_string());
    let untracked_commit_hash = parents.next().map(str::to_string);
    if parents.next().is_some() {
        return None;
    }
    let index = parse_stash_index(&name)?;
    let (branch, message) = parse_stash_subject(raw_subject);

    Some(StashEntry {
        name,
        index,
        branch,
        message,
        commit_hash,
        short_hash,
        timestamp,
        base_commit_hash,
        index_commit_hash,
        untracked_commit_hash,
    })
}

fn parse_stash_index(name: &str) -> Option<u32> {
    name.strip_prefix(STASH_PREFIX)
        .and_then(|rest| rest.strip_suffix('}'))
        .and_then(|value| value.parse::<u32>().ok())
}

fn parse_stash_subject(subject: &str) -> (Option<String>, String) {
    let value = subject.trim();
    let Some((prefix, message)) = value.split_once(": ") else {
        return (None, value.to_string());
    };

    let branch = prefix
        .strip_prefix("WIP on ")
        .or_else(|| prefix.strip_prefix("On "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    (branch, message.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestRepo {
        path: PathBuf,
    }

    impl TestRepo {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-stash-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create temp repo dir");
            run_git(&path, &["init"]);
            run_git(&path, &["config", "user.name", "GitEye Test"]);
            run_git(&path, &["config", "user.email", "giteye@example.test"]);
            // Runners set core.autocrlf=true globally; worktree assertions
            // must stay byte-exact on every platform.
            run_git(&path, &["config", "core.autocrlf", "false"]);
            fs::write(path.join("tracked.txt"), "initial\n").expect("write tracked file");
            run_git(&path, &["add", "tracked.txt"]);
            run_git(&path, &["commit", "-m", "initial"]);
            Self { path }
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn run_git(path: &std::path::Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(path)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn parses_wip_stash_line() {
        let entry = parse_stash_line(
            "stash@{2}\0abc123def\0abc123d\0WIP on main: 9fceb02 add settings\02026-06-13T20:00:00+00:00\0base index untracked",
        )
        .expect("valid stash");

        assert_eq!(entry.index, 2);
        assert_eq!(entry.branch.as_deref(), Some("main"));
        assert_eq!(entry.message, "9fceb02 add settings");
        assert_eq!(
            entry.timestamp.as_deref(),
            Some("2026-06-13T20:00:00+00:00")
        );
        assert_eq!(entry.base_commit_hash, "base");
        assert_eq!(entry.index_commit_hash.as_deref(), Some("index"));
        assert_eq!(entry.untracked_commit_hash.as_deref(), Some("untracked"));
    }

    #[test]
    fn preserves_custom_stash_message() {
        let entry =
            parse_stash_line("stash@{0}\0abc\0abc\0manual checkpoint\0\0base index").expect("valid stash");

        assert_eq!(entry.branch, None);
        assert_eq!(entry.message, "manual checkpoint");
        assert_eq!(entry.timestamp, None);
    }

    #[test]
    fn creates_lists_and_drops_stash() {
        let repo = TestRepo::new("roundtrip");
        fs::write(repo.path.join("tracked.txt"), "changed\n").expect("modify tracked file");
        fs::write(repo.path.join("new.txt"), "new\n").expect("write untracked file");

        create_stash(&repo.path, Some("checkpoint"), true).expect("create stash");

        let stashes = list_stashes(&repo.path).expect("list stashes");
        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].name, "stash@{0}");
        assert_eq!(stashes[0].message, "checkpoint");

        let target = StashTarget {
            name: stashes[0].name.clone(),
            commit_hash: stashes[0].commit_hash.clone(),
        };
        let preview = preview_stash(&repo.path, &target).expect("preview stash");
        assert!(preview.iter().any(|line| line.contains("tracked.txt")));
        assert!(preview.iter().any(|line| line.contains("new.txt")));

        drop_stash(&repo.path, &target).expect("drop stash");
        assert!(list_stashes(&repo.path).expect("list stashes").is_empty());
    }

    fn target(entry: &StashEntry) -> StashTarget {
        StashTarget {
            name: entry.name.clone(),
            commit_hash: entry.commit_hash.clone(),
        }
    }

    #[test]
    fn inspect_saved_sections_without_touching_worktree() {
        let repo = TestRepo::new("inspect");
        fs::write(repo.path.join("deleted.txt"), "to delete\n").unwrap();
        run_git(&repo.path, &["add", "deleted.txt"]);
        run_git(&repo.path, &["commit", "-m", "second tracked file"]);
        fs::write(repo.path.join("tracked.txt"), "initial\nstaged\n").unwrap();
        fs::remove_file(repo.path.join("deleted.txt")).unwrap();
        run_git(&repo.path, &["add", "-A"]);
        fs::write(repo.path.join("tracked.txt"), "initial\nstaged\nunstaged\n").unwrap();
        fs::write(repo.path.join("new.txt"), "saved untracked\n").unwrap();
        fs::write(repo.path.join("binary.dat"), [0, 1, 2, 255]).unwrap();
        create_stash(&repo.path, Some("inspect all sections"), true).unwrap();

        let stash = list_stashes(&repo.path).unwrap().remove(0);
        assert_eq!(stash.base_commit_hash.len(), stash.commit_hash.len());
        assert!(stash.index_commit_hash.is_some());
        assert!(stash.untracked_commit_hash.is_some());
        let before = GitCli::run(&repo.path, &["status", "--porcelain"]).unwrap();
        let files = get_stash_files(&repo.path, &stash.commit_hash).unwrap();
        assert!(files.iter().any(|file| file.path == "deleted.txt" && file.section == StashSection::Staged));
        assert!(files.iter().any(|file| file.path == "tracked.txt" && file.section == StashSection::Staged));
        assert!(files.iter().any(|file| file.path == "tracked.txt" && file.section == StashSection::Unstaged));
        assert!(files.iter().any(|file| file.path == "new.txt" && file.section == StashSection::Untracked));
        assert!(files.iter().any(|file| file.path == "binary.dat" && file.section == StashSection::Untracked));
        let staged = get_stash_diff(&repo.path, &stash.commit_hash, StashSection::Staged, Some("tracked.txt")).unwrap();
        assert!(staged.diff_text.contains("+staged"));
        assert!(!staged.diff_text.contains("+unstaged"));
        let removed = get_stash_diff(&repo.path, &stash.commit_hash, StashSection::Staged, Some("deleted.txt")).unwrap();
        assert!(removed.diff_text.contains("-to delete"));
        let unstaged = get_stash_diff(&repo.path, &stash.commit_hash, StashSection::Unstaged, Some("tracked.txt")).unwrap();
        assert!(unstaged.diff_text.contains("+unstaged"));
        let untracked = get_stash_diff(&repo.path, &stash.commit_hash, StashSection::Untracked, Some("new.txt")).unwrap();
        assert!(untracked.diff_text.contains("+saved untracked"));
        let binary = get_stash_diff(&repo.path, &stash.commit_hash, StashSection::Untracked, Some("binary.dat")).unwrap();
        assert!(binary.is_binary);
        assert_eq!(GitCli::run(&repo.path, &["status", "--porcelain"]).unwrap(), before);
        assert!(!repo.path.join("new.txt").exists());
    }

    #[test]
    fn shifted_selector_refuses_every_mutation_without_changing_another_entry() {
        let repo = TestRepo::new("shift");
        fs::write(repo.path.join("tracked.txt"), "first\n").unwrap();
        create_stash(&repo.path, Some("first"), false).unwrap();
        let stale = target(&list_stashes(&repo.path).unwrap()[0]);
        fs::write(repo.path.join("tracked.txt"), "second\n").unwrap();
        create_stash(&repo.path, Some("second"), false).unwrap();
        assert!(apply_stash(&repo.path, &stale).is_err());
        assert!(pop_stash(&repo.path, &stale).is_err());
        assert!(drop_stash(&repo.path, &stale).is_err());
        assert!(create_branch_from_stash(&repo.path, "stale-branch", &stale).is_err());
        assert_eq!(list_stashes(&repo.path).unwrap().len(), 2);
        assert_eq!(GitCli::run(&repo.path, &["status", "--porcelain"]).unwrap(), "");
    }

    #[test]
    fn duplicate_reflog_oid_is_ambiguous_even_if_selector_matches() {
        let repo = TestRepo::new("duplicate");
        fs::write(repo.path.join("tracked.txt"), "saved\n").unwrap();
        create_stash(&repo.path, None, false).unwrap();
        let original = list_stashes(&repo.path).unwrap().remove(0);
        fs::write(repo.path.join("tracked.txt"), "intervening saved work\n").unwrap();
        create_stash(&repo.path, Some("intervening"), false).unwrap();
        run_git(&repo.path, &["stash", "store", "-m", "same object", &original.commit_hash]);
        let duplicate = list_stashes(&repo.path).unwrap();
        assert_eq!(duplicate.len(), 3);
        assert_eq!(duplicate[0].commit_hash, duplicate[2].commit_hash);
        for entry in duplicate.iter().filter(|entry| entry.commit_hash == original.commit_hash) {
            let identity = target(entry);
            assert!(apply_stash(&repo.path, &identity).is_err());
            assert!(pop_stash(&repo.path, &identity).is_err());
            assert!(drop_stash(&repo.path, &identity).is_err());
            assert!(create_branch_from_stash(&repo.path, "ambiguous", &identity).is_err());
        }
        assert_eq!(list_stashes(&repo.path).unwrap().len(), 3);
    }

    #[test]
    fn changed_drop_target_after_successful_apply_retains_original_entry() {
        let repo = TestRepo::new("renumber-after-apply");
        fs::write(repo.path.join("tracked.txt"), "saved\n").unwrap();
        create_stash(&repo.path, None, false).unwrap();
        let original = target(&list_stashes(&repo.path).unwrap()[0]);
        GitCli::run(&repo.path, &["stash", "apply", "--index", &original.commit_hash]).unwrap();
        fs::write(repo.path.join("other.txt"), "new\n").unwrap();
        create_stash(&repo.path, Some("later"), true).unwrap();
        assert!(drop_verified(&repo.path, &original).is_err());
        assert!(list_stashes(&repo.path).unwrap()
            .iter().any(|entry| entry.commit_hash == original.commit_hash));
    }

    #[test]
    fn external_push_between_verification_and_drop_restores_the_wrongly_removed_entry() {
        let repo = TestRepo::new("drop-race-push");
        fs::write(repo.path.join("tracked.txt"), "older\n").unwrap();
        create_stash(&repo.path, Some("older"), false).unwrap();
        fs::write(repo.path.join("tracked.txt"), "newer\n").unwrap();
        create_stash(&repo.path, Some("newer"), false).unwrap();
        // Target the older entry; a concurrent push shifts it to stash@{2},
        // so an unguarded drop of stash@{1} would remove the wrong entry.
        let target = list_stashes(&repo.path).unwrap()
            .into_iter().find(|entry| entry.message == "older").map(|entry| target(&entry)).unwrap();
        drop_with_interpose(&repo.path, &target, || {
            fs::write(repo.path.join("tracked.txt"), "external\n").unwrap();
            create_stash(&repo.path, Some("external"), false)
        }).unwrap_err();
        // The attempted drop removed the wrong entry, which was restored, so
        // every entry including the untouched target must still exist.
        let remaining = list_stashes(&repo.path).unwrap();
        assert!(remaining.iter().any(|entry| entry.commit_hash == target.commit_hash));
        assert_eq!(remaining.len(), 3, "no unrelated entry may be lost: {remaining:?}");
        assert!(remaining.iter().any(|entry| entry.message == "newer"));
        assert!(remaining.iter().any(|entry| entry.message == "external"));
    }

    #[test]
    fn external_target_removal_between_verification_and_drop_fails_without_deleting_others() {
        let repo = TestRepo::new("drop-race-removal");
        fs::write(repo.path.join("tracked.txt"), "older\n").unwrap();
        create_stash(&repo.path, Some("older"), false).unwrap();
        fs::write(repo.path.join("tracked.txt"), "newer\n").unwrap();
        create_stash(&repo.path, Some("newer"), false).unwrap();
        let target = list_stashes(&repo.path).unwrap()
            .into_iter().find(|entry| entry.message == "older").map(|entry| target(&entry)).unwrap();
        let error = drop_with_interpose(&repo.path, &target, || {
            GitCli::run(&repo.path, &["stash", "drop", "stash@{1}"])?;
            Ok(())
        }).unwrap_err();
        assert!(!error.to_string().is_empty(), "{error}");
        let remaining = list_stashes(&repo.path).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].message, "newer");
    }

    #[test]
    fn concurrent_external_changes_restore_every_removed_entry() {
        let repo = TestRepo::new("drop-race-ambiguous");
        fs::write(repo.path.join("tracked.txt"), "older\n").unwrap();
        create_stash(&repo.path, Some("older"), false).unwrap();
        fs::write(repo.path.join("tracked.txt"), "newer\n").unwrap();
        create_stash(&repo.path, Some("newer"), false).unwrap();
        let target = list_stashes(&repo.path).unwrap()
            .into_iter().find(|entry| entry.message == "older").map(|entry| target(&entry)).unwrap();
        let error = drop_with_interpose(&repo.path, &target, || {
            fs::write(repo.path.join("tracked.txt"), "external\n").unwrap();
            create_stash(&repo.path, Some("external"), false)?;
            // The same external process also removed the verified target.
            GitCli::run(&repo.path, &["stash", "drop", "stash@{2}"])?;
            Ok(())
        }).unwrap_err();
        assert!(error.to_string().contains("Refresh stashes"), "{error}");
        let remaining = list_stashes(&repo.path).unwrap();
        assert_eq!(remaining.len(), 3, "every removed entry must be restored: {remaining:?}");
        for message in ["older", "newer", "external"] {
            assert!(remaining.iter().any(|entry| entry.message == message), "{message}");
        }
    }

    #[test]
    fn conflicting_pop_retains_stash_and_exposes_conflicts() {
        let repo = TestRepo::new("pop-conflict");
        fs::write(repo.path.join("tracked.txt"), "saved\n").unwrap();
        create_stash(&repo.path, Some("saved"), false).unwrap();
        let stash = target(&list_stashes(&repo.path).unwrap()[0]);
        fs::write(repo.path.join("tracked.txt"), "committed\n").unwrap();
        run_git(&repo.path, &["add", "tracked.txt"]);
        run_git(&repo.path, &["commit", "-m", "diverge"]);
        assert!(pop_stash(&repo.path, &stash).is_err());
        assert_eq!(list_stashes(&repo.path).unwrap()[0].commit_hash, stash.commit_hash);
        assert!(!GitCli::run(&repo.path, &["ls-files", "-u"]).unwrap().is_empty());
    }

    #[test]
    fn branch_from_stash_restores_index_unstaged_and_untracked_at_original_base() {
        let repo = TestRepo::new("branch");
        let base = GitCli::run(&repo.path, &["rev-parse", "HEAD"]).unwrap().trim().to_string();
        fs::write(repo.path.join("tracked.txt"), "staged\n").unwrap();
        run_git(&repo.path, &["add", "tracked.txt"]);
        fs::write(repo.path.join("tracked.txt"), "staged\nunstaged\n").unwrap();
        fs::write(repo.path.join("new.txt"), "saved\n").unwrap();
        create_stash(&repo.path, Some("checkpoint"), true).unwrap();
        let stash = target(&list_stashes(&repo.path).unwrap()[0]);
        fs::write(repo.path.join("other.txt"), "main advance\n").unwrap();
        run_git(&repo.path, &["add", "other.txt"]);
        run_git(&repo.path, &["commit", "-m", "main advanced"]);
        create_branch_from_stash(&repo.path, "recovered", &stash).unwrap();
        assert_eq!(GitCli::run(&repo.path, &["rev-parse", "HEAD"]).unwrap().trim(), base);
        assert_eq!(GitCli::run(&repo.path, &["branch", "--show-current"]).unwrap().trim(), "recovered");
        assert!(GitCli::run(&repo.path, &["diff", "--cached"]).unwrap().contains("+staged"));
        assert!(GitCli::run(&repo.path, &["diff"]).unwrap().contains("+unstaged"));
        assert_eq!(fs::read_to_string(repo.path.join("new.txt")).unwrap(), "saved\n");
        assert!(list_stashes(&repo.path).unwrap().is_empty());
    }

    #[test]
    fn branch_application_failure_preserves_saved_entry() {
        let repo = TestRepo::new("branch-failure");
        fs::write(repo.path.join("collision.txt"), "saved\n").unwrap();
        create_stash(&repo.path, Some("checkpoint"), true).unwrap();
        let stash = target(&list_stashes(&repo.path).unwrap()[0]);
        fs::write(repo.path.join(".git/info/exclude"), "collision.txt\n").unwrap();
        fs::write(repo.path.join("collision.txt"), "local ignored contents\n").unwrap();
        assert_eq!(GitCli::run(&repo.path, &["status", "--porcelain"]).unwrap(), "");
        let error = create_branch_from_stash(&repo.path, "recovery", &stash).unwrap_err().to_string();
        assert!(error.contains("retained"), "{error}");
        assert_eq!(list_stashes(&repo.path).unwrap()[0].commit_hash, stash.commit_hash);
        assert_eq!(fs::read_to_string(repo.path.join("collision.txt")).unwrap(), "local ignored contents\n");
    }
}
