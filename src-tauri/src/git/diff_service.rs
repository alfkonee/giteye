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
}
