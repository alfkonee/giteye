use crate::errors::AppError;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock, RwLock};
use std::thread;
use std::time::Duration;

pub struct GitCliOutput {
    pub status_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub struct GitCli;

static GIT_EXECUTABLE: OnceLock<RwLock<Option<PathBuf>>> = OnceLock::new();
static TOOL_PATH: OnceLock<RwLock<Option<PathBuf>>> = OnceLock::new();

fn configured_git_executable() -> &'static RwLock<Option<PathBuf>> {
    GIT_EXECUTABLE.get_or_init(|| RwLock::new(None))
}

fn configured_tool_path() -> &'static RwLock<Option<PathBuf>> {
    TOOL_PATH.get_or_init(|| RwLock::new(None))
}

impl GitCli {
    pub fn command() -> Command {
        let executable = configured_git_executable()
            .read()
            .ok()
            .and_then(|path| path.clone())
            .unwrap_or_else(|| PathBuf::from("git"));
        let mut command = Command::new(executable);
        Self::configure_command_environment(&mut command);
        command
    }

    pub fn configure_command_environment(command: &mut Command) {
        let mut paths = Vec::new();
        if let Some(executable) = Self::executable_path() {
            if let Some(parent) = executable.parent() {
                paths.push(parent.to_path_buf());
            }
        }
        if let Some(tool_path) = configured_tool_path()
            .read()
            .ok()
            .and_then(|path| path.clone())
        {
            paths.push(tool_path);
        }
        paths.extend(std::env::split_paths(
            &std::env::var_os("PATH").unwrap_or_default(),
        ));
        if let Ok(path) = std::env::join_paths(paths) {
            command.env("PATH", path);
        }
    }

    pub fn set_executable(path: Option<PathBuf>) -> Result<(), AppError> {
        let mut configured = configured_git_executable()
            .write()
            .map_err(|error| AppError::IoError(error.to_string()))?;
        *configured = path;
        Ok(())
    }

    pub fn executable_path() -> Option<PathBuf> {
        configured_git_executable()
            .read()
            .ok()
            .and_then(|path| path.clone())
    }

    pub fn set_tool_path(path: Option<PathBuf>) -> Result<(), AppError> {
        let mut configured = configured_tool_path()
            .write()
            .map_err(|error| AppError::IoError(error.to_string()))?;
        *configured = path;
        Ok(())
    }

    pub fn run(repo_path: &Path, args: &[&str]) -> Result<String, AppError> {
        let output = Self::command()
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
        let output = Self::command()
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
        let output = Self::command()
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

    pub fn run_with_timeout(
        repo_path: &Path,
        args: &[&str],
        timeout: Duration,
    ) -> Result<String, AppError> {
        let mut child = Self::command()
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

        let start = std::time::Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let output = child
                        .wait_with_output()
                        .map_err(|e| AppError::IoError(e.to_string()))?;
                    if !status.success() {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        return Err(AppError::GitError(stderr.trim().to_string()));
                    }
                    return Ok(String::from_utf8_lossy(&output.stdout).to_string());
                }
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(AppError::GitError("Authentication test timed out. Check your network or credential configuration.".to_string()));
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(AppError::IoError(e.to_string()));
                }
            }
        }
    }

    pub fn run_with_input(
        repo_path: &Path,
        args: &[&str],
        stdin: &str,
    ) -> Result<String, AppError> {
        let mut child = Self::command()
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
        let mut child = Self::command()
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
        Self::command()
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

pub fn required_git_arg<'a>(value: &'a str, label: &str) -> Result<&'a str, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::GitError(format!("{label} is required")));
    }
    if value.starts_with('-') {
        return Err(AppError::GitError(format!(
            "{label} must not start with '-'"
        )));
    }
    Ok(value)
}

pub fn has_worktree_changes(repo_path: &Path) -> Result<bool, AppError> {
    GitCli::run(repo_path, &["status", "--porcelain"]).map(|status| !status.trim().is_empty())
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
