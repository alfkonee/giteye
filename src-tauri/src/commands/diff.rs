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

#[tauri::command]
pub fn get_commit_range_diff(
    repo_path: String,
    base_hash: String,
    target_hash: String,
    file_path: String,
) -> Result<DiffResult, AppError> {
    diff_service::get_commit_range_diff(Path::new(&repo_path), &base_hash, &target_hash, &file_path)
}

#[tauri::command]
pub fn get_commit_range_files(
    repo_path: String,
    base_hash: String,
    target_hash: String,
) -> Result<Vec<String>, AppError> {
    diff_service::list_commit_range_files(Path::new(&repo_path), &base_hash, &target_hash)
}
