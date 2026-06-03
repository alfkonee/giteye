use crate::errors::AppError;
use crate::git::diff_service;
use crate::models::DiffResult;
use std::path::Path;

#[tauri::command]
pub fn get_file_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<DiffResult, AppError> {
    diff_service::get_file_diff(Path::new(&repo_path), &file_path, staged)
}

#[tauri::command]
pub fn get_commit_diff(repo_path: String, commit_hash: String) -> Result<DiffResult, AppError> {
    diff_service::get_commit_diff(Path::new(&repo_path), &commit_hash)
}
