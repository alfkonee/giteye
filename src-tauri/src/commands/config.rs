use crate::errors::AppError;
use crate::git::config_service;
use crate::models::{GitCredentialConfig, GitIdentity};
use std::path::Path;

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
