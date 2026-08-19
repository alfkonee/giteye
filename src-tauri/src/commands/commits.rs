use crate::errors::AppError;
use crate::git::commit_service;
use crate::models::{CommitDetails, CommitSummary};
use std::path::Path;

#[tauri::command]
pub async fn get_commit_history(
    repo_path: String,
    limit: Option<u32>,
) -> Result<Vec<CommitSummary>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        commit_service::get_commit_history(Path::new(&repo_path), limit)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn get_commit_details(
    repo_path: String,
    commit_hash: String,
) -> Result<CommitDetails, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        commit_service::get_commit_details(Path::new(&repo_path), &commit_hash)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
