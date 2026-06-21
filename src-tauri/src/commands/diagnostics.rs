use crate::errors::AppError;
use crate::git::diagnostics_service;
use crate::models::diagnostics::{
    BisectActionSummary, BisectState, GitFsckSummary, GitMaintenanceSummary, GitSignatureSummary,
};
use std::path::Path;

#[tauri::command]
pub fn get_bisect_state(repository_path: String) -> Result<BisectState, AppError> {
    diagnostics_service::get_bisect_state(Path::new(&repository_path))
}

#[tauri::command]
pub fn bisect_start(
    repository_path: String,
    bad_revision: Option<String>,
    good_revisions: Option<Vec<String>>,
    paths: Option<Vec<String>>,
) -> Result<BisectActionSummary, AppError> {
    diagnostics_service::bisect_start(
        Path::new(&repository_path),
        bad_revision.as_deref(),
        good_revisions,
        paths,
    )
}

#[tauri::command]
pub fn bisect_good(
    repository_path: String,
    revision: Option<String>,
) -> Result<BisectActionSummary, AppError> {
    diagnostics_service::bisect_good(Path::new(&repository_path), revision.as_deref())
}

#[tauri::command]
pub fn bisect_bad(
    repository_path: String,
    revision: Option<String>,
) -> Result<BisectActionSummary, AppError> {
    diagnostics_service::bisect_bad(Path::new(&repository_path), revision.as_deref())
}

#[tauri::command]
pub fn bisect_skip(
    repository_path: String,
    revision: Option<String>,
) -> Result<BisectActionSummary, AppError> {
    diagnostics_service::bisect_skip(Path::new(&repository_path), revision.as_deref())
}

#[tauri::command]
pub fn bisect_reset(
    repository_path: String,
    revision: Option<String>,
) -> Result<BisectActionSummary, AppError> {
    diagnostics_service::bisect_reset(Path::new(&repository_path), revision.as_deref())
}

#[tauri::command]
pub fn run_git_fsck(
    repository_path: String,
    full: bool,
    strict: bool,
) -> Result<GitFsckSummary, AppError> {
    diagnostics_service::run_git_fsck(Path::new(&repository_path), full, strict)
}

#[tauri::command]
pub fn run_git_maintenance(
    repository_path: String,
    mode: Option<String>,
) -> Result<GitMaintenanceSummary, AppError> {
    diagnostics_service::run_git_maintenance(Path::new(&repository_path), mode.as_deref())
}

#[tauri::command]
pub fn verify_git_signature(
    repository_path: String,
    target: String,
) -> Result<GitSignatureSummary, AppError> {
    diagnostics_service::verify_git_signature(Path::new(&repository_path), &target)
}
