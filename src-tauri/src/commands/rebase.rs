use crate::errors::AppError;
use crate::git::rebase_service;
use crate::models::rebase::{ConflictContent, RebaseState, RebaseTodoItem};
use std::path::Path;

#[tauri::command]
pub fn get_rebase_state(repo_path: String) -> Result<RebaseState, AppError> {
    rebase_service::get_rebase_state(Path::new(&repo_path))
}

#[tauri::command]
pub fn get_conflict_content(
    repo_path: String,
    file_path: String,
) -> Result<ConflictContent, AppError> {
    rebase_service::get_conflict_content(Path::new(&repo_path), &file_path)
}

#[tauri::command]
pub fn continue_rebase(repo_path: String) -> Result<(), AppError> {
    rebase_service::continue_rebase(Path::new(&repo_path))
}

#[tauri::command]
pub fn abort_rebase(repo_path: String) -> Result<(), AppError> {
    rebase_service::abort_rebase(Path::new(&repo_path))
}

#[tauri::command]
pub fn skip_rebase(repo_path: String) -> Result<(), AppError> {
    rebase_service::skip_rebase(Path::new(&repo_path))
}

#[tauri::command]
pub fn mark_file_resolved(repo_path: String, file_path: String) -> Result<(), AppError> {
    rebase_service::mark_file_resolved(Path::new(&repo_path), &file_path)
}

#[tauri::command]
pub fn update_rebase_todo(repo_path: String, items: Vec<RebaseTodoItem>) -> Result<(), AppError> {
    rebase_service::update_rebase_todo(Path::new(&repo_path), items)
}
