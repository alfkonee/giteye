use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::DiffResult;
use std::path::{Component, Path};
use std::process::Command;

fn count_diff_stats(diff_text: &str) -> (u32, u32) {
    let additions = diff_text
        .lines()
        .filter(|l| l.starts_with('+') && !l.starts_with("+++"))
        .count() as u32;
    let deletions = diff_text
        .lines()
        .filter(|l| l.starts_with('-') && !l.starts_with("---"))
        .count() as u32;
    (additions, deletions)
}

fn validate_repo_relative_file_path(file_path: &str) -> Result<(), AppError> {
    if file_path.is_empty() {
        return Err(AppError::InvalidPath(
            "file path cannot be empty".to_string(),
        ));
    }

    let path = Path::new(file_path);
    if path.is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "file path must be relative to the repository: {file_path}"
        )));
    }

    for component in path.components() {
        match component {
            Component::ParentDir => {
                return Err(AppError::InvalidPath(format!(
                    "file path cannot escape the repository: {file_path}"
                )));
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::InvalidPath(format!(
                    "file path must be relative to the repository: {file_path}"
                )));
            }
            Component::CurDir | Component::Normal(_) => {}
        }
    }

    Ok(())
}

fn ensure_existing_path_inside_repo(repo_path: &Path, file_path: &str) -> Result<(), AppError> {
    validate_repo_relative_file_path(file_path)?;

    let repo_root = repo_path
        .canonicalize()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    let candidate = repo_path
        .join(file_path)
        .canonicalize()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;

    if !candidate.starts_with(&repo_root) {
        return Err(AppError::InvalidPath(format!(
            "file path cannot escape the repository: {file_path}"
        )));
    }

    Ok(())
}

pub fn get_file_diff(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<DiffResult, AppError> {
    validate_repo_relative_file_path(file_path)?;

    let diff_text = if staged {
        GitCli::run(repo_path, &["diff", "--cached", "--", file_path])?
    } else {
        let tracked_diff = GitCli::run(repo_path, &["diff", "--", file_path])?;
        if tracked_diff.is_empty() && is_untracked(repo_path, file_path)? {
            ensure_existing_path_inside_repo(repo_path, file_path)?;
            untracked_file_diff(repo_path, file_path)?
        } else {
            tracked_diff
        }
    };

    let is_binary = diff_text.contains("Binary files");
    let (additions, deletions) = count_diff_stats(&diff_text);

    Ok(DiffResult {
        file_path: file_path.to_string(),
        old_file_path: None,
        diff_text,
        additions,
        deletions,
        is_binary,
    })
}

fn is_untracked(repo_path: &Path, file_path: &str) -> Result<bool, AppError> {
    let output = Command::new("git")
        .args(["ls-files", "--error-unmatch", "--", file_path])
        .current_dir(repo_path)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(error.to_string())
            }
        })?;

    Ok(!output.status.success())
}

fn untracked_file_diff(repo_path: &Path, file_path: &str) -> Result<String, AppError> {
    let output = Command::new("git")
        .args(["diff", "--no-index", "--", "/dev/null", file_path])
        .current_dir(repo_path)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(error.to_string())
            }
        })?;

    if output.status.success() || output.status.code() == Some(1) {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::GitError(stderr.trim().to_string()))
    }
}

pub fn get_commit_diff(repo_path: &Path, hash: &str) -> Result<DiffResult, AppError> {
    let diff_text = GitCli::run(repo_path, &["show", "--format=", hash])?;

    let is_binary = diff_text.contains("Binary files");
    let (additions, deletions) = count_diff_stats(&diff_text);

    Ok(DiffResult {
        file_path: hash.to_string(),
        old_file_path: None,
        diff_text,
        additions,
        deletions,
        is_binary,
    })
}

pub fn list_commit_range_files(
    repo_path: &Path,
    base_hash: &str,
    target_hash: &str,
) -> Result<Vec<String>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "diff",
            "--find-renames",
            "--name-only",
            "--no-ext-diff",
            base_hash,
            target_hash,
        ],
    )?;

    Ok(output
        .lines()
        .filter(|path| !path.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

fn old_file_path_for_range(
    repo_path: &Path,
    base_hash: &str,
    target_hash: &str,
    file_path: &str,
) -> Result<Option<String>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "diff",
            "--name-status",
            "--find-renames",
            "-z",
            "--no-ext-diff",
            base_hash,
            target_hash,
        ],
    )?;
    let mut fields = output.split('\0');

    while let Some(status) = fields.next() {
        if status.is_empty() {
            break;
        }

        let Some(old_path) = fields.next() else {
            break;
        };
        if !status.starts_with('R') {
            continue;
        }

        let Some(new_path) = fields.next() else {
            break;
        };
        if new_path == file_path {
            return Ok(Some(old_path.to_string()));
        }
    }

    Ok(None)
}

pub fn get_commit_range_diff(
    repo_path: &Path,
    base_hash: &str,
    target_hash: &str,
    file_path: &str,
) -> Result<DiffResult, AppError> {
    validate_repo_relative_file_path(file_path)?;
    let old_file_path = old_file_path_for_range(repo_path, base_hash, target_hash, file_path)?;
    let mut args = vec![
        "diff",
        "--no-ext-diff",
        "--find-renames",
        base_hash,
        target_hash,
        "--",
        file_path,
    ];
    if let Some(old_path) = old_file_path.as_deref() {
        args.push(old_path);
    }
    let diff_text = GitCli::run(repo_path, &args)?;
    let is_binary = diff_text.contains("Binary files");
    let (additions, deletions) = count_diff_stats(&diff_text);

    Ok(DiffResult {
        file_path: file_path.to_string(),
        old_file_path,
        diff_text,
        additions,
        deletions,
        is_binary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-diff-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create test dir");
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

    #[test]
    fn unstaged_untracked_file_diff_shows_file_contents() {
        let temp = TestDir::new("untracked");
        git(&temp.path, &["init", "-b", "main"]);
        fs::write(temp.path.join("new.txt"), "hello\nworld\n").expect("write untracked file");

        let diff = get_file_diff(&temp.path, "new.txt", false).expect("untracked diff");

        assert!(diff.diff_text.contains("diff --git"));
        assert!(diff.diff_text.contains("+++ b/new.txt"));
        assert!(diff.diff_text.contains("+hello"));
        assert_eq!(diff.additions, 2);
        assert_eq!(diff.deletions, 0);
    }

    #[test]
    fn commit_range_diff_lists_and_compares_changed_files() {
        let temp = TestDir::new("commit-range");
        git(&temp.path, &["init", "-b", "main"]);
        git(&temp.path, &["config", "user.name", "GitEye Test"]);
        git(&temp.path, &["config", "user.email", "test@giteye.local"]);
        fs::write(temp.path.join("note.txt"), "before\n").expect("write initial file");
        git(&temp.path, &["add", "note.txt"]);
        git(&temp.path, &["commit", "-m", "initial"]);
        fs::write(temp.path.join("note.txt"), "after\n").expect("write updated file");
        fs::write(temp.path.join("new.txt"), "new file\n").expect("write added file");
        git(&temp.path, &["add", "note.txt", "new.txt"]);
        git(&temp.path, &["commit", "-m", "update"]);

        let files =
            list_commit_range_files(&temp.path, "HEAD~1", "HEAD").expect("list changed files");
        let diff = get_commit_range_diff(&temp.path, "HEAD~1", "HEAD", "note.txt")
            .expect("compare selected file");

        assert_eq!(files, ["new.txt", "note.txt"]);
        assert_eq!(diff.file_path, "note.txt");
        assert!(diff.diff_text.contains("-before"));
        assert!(diff.diff_text.contains("+after"));
        assert!(!diff.diff_text.contains("new file"));
        assert_eq!(diff.additions, 1);
        assert_eq!(diff.deletions, 1);
    }

    #[test]
    fn commit_range_diff_reports_renamed_file_path() {
        let temp = TestDir::new("commit-range-rename");
        git(&temp.path, &["init", "-b", "main"]);
        git(&temp.path, &["config", "user.name", "GitEye Test"]);
        git(&temp.path, &["config", "user.email", "test@giteye.local"]);
        fs::write(temp.path.join("old-name.txt"), "unchanged\n").expect("write initial file");
        git(&temp.path, &["add", "old-name.txt"]);
        git(&temp.path, &["commit", "-m", "initial"]);
        git(&temp.path, &["mv", "old-name.txt", "new-name.txt"]);
        git(&temp.path, &["commit", "-m", "rename"]);

        let diff = get_commit_range_diff(&temp.path, "HEAD~1", "HEAD", "new-name.txt")
            .expect("compare renamed file");

        assert_eq!(diff.file_path, "new-name.txt");
        assert_eq!(diff.old_file_path.as_deref(), Some("old-name.txt"));
        assert!(diff.diff_text.contains("rename from old-name.txt"));
    }

    #[test]
    fn file_diff_rejects_absolute_paths() {
        let temp = TestDir::new("absolute-path");
        let repo = temp.path.join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        git(&repo, &["init", "-b", "main"]);

        let outside = temp.path.join("outside.txt");
        fs::write(&outside, "secret\n").expect("write outside file");

        let error = get_file_diff(&repo, outside.to_str().expect("utf-8 outside path"), false)
            .expect_err("absolute path rejected");

        assert!(matches!(error, AppError::InvalidPath(_)));
    }

    #[test]
    fn file_diff_rejects_parent_traversal_paths() {
        let temp = TestDir::new("parent-traversal");
        let repo = temp.path.join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        git(&repo, &["init", "-b", "main"]);
        fs::write(temp.path.join("outside.txt"), "secret\n").expect("write outside file");

        let error =
            get_file_diff(&repo, "../outside.txt", false).expect_err("parent traversal rejected");

        assert!(matches!(error, AppError::InvalidPath(_)));
    }

    #[cfg(unix)]
    #[test]
    fn file_diff_rejects_untracked_symlink_escape() {
        let temp = TestDir::new("symlink-escape");
        let repo = temp.path.join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        git(&repo, &["init", "-b", "main"]);

        let outside = temp.path.join("outside.txt");
        fs::write(&outside, "secret\n").expect("write outside file");
        std::os::unix::fs::symlink(&outside, repo.join("outside-link.txt"))
            .expect("create symlink");

        let error =
            get_file_diff(&repo, "outside-link.txt", false).expect_err("symlink escape rejected");

        assert!(matches!(error, AppError::InvalidPath(_)));
    }
}
