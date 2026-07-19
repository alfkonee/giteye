use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::git::config_service;
use crate::models::{GitCredentialConfig, GitIdentity};
use std::path::Path;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthTestResult {
    pub success: bool,
    pub remote: String,
    pub message: String,
}

#[tauri::command]
pub fn get_git_identity(repo_path: String) -> Result<GitIdentity, AppError> {
    config_service::get_git_identity(Path::new(&repo_path))
}

#[tauri::command]
pub fn set_git_identity(
    repo_path: String,
    name: Option<String>,
    email: Option<String>,
) -> Result<GitIdentity, AppError> {
    config_service::set_git_identity(Path::new(&repo_path), name.as_deref(), email.as_deref())
}

#[tauri::command]
pub fn get_git_credential_config(repo_path: String) -> Result<GitCredentialConfig, AppError> {
    config_service::get_git_credential_config(Path::new(&repo_path))
}

#[tauri::command]
pub fn set_git_credential_helper(
    repo_path: String,
    helper: Option<String>,
) -> Result<GitCredentialConfig, AppError> {
    config_service::set_git_credential_helper(Path::new(&repo_path), helper.as_deref())
}

#[tauri::command]
pub fn test_git_authentication(
    repo_path: String,
    remote: Option<String>,
) -> Result<AuthTestResult, AppError> {
    let repo_path = Path::new(&repo_path);
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());

    let result = GitCli::run_with_timeout(
        repo_path,
        &["ls-remote", "--heads", &remote_name],
        std::time::Duration::from_secs(15),
    );

    match result {
        Ok(output) => {
            let count = output.lines().count();
            Ok(AuthTestResult {
                success: true,
                remote: remote_name,
                message: format!("Successfully authenticated. Found {count} remote ref(s)."),
            })
        }
        Err(_) => Ok(AuthTestResult {
            success: false,
            remote: remote_name,
            message: "Authentication failed. Ensure your credential helper is configured and you are authenticated.".to_string(),
        }),
    }
}

#[tauri::command]
pub fn clear_credential_cache(repo_path: String, host: Option<String>) -> Result<String, AppError> {
    let repo_path = Path::new(&repo_path);

    let host_to_clear = if let Some(h) = host {
        h
    } else {
        let remotes_output =
            GitCli::run(repo_path, &["remote", "get-url", "origin"]).unwrap_or_default();
        extract_host_from_url(remotes_output.trim())
    };

    if host_to_clear.is_empty() {
        return Ok("No remote host detected. Credential cache was not modified.".to_string());
    }

    let args = vec!["credential", "reject"];

    let input = format!("protocol=https\nhost={}\n\n", host_to_clear,);

    let _ = GitCli::run_with_input(repo_path, &args, &input);

    Ok(format!("Credential cache cleared for {host_to_clear}. You will be prompted for credentials on the next remote operation."))
}

fn extract_host_from_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.contains('@') {
        trimmed
            .split('@')
            .nth(1)
            .and_then(|s| s.split(':').next())
            .unwrap_or("")
            .to_string()
    } else if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        trimmed
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .split('/')
            .next()
            .unwrap_or("")
            .to_string()
    } else {
        "".to_string()
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CustomCommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[tauri::command]
pub fn run_custom_git_command(
    repo_path: String,
    args: Vec<String>,
) -> Result<CustomCommandResult, AppError> {
    let repo_path = Path::new(&repo_path);

    if args.is_empty() {
        return Err(AppError::GitError("No git arguments provided.".to_string()));
    }

    let str_args: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = GitCli::run_with_status(repo_path, &str_args)?;

    Ok(CustomCommandResult {
        success: output.status_code == 0,
        stdout: output.stdout,
        stderr: output.stderr,
        exit_code: output.status_code,
    })
}
