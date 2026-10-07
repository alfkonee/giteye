use crate::errors::AppError;
use crate::git::stash_service;
use crate::models::{DiffResult, StashEntry, StashFile, StashSection, StashTarget};
use std::path::Path;

#[tauri::command]
pub async fn list_stashes(repo_path: String) -> Result<Vec<StashEntry>, AppError> {
    tauri::async_runtime::spawn_blocking(move || stash_service::list_stashes(Path::new(&repo_path)))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn create_stash(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        stash_service::create_stash(Path::new(&repo_path), message.as_deref(), include_untracked)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn create_stash_for_paths(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
    paths: Vec<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        stash_service::create_stash_for_paths(
            Path::new(&repo_path),
            message.as_deref(),
            include_untracked,
            &paths,
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn apply_stash(repo_path: String, stash: StashTarget) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || stash_service::apply_stash(Path::new(&repo_path), &stash))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn pop_stash(repo_path: String, stash: StashTarget) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || stash_service::pop_stash(Path::new(&repo_path), &stash))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn preview_stash(repo_path: String, stash: StashTarget) -> Result<Vec<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || stash_service::preview_stash(Path::new(&repo_path), &stash))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn drop_stash(repo_path: String, stash: StashTarget) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || stash_service::drop_stash(Path::new(&repo_path), &stash))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn create_branch_from_stash(
    repo_path: String,
    name: String,
    stash: StashTarget,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        stash_service::create_branch_from_stash(Path::new(&repo_path), &name, &stash)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn get_stash_files(repo_path: String, commit_hash: String) -> Result<Vec<StashFile>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        stash_service::get_stash_files(Path::new(&repo_path), &commit_hash)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn get_stash_diff(
    repo_path: String,
    commit_hash: String,
    section: StashSection,
    file_path: Option<String>,
) -> Result<DiffResult, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        stash_service::get_stash_diff(Path::new(&repo_path), &commit_hash, section, file_path.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
