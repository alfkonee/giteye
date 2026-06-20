use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::{GitCredentialConfig, GitIdentity};
use std::path::Path;
use std::process::Command;

pub fn get_git_identity(repo_path: &Path) -> Result<GitIdentity, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--is-inside-work-tree"])?;

    Ok(GitIdentity {
        local_name: optional_config(repo_path, &["config", "--local", "--get", "user.name"]),
        local_email: optional_config(repo_path, &["config", "--local", "--get", "user.email"]),
        global_name: optional_config(repo_path, &["config", "--global", "--get", "user.name"]),
        global_email: optional_config(repo_path, &["config", "--global", "--get", "user.email"]),
        effective_name: optional_config(repo_path, &["config", "--get", "user.name"]),
        effective_email: optional_config(repo_path, &["config", "--get", "user.email"]),
    })
}

pub fn set_git_identity(
    repo_path: &Path,
    name: Option<&str>,
    email: Option<&str>,
) -> Result<GitIdentity, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--is-inside-work-tree"])?;
    set_local_config(repo_path, "user.name", name)?;
    set_local_config(repo_path, "user.email", email)?;
    get_git_identity(repo_path)
}

pub fn get_git_credential_config(repo_path: &Path) -> Result<GitCredentialConfig, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--is-inside-work-tree"])?;

    Ok(GitCredentialConfig {
        local_helpers: list_config(
            repo_path,
            &["config", "--local", "--get-all", "credential.helper"],
        ),
        global_helpers: list_config(
            repo_path,
            &["config", "--global", "--get-all", "credential.helper"],
        ),
        effective_helpers: list_config(repo_path, &["config", "--get-all", "credential.helper"]),
    })
}

pub fn set_git_credential_helper(
    repo_path: &Path,
    helper: Option<&str>,
) -> Result<GitCredentialConfig, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--is-inside-work-tree"])?;
    set_local_credential_helper(repo_path, helper)?;
    get_git_credential_config(repo_path)
}

fn list_config(repo_path: &Path, args: &[&str]) -> Vec<String> {
    let output = match Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn optional_config(repo_path: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn set_local_config(repo_path: &Path, key: &str, value: Option<&str>) -> Result<(), AppError> {
    match value.map(str::trim) {
        Some(value) if !value.is_empty() => {
            GitCli::run(repo_path, &["config", "--local", key, value])?;
        }
        _ => {
            let _ = Command::new("git")
                .args(["config", "--local", "--unset", key])
                .current_dir(repo_path)
                .output();
        }
    }
    Ok(())
}

fn set_local_credential_helper(repo_path: &Path, helper: Option<&str>) -> Result<(), AppError> {
    let helper = helper.map(str::trim).filter(|value| !value.is_empty());
    let _ = Command::new("git")
        .args(["config", "--local", "--unset-all", "credential.helper"])
        .current_dir(repo_path)
        .output();

    let Some(helper) = helper else {
        return Ok(());
    };

    validate_credential_helper(helper)?;
    GitCli::run(
        repo_path,
        &["config", "--local", "credential.helper", helper],
    )?;
    Ok(())
}

fn validate_credential_helper(helper: &str) -> Result<(), AppError> {
    if helper.starts_with('!')
        || helper
            .bytes()
            .any(|byte| byte == b'\n' || byte == b'\r' || byte == 0)
    {
        return Err(AppError::GitError(
            "Credential helper shell commands and control characters are not allowed".to_string(),
        ));
    }
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
                .expect("system clock before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-config-{name}-{nonce}"));
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
    fn set_git_identity_writes_and_clears_local_config() {
        let temp = TestDir::new("identity");
        git(&temp.path, &["init", "-b", "main"]);

        let identity = set_git_identity(&temp.path, Some("Ada Lovelace"), Some("ada@example.test"))
            .expect("set identity");
        assert_eq!(identity.local_name.as_deref(), Some("Ada Lovelace"));
        assert_eq!(identity.local_email.as_deref(), Some("ada@example.test"));

        let identity = set_git_identity(&temp.path, Some(""), Some("")).expect("clear identity");
        assert_eq!(identity.local_name, None);
        assert_eq!(identity.local_email, None);
    }

    #[test]
    fn set_git_credential_helper_writes_and_clears_local_config() {
        let temp = TestDir::new("credential");
        git(&temp.path, &["init", "-b", "main"]);

        let config = set_git_credential_helper(&temp.path, Some("cache --timeout=3600"))
            .expect("set credential helper");
        assert_eq!(config.local_helpers, vec!["cache --timeout=3600"]);

        let config =
            set_git_credential_helper(&temp.path, Some("")).expect("clear credential helper");
        assert!(config.local_helpers.is_empty());
    }

    #[test]
    fn set_git_credential_helper_rejects_shell_commands() {
        let temp = TestDir::new("credential-shell");
        git(&temp.path, &["init", "-b", "main"]);

        let err = set_git_credential_helper(&temp.path, Some("!echo secret"))
            .expect_err("reject shell helper");
        assert!(err.to_string().contains("shell commands"));
    }
}
