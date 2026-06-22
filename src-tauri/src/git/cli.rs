use crate::errors::AppError;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

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

    /// Runs git with piped stdout/stderr, forwarding each output line while preserving blocking helpers.
    pub fn run_streaming(
        repo_path: &Path,
        args: &[String],
        cancel_flag: Arc<AtomicBool>,
        on_output: Arc<dyn Fn(&'static str, String) + Send + Sync>,
    ) -> Result<GitCliOutput, AppError> {
        let mut child = Command::new("git")
            .args(args)
            .current_dir(repo_path)
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

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::IoError("Failed to open git stdout".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::IoError("Failed to open git stderr".to_string()))?;

        let stdout_callback = Arc::clone(&on_output);
        let stdout_reader = thread::spawn(move || read_stream("stdout", stdout, stdout_callback));
        let stderr_callback = Arc::clone(&on_output);
        let stderr_reader = thread::spawn(move || read_stream("stderr", stderr, stderr_callback));

        let status = loop {
            if cancel_flag.load(Ordering::SeqCst) {
                let _ = child.kill();
            }
            match child
                .try_wait()
                .map_err(|e| AppError::IoError(e.to_string()))?
            {
                Some(status) => break status,
                None => thread::sleep(Duration::from_millis(100)),
            }
        };

        let stdout = stdout_reader
            .join()
            .unwrap_or_else(|_| "stdout reader panicked".to_string());
        let stderr = stderr_reader
            .join()
            .unwrap_or_else(|_| "stderr reader panicked".to_string());

        Ok(GitCliOutput {
            status_code: status.code().unwrap_or(-1),
            stdout,
            stderr,
        })
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

fn read_stream<R>(
    channel: &'static str,
    stream: R,
    on_output: Arc<dyn Fn(&'static str, String) + Send + Sync>,
) -> String
where
    R: std::io::Read,
{
    let mut captured = String::new();
    for line in BufReader::new(stream).lines() {
        match line {
            Ok(line) => {
                captured.push_str(&line);
                captured.push('\n');
                on_output(channel, line);
            }
            Err(error) => {
                let line = error.to_string();
                captured.push_str(&line);
                captured.push('\n');
                on_output(channel, line);
                break;
            }
        }
    }
    captured
}
