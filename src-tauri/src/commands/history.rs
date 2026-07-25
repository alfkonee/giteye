use crate::errors::AppError;
use crate::git::history_service;
use crate::models::{AmendPreview, ReflogEntry, ResetMode, ResetPreview};
use std::path::Path;

#[tauri::command]
pub fn cherry_pick_commit(repo_path: String, commit_hash: String) -> Result<(), AppError> {
    history_service::cherry_pick_commit(Path::new(&repo_path), &commit_hash)
}

#[tauri::command]
pub fn revert_commit(repo_path: String, commit_hash: String) -> Result<(), AppError> {
    history_service::revert_commit(Path::new(&repo_path), &commit_hash)
}

#[tauri::command]
pub fn preview_reset_to_commit(
    repo_path: String,
    commit_hash: String,
) -> Result<ResetPreview, AppError> {
    history_service::preview_reset_to_commit(Path::new(&repo_path), &commit_hash)
}

#[tauri::command]
pub fn reset_to_commit(
    repo_path: String,
    commit_hash: String,
    mode: ResetMode,
    confirm_discard_changes: bool,
) -> Result<(), AppError> {
    history_service::reset_to_commit(
        Path::new(&repo_path),
        &commit_hash,
        mode,
        confirm_discard_changes,
    )
}

#[tauri::command]
pub fn preview_amend(repo_path: String, message: Option<String>) -> Result<AmendPreview, AppError> {
    history_service::preview_amend(Path::new(&repo_path), message.as_deref())
}

#[tauri::command]
pub fn amend_commit(
    repo_path: String,
    message: Option<String>,
    sign_off: Option<bool>,
    no_verify: Option<bool>,
    allow_empty: Option<bool>,
) -> Result<(), AppError> {
    history_service::amend_commit(
        Path::new(&repo_path),
        message.as_deref(),
        history_service::AmendOptions {
            sign_off: sign_off.unwrap_or(false),
            no_verify: no_verify.unwrap_or(false),
            allow_empty: allow_empty.unwrap_or(false),
        },
    )
}

#[tauri::command]
pub fn list_reflog_entries(
    repo_path: String,
    limit: Option<u32>,
) -> Result<Vec<ReflogEntry>, AppError> {
    history_service::list_reflog_entries(Path::new(&repo_path), limit)
}

#[tauri::command]
pub fn checkout_reflog_entry(repo_path: String, selector: String) -> Result<(), AppError> {
    history_service::checkout_reflog_entry(Path::new(&repo_path), &selector)
}

#[tauri::command]
pub fn create_branch_from_reflog_entry(
    repo_path: String,
    branch_name: String,
    selector: String,
    checkout: bool,
) -> Result<(), AppError> {
    history_service::create_branch_from_reflog_entry(
        Path::new(&repo_path),
        &branch_name,
        &selector,
        checkout,
    )
}
