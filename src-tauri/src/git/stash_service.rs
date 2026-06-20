use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::StashEntry;
use std::path::Path;

const STASH_PREFIX: &str = "stash@{";

pub fn list_stashes(repo_path: &Path) -> Result<Vec<StashEntry>, AppError> {
    let output = GitCli::run(
        repo_path,
        &["stash", "list", "--format=%gd%x00%H%x00%h%x00%gs%x00%ci"],
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
    let trimmed_message = message.map(str::trim).filter(|value| !value.is_empty());
    let mut args = vec!["stash", "push"];

    if include_untracked {
        args.push("--include-untracked");
    }

    if let Some(value) = trimmed_message {
        args.push("--message");
        args.push(value);
    }

    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn apply_stash(repo_path: &Path, stash_name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["stash", "apply", "--index", stash_name])?;
    Ok(())
}

pub fn pop_stash(repo_path: &Path, stash_name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["stash", "pop", "--index", stash_name])?;
    Ok(())
}

pub fn drop_stash(repo_path: &Path, stash_name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["stash", "drop", stash_name])?;
    Ok(())
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
            "stash@{2}\0abc123def\0abc123d\0WIP on main: 9fceb02 add settings\02026-06-13T20:00:00+00:00",
        )
        .expect("valid stash");

        assert_eq!(entry.index, 2);
        assert_eq!(entry.branch.as_deref(), Some("main"));
        assert_eq!(entry.message, "9fceb02 add settings");
        assert_eq!(
            entry.timestamp.as_deref(),
            Some("2026-06-13T20:00:00+00:00")
        );
    }

    #[test]
    fn preserves_custom_stash_message() {
        let entry =
            parse_stash_line("stash@{0}\0abc\0abc\0manual checkpoint\0").expect("valid stash");

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

        drop_stash(&repo.path, &stashes[0].name).expect("drop stash");
        assert!(list_stashes(&repo.path).expect("list stashes").is_empty());
    }
}
