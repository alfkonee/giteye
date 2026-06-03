use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::RepositoryInfo;
use std::path::Path;
use std::process::Command;

pub fn get_repository_info(path: &Path) -> Result<RepositoryInfo, AppError> {
    let name = GitCli::repo_name_from_path(path);

    let current_branch = GitCli::run(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .or_else(|_| GitCli::run(path, &["symbolic-ref", "--short", "HEAD"]))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let head_commit = GitCli::run(path, &["rev-parse", "HEAD"])
        .map(|s| Some(s.trim().to_string()))
        .unwrap_or(None);

    let is_clean = GitCli::run(path, &["status", "--porcelain"])
        .map(|s| s.trim().is_empty())
        .unwrap_or(false);

    Ok(RepositoryInfo {
        path: path.to_string_lossy().to_string(),
        name,
        current_branch,
        is_clean,
        head_commit,
    })
}

pub fn init_repository(path: &Path) -> Result<RepositoryInfo, AppError> {
    std::fs::create_dir_all(path).map_err(|e| AppError::IoError(e.to_string()))?;
    let output = Command::new("git")
        .args(["init", "-b", "main"])
        .current_dir(path)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(e.to_string())
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::GitError(stderr.trim().to_string()));
    }

    get_repository_info(path)
}

pub fn clone_repository(url: &str, destination: &Path) -> Result<RepositoryInfo, AppError> {
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let Some(name) = destination.file_name().and_then(|value| value.to_str()) else {
        return Err(AppError::InvalidPath(
            destination.to_string_lossy().to_string(),
        ));
    };

    let output = Command::new("git")
        .args(["clone", url, name])
        .current_dir(parent)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(e.to_string())
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::GitError(stderr.trim().to_string()));
    }

    get_repository_info(destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
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
            let path = std::env::temp_dir().join(format!("giteye-{name}-{nonce}"));
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

    fn create_source_repo(path: &Path) {
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
        fs::write(path.join("README.md"), "# source\n").expect("write source file");
        git(path, &["add", "README.md"]);
        git(path, &["commit", "-m", "Initial commit"]);
    }

    #[test]
    fn init_repository_creates_git_repo_and_returns_info() {
        let temp = TestDir::new("init");
        let repo_path = temp.path.join("new-repo");

        let info = init_repository(&repo_path).expect("init repository");

        assert_eq!(info.name, "new-repo");
        assert_eq!(info.path, repo_path.to_string_lossy());
        assert!(repo_path.join(".git").is_dir());
        assert_eq!(info.current_branch, "main");
        assert!(info.is_clean);
        assert!(info.head_commit.is_none());
    }

    #[test]
    fn clone_repository_clones_source_and_returns_info() {
        let temp = TestDir::new("clone");
        let source = temp.path.join("source");
        let destination = temp.path.join("destination");
        fs::create_dir_all(&source).expect("create source");
        create_source_repo(&source);

        let info = clone_repository(source.to_str().expect("source path"), &destination)
            .expect("clone repository");

        assert_eq!(info.name, "destination");
        assert_eq!(info.path, destination.to_string_lossy());
        assert!(destination.join(".git").is_dir());
        assert_eq!(info.current_branch, "main");
        assert!(info.is_clean);
        assert!(info.head_commit.is_some());
    }
}
