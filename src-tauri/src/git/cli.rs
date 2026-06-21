use crate::errors::AppError;
use std::path::Path;
use std::process::{Command, Stdio};

pub struct GitCliOutput {
    pub status_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub struct GitCli;

impl GitCli {
    pub fn run(repo_path: &Path, args: &[&str]) -> Result<String, AppError> {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo_path)
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

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    pub fn run_allowing_statuses(
        repo_path: &Path,
        args: &[&str],
        allowed_exit_codes: &[i32],
    ) -> Result<(i32, String), AppError> {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    AppError::GitNotFound
                } else {
                    AppError::IoError(e.to_string())
                }
            })?;

        let status_code = output.status.code().unwrap_or(-1);
        if !output.status.success() && !allowed_exit_codes.contains(&status_code) {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::GitError(stderr.trim().to_string()));
        }

        Ok((
            status_code,
            String::from_utf8_lossy(&output.stdout).to_string(),
        ))
    }

    pub fn run_with_status(repo_path: &Path, args: &[&str]) -> Result<GitCliOutput, AppError> {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    AppError::GitNotFound
                } else {
                    AppError::IoError(e.to_string())
                }
            })?;

        Ok(GitCliOutput {
            status_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }

    pub fn run_with_input(
        repo_path: &Path,
        args: &[&str],
        stdin: &str,
    ) -> Result<String, AppError> {
        let mut child = Command::new("git")
            .args(args)
            .current_dir(repo_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    AppError::GitNotFound
                } else {
                    AppError::IoError(e.to_string())
                }
            })?;

        {
            use std::io::Write;
            let child_stdin = child
                .stdin
                .as_mut()
                .ok_or_else(|| AppError::IoError("Failed to open git stdin".to_string()))?;
            child_stdin
                .write_all(stdin.as_bytes())
                .map_err(|e| AppError::IoError(e.to_string()))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| AppError::IoError(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::GitError(stderr.trim().to_string()));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    pub fn is_git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub fn repo_name_from_path(path: &Path) -> String {
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string()
    }
}
