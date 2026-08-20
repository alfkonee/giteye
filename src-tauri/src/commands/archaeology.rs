use crate::errors::AppError;
use crate::git::archaeology_service;
use crate::models::{
    BlameLine, CommitSearchResult, FileHistoryEntry, GitGrepMatch, LostCommit, PickaxeSearchResult,
    ReflogEntry,
};
use std::path::Path;

#[tauri::command]
pub async fn commit_search(
    repo_path: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<CommitSearchResult>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        archaeology_service::commit_search(Path::new(&repo_path), &query, limit)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn file_history(
    repo_path: String,
    file_path: String,
    limit: Option<u32>,
) -> Result<Vec<FileHistoryEntry>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        archaeology_service::file_history(Path::new(&repo_path), &file_path, limit)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn blame_file(
    repo_path: String,
    file_path: String,
    revision: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<BlameLine>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        archaeology_service::blame_file(Path::new(&repo_path), &file_path, revision.as_deref(), limit)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn git_grep(
    repo_path: String,
    query: String,
    pathspec: Option<String>,
    case_sensitive: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<GitGrepMatch>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        archaeology_service::git_grep(
            Path::new(&repo_path),
            &query,
            pathspec.as_deref(),
            case_sensitive,
            limit,
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn pickaxe_search(
    repo_path: String,
    query: String,
    regex: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<PickaxeSearchResult>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        archaeology_service::pickaxe_search(Path::new(&repo_path), &query, regex, limit)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn discover_lost_commits(
    repo_path: String,
    limit: Option<u32>,
) -> Result<Vec<LostCommit>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        archaeology_service::discover_lost_commits(Path::new(&repo_path), limit)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn reflog_search(
    repo_path: String,
    query: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<ReflogEntry>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        archaeology_service::reflog_search(Path::new(&repo_path), query.as_deref(), limit)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
