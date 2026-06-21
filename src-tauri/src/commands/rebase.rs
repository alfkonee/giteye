use crate::errors::AppError;
use crate::git::rebase_service;
use crate::models::rebase::{
    ConflictContent, GitOperationSummary, RebasePreviewItem, RebaseState, RebaseTodoItem,
    RerereStatus,
};
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
pub fn checkout_conflict_side(
    repo_path: String,
    file_path: String,
    side: String,
) -> Result<(), AppError> {
    rebase_service::checkout_conflict_side(Path::new(&repo_path), &file_path, &side)
}

#[tauri::command]
pub fn update_rebase_todo(repo_path: String, items: Vec<RebaseTodoItem>) -> Result<(), AppError> {
    rebase_service::update_rebase_todo(Path::new(&repo_path), items)
}

#[tauri::command]
pub fn preview_rebase(
    repo_path: String,
    upstream: String,
    onto: Option<String>,
    branch: Option<String>,
) -> Result<Vec<RebasePreviewItem>, AppError> {
    rebase_service::preview_rebase(
        Path::new(&repo_path),
        &upstream,
        onto.as_deref(),
        branch.as_deref(),
    )
}

#[tauri::command]
pub fn rebase_onto(
    repo_path: String,
    upstream: String,
    onto: String,
    branch: Option<String>,
    autostash: bool,
) -> Result<(), AppError> {
    rebase_service::rebase_onto(
        Path::new(&repo_path),
        &upstream,
        &onto,
        branch.as_deref(),
        autostash,
    )
}

#[tauri::command]
pub fn rebase_upstream(
    repo_path: String,
    upstream: String,
    branch: Option<String>,
    autostash: bool,
) -> Result<(), AppError> {
    rebase_service::rebase_upstream(
        Path::new(&repo_path),
        &upstream,
        branch.as_deref(),
        autostash,
    )
}

#[tauri::command]
pub fn get_rerere_config(repo_path: String) -> Result<bool, AppError> {
    rebase_service::get_rerere_config(Path::new(&repo_path))
}

#[tauri::command]
pub fn get_rerere_status(repo_path: String) -> Result<RerereStatus, AppError> {
    rebase_service::get_rerere_status(Path::new(&repo_path))
}

#[tauri::command]
pub fn set_rerere_enabled(repo_path: String, enabled: bool) -> Result<RerereStatus, AppError> {
    rebase_service::set_rerere_enabled(Path::new(&repo_path), enabled)
}

#[tauri::command]
pub fn get_operation_summary(repo_path: String) -> Result<GitOperationSummary, AppError> {
    rebase_service::get_operation_summary(Path::new(&repo_path))
}
