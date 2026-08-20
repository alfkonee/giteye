use crate::errors::AppError;
use crate::git::diagnostics_service;
use crate::models::diagnostics::{
    BisectActionSummary, BisectState, GitFsckSummary, GitMaintenanceSummary, GitSignatureSummary,
};
use std::path::Path;

#[tauri::command]
pub async fn get_bisect_state(repository_path: String) -> Result<BisectState, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::get_bisect_state(Path::new(&repository_path))
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn bisect_start(
    repository_path: String,
    bad_revision: Option<String>,
    good_revisions: Option<Vec<String>>,
    paths: Option<Vec<String>>,
) -> Result<BisectActionSummary, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::bisect_start(
            Path::new(&repository_path),
            bad_revision.as_deref(),
            good_revisions,
            paths,
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn bisect_good(
    repository_path: String,
    revision: Option<String>,
) -> Result<BisectActionSummary, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::bisect_good(Path::new(&repository_path), revision.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn bisect_bad(
    repository_path: String,
    revision: Option<String>,
) -> Result<BisectActionSummary, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::bisect_bad(Path::new(&repository_path), revision.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn bisect_skip(
    repository_path: String,
    revision: Option<String>,
) -> Result<BisectActionSummary, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::bisect_skip(Path::new(&repository_path), revision.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn bisect_reset(
    repository_path: String,
    revision: Option<String>,
) -> Result<BisectActionSummary, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::bisect_reset(Path::new(&repository_path), revision.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn run_git_fsck(
    repository_path: String,
    full: bool,
    strict: bool,
) -> Result<GitFsckSummary, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::run_git_fsck(Path::new(&repository_path), full, strict)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn run_git_maintenance(
    repository_path: String,
    mode: Option<String>,
) -> Result<GitMaintenanceSummary, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::run_git_maintenance(Path::new(&repository_path), mode.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn verify_git_signature(
    repository_path: String,
    target: String,
) -> Result<GitSignatureSummary, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics_service::verify_git_signature(Path::new(&repository_path), &target)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
