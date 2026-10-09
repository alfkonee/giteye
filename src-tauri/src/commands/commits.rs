use crate::errors::AppError;
use crate::git::commit_service;
use crate::models::{CommitDetails, CommitSummary};
use std::path::Path;

#[tauri::command]
pub async fn get_commit_history(
    repo_path: String,
    limit: Option<u32>,
    rev: Option<String>,
) -> Result<Vec<CommitSummary>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        commit_service::get_commit_history(
            Path::new(&repo_path),
            limit,
            rev.as_deref(),
        )
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

/// Common ancestor of two revisions; `None` when they share no history.
#[tauri::command]
pub async fn get_merge_base(
    repo_path: String,
    from_ref: String,
    to_ref: String,
) -> Result<Option<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        commit_service::merge_base(Path::new(&repo_path), &from_ref, &to_ref)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

/// Resolves a branch/upstream/tag/hash to its commit hash for in-graph navigation.
#[tauri::command]
pub async fn resolve_revision(
    repo_path: String,
    rev: String,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        commit_service::resolve_revision(Path::new(&repo_path), &rev)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
