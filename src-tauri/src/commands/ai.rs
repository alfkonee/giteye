use crate::errors::AppError;
use crate::git::ai_service;

#[tauri::command]
pub fn resolve_conflict_with_ai(
    app_handle: tauri::AppHandle,
    base: String,
    ours: String,
    theirs: String,
) -> Result<String, AppError> {
    ai_service::resolve_merge_conflict(&app_handle, &base, &ours, &theirs)
}

#[tauri::command]
pub fn suggest_commit_message(
    app_handle: tauri::AppHandle,
    diffs: Vec<ai_service::CommitMessageDiff>,
) -> Result<String, AppError> {
    ai_service::suggest_commit_message(&app_handle, &diffs)
}
