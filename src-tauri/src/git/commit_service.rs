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
            "--date-order",
            "--max-count",
            &limit_str,
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D%x00%P",
        ],
    )?;

    let commits: Vec<CommitSummary> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\0').collect();
            if parts.len() < 8 {
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

            let parents: Vec<String> = parts[7]
                .split_whitespace()
                .map(|parent| parent.to_string())
                .collect();

            Some(CommitSummary {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author_name: parts[3].to_string(),
                author_email: parts[4].to_string(),
                timestamp: parts[5].to_string(),
                refs,
                parents,
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

    fn git_at(cwd: &Path, args: &[&str], iso_date: &str) {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .env("GIT_AUTHOR_DATE", iso_date)
            .env("GIT_COMMITTER_DATE", iso_date)
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

    #[test]
    fn history_includes_parent_hashes() {
        let temp = TestDir::new("parents");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial fixture"]);

        fs::write(temp.path.join("README.md"), "# fixture\n\nupdated\n").expect("update file");
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Second fixture"]);

        let history = get_commit_history(&temp.path, Some(10)).expect("history");

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].message, "Second fixture");
        assert_eq!(history[0].parents, vec![history[1].hash.clone()]);
        assert!(history[1].parents.is_empty());
    }

    #[test]
    fn history_keeps_recent_side_branch_near_merge() {
        let temp = TestDir::new("date-order");
        init_repo(&temp.path);

        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git_at(
            &temp.path,
            &["commit", "-m", "Initial fixture"],
            "2026-01-01T00:00:00Z",
        );

        git(&temp.path, &["branch", "feature"]);
        fs::write(temp.path.join("main.txt"), "main\n").expect("write main");
        git(&temp.path, &["add", "main.txt"]);
        git_at(
            &temp.path,
            &["commit", "-m", "Main work"],
            "2026-01-02T00:00:00Z",
        );

        git(&temp.path, &["checkout", "feature"]);
        fs::write(temp.path.join("feature.txt"), "feature\n").expect("write feature");
        git(&temp.path, &["add", "feature.txt"]);
        git_at(
            &temp.path,
            &["commit", "-m", "Feature work"],
            "2026-01-04T00:00:00Z",
        );

        git(&temp.path, &["checkout", "main"]);
        git_at(
            &temp.path,
            &["merge", "--no-ff", "feature", "-m", "Merge feature"],
            "2026-01-05T00:00:00Z",
        );

        let messages: Vec<String> = get_commit_history(&temp.path, Some(10))
            .expect("history")
            .into_iter()
            .map(|commit| commit.message)
            .collect();
        let feature_index = messages
            .iter()
            .position(|message| message == "Feature work")
            .expect("feature commit");
        let main_index = messages
            .iter()
            .position(|message| message == "Main work")
            .expect("main commit");

        assert_eq!(messages[0], "Merge feature");
        assert!(
            feature_index < main_index,
            "recent merged branch should stay close to merge: {messages:?}"
        );
    }
}
