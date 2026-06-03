use crate::errors::AppError;
use crate::git::commit_service;
use crate::models::{CommitDetails, CommitSummary};
use std::path::Path;

#[tauri::command]
pub fn get_commit_history(
    repo_path: String,
    limit: Option<u32>,
) -> Result<Vec<CommitSummary>, AppError> {
    commit_service::get_commit_history(Path::new(&repo_path), limit)
}

#[tauri::command]
pub fn get_commit_details(
    repo_path: String,
    commit_hash: String,
) -> Result<CommitDetails, AppError> {
    commit_service::get_commit_details(Path::new(&repo_path), &commit_hash)
}
