use crate::errors::AppError;
use crate::git::remote_service;
use crate::models::Remote;
use std::path::Path;

#[tauri::command]
pub fn list_remotes(repo_path: String) -> Result<Vec<Remote>, AppError> {
    remote_service::list_remotes(Path::new(&repo_path))
}

#[tauri::command]
pub fn fetch(repo_path: String, remote: Option<String>) -> Result<(), AppError> {
    remote_service::fetch(Path::new(&repo_path), remote.as_deref())
}

#[tauri::command]
pub fn pull(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<(), AppError> {
    remote_service::pull(Path::new(&repo_path), remote.as_deref(), branch.as_deref())
}

#[tauri::command]
pub fn push(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<(), AppError> {
    remote_service::push(Path::new(&repo_path), remote.as_deref(), branch.as_deref())
}
