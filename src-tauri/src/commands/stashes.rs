use crate::errors::AppError;
use crate::git::stash_service;
use crate::models::StashEntry;
use std::path::Path;

#[tauri::command]
pub fn list_stashes(repo_path: String) -> Result<Vec<StashEntry>, AppError> {
    stash_service::list_stashes(Path::new(&repo_path))
}

#[tauri::command]
pub fn create_stash(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<(), AppError> {
    stash_service::create_stash(Path::new(&repo_path), message.as_deref(), include_untracked)
}

#[tauri::command]
pub fn apply_stash(repo_path: String, stash_name: String) -> Result<(), AppError> {
    stash_service::apply_stash(Path::new(&repo_path), &stash_name)
}

#[tauri::command]
pub fn pop_stash(repo_path: String, stash_name: String) -> Result<(), AppError> {
    stash_service::pop_stash(Path::new(&repo_path), &stash_name)
}

#[tauri::command]
pub fn drop_stash(repo_path: String, stash_name: String) -> Result<(), AppError> {
    stash_service::drop_stash(Path::new(&repo_path), &stash_name)
}
