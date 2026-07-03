use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::git::repository_service;
use crate::models::GitStatusFile;
use std::path::Path;

#[derive(Clone, Copy, Debug, Default)]
pub struct CommitOptions {
    pub sign_off: bool,
    pub no_verify: bool,
    pub allow_empty: bool,
}

pub fn get_status(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    Ok(repository_service::get_repository_snapshot(repo_path)?.files)
}

pub fn get_staged_files(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    let snapshot = repository_service::get_repository_snapshot(repo_path)?;
    Ok(snapshot.files.into_iter().filter(|f| f.staged).collect())
}

pub fn get_unstaged_files(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    let snapshot = repository_service::get_repository_snapshot(repo_path)?;
    Ok(snapshot.files.into_iter().filter(|f| f.unstaged).collect())
}

pub fn commit(repo_path: &Path, message: &str, options: CommitOptions) -> Result<(), AppError> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::GitError("Commit message is required".to_string()));
    }

    let mut args = vec!["commit"];
    if options.sign_off {
        args.push("--signoff");
    }
    if options.no_verify {
        args.push("--no-verify");
    }
    if options.allow_empty {
        args.push("--allow-empty");
    }
    args.extend(["-m", message]);

    GitCli::run(repo_path, &args)?;
    Ok(())
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
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-status-{name}-{nonce}"));
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

    fn git_output(cwd: &Path, args: &[&str]) -> String {
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
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn init_repo(path: &Path) {
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
    }

    #[test]
    fn commit_supports_signoff_and_allow_empty() {
        let temp = TestDir::new("commit-options");
        init_repo(&temp.path);

        commit(
            &temp.path,
            "Document empty marker",
            CommitOptions {
                sign_off: true,
                allow_empty: true,
                no_verify: false,
            },
        )
        .expect("commit with signoff");

        assert_eq!(
            git_output(&temp.path, &["log", "-1", "--format=%s"]),
            "Document empty marker"
        );
        assert!(git_output(&temp.path, &["log", "-1", "--format=%b"])
            .contains("Signed-off-by: GitEye Test <test@giteye.local>"));
    }

    #[test]
    fn commit_no_verify_bypasses_failing_hook() {
        let temp = TestDir::new("commit-no-verify");
        init_repo(&temp.path);
        fs::create_dir_all(temp.path.join(".git/hooks")).expect("create hooks");
        fs::write(
            temp.path.join(".git/hooks/pre-commit"),
            "#!/bin/sh\nexit 1\n",
        )
        .expect("write hook");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let hook = temp.path.join(".git/hooks/pre-commit");
            let mut permissions = fs::metadata(&hook).expect("hook metadata").permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&hook, permissions).expect("make hook executable");
        }
        fs::write(temp.path.join("README.md"), "hook bypass\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);

        commit(
            &temp.path,
            "Bypass local hook",
            CommitOptions {
                no_verify: true,
                ..CommitOptions::default()
            },
        )
        .expect("commit with no verify");

        assert_eq!(
            git_output(&temp.path, &["log", "-1", "--format=%s"]),
            "Bypass local hook"
        );
    }
}
