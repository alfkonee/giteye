use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::{CommitDetails, CommitSummary};
use std::path::Path;

pub fn get_commit_history(
    repo_path: &Path,
    limit: Option<u32>,
) -> Result<Vec<CommitSummary>, AppError> {
    if GitCli::run(repo_path, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }

    let limit_str = limit
        .map(|l| l.to_string())
        .unwrap_or_else(|| "50".to_string());

    let output = GitCli::run(
        repo_path,
        &[
            "log",
            "--max-count",
            &limit_str,
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D",
        ],
    )?;

    let commits: Vec<CommitSummary> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\0').collect();
            if parts.len() < 7 {
                return None;
            }

            let refs_str = parts[6];
            let refs: Vec<String> = if refs_str.is_empty() {
                vec![]
            } else {
                refs_str
                    .split(',')
                    .map(|r| r.trim())
                    .filter(|r| !r.is_empty() && !r.starts_with("tag: "))
                    .map(|r| r.to_string())
                    .collect()
            };

            Some(CommitSummary {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author_name: parts[3].to_string(),
                author_email: parts[4].to_string(),
                timestamp: parts[5].to_string(),
                refs,
            })
        })
        .collect();

    Ok(commits)
}

pub fn get_commit_details(repo_path: &Path, hash: &str) -> Result<CommitDetails, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "show",
            "--format=%H%x00%s%x00%b%x00%an%x00%ae%x00%cn%x00%ce%x00%aI%x00%P",
            "--name-only",
            "--no-renames",
            hash,
        ],
    )?;

    let parts: Vec<&str> = output.splitn(9, '\0').collect();

    if parts.len() < 9 {
        return Err(AppError::CommitNotFound(hash.to_string()));
    }

    let (parents_str, changed_files_str) = parts[8].split_once("\n\n").unwrap_or((parts[8], ""));
    let parents: Vec<String> = parents_str
        .split_whitespace()
        .map(|p| p.to_string())
        .collect();
    let changed_files: Vec<String> = changed_files_str
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    Ok(CommitDetails {
        hash: parts[0].to_string(),
        message: parts[1].to_string(),
        body: {
            let body = parts[2].trim_end_matches('\n');
            if body.is_empty() {
                None
            } else {
                Some(body.to_string())
            }
        },
        author_name: parts[3].to_string(),
        author_email: parts[4].to_string(),
        committer_name: parts[5].to_string(),
        committer_email: parts[6].to_string(),
        timestamp: parts[7].to_string(),
        parents,
        changed_files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
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
            let path = std::env::temp_dir().join(format!("giteye-commit-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create temp dir");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn git(cwd: &Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_repo(path: &Path) {
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
    }

    #[test]
    fn history_returns_empty_for_unborn_repository() {
        let temp = TestDir::new("empty");
        init_repo(&temp.path);

        let history = get_commit_history(&temp.path, Some(10)).expect("history");

        assert!(history.is_empty());
    }

    #[test]
    fn commit_details_load_changed_files() {
        let temp = TestDir::new("details");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git(
            &temp.path,
            &[
                "commit",
                "-m",
                "Initial fixture",
                "-m",
                "Body line one",
                "-m",
                "Body line two",
            ],
        );

        let history = get_commit_history(&temp.path, Some(10)).expect("history");
        let details = get_commit_details(&temp.path, &history[0].hash).expect("details");

        assert_eq!(details.message, "Initial fixture");
        assert_eq!(
            details.body.as_deref(),
            Some("Body line one\n\nBody line two")
        );
        assert_eq!(details.changed_files, vec!["README.md".to_string()]);
        assert_eq!(details.parents.len(), 0);
    }
}
