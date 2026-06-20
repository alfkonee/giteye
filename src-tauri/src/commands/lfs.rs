use crate::errors::AppError;
use crate::git::lfs_service;
use crate::models::LfsStatus;
use std::path::Path;

#[tauri::command]
pub fn get_lfs_status(repo_path: String) -> Result<LfsStatus, AppError> {
    lfs_service::get_lfs_status(Path::new(&repo_path))
}

#[tauri::command]
pub fn install_lfs(repo_path: String) -> Result<(), AppError> {
    lfs_service::install_lfs(Path::new(&repo_path))
}

#[tauri::command]
pub fn track_lfs_pattern(repo_path: String, pattern: String) -> Result<(), AppError> {
    lfs_service::track_lfs_pattern(Path::new(&repo_path), &pattern)
}

#[tauri::command]
pub fn untrack_lfs_pattern(repo_path: String, pattern: String) -> Result<(), AppError> {
    lfs_service::untrack_lfs_pattern(Path::new(&repo_path), &pattern)
}
