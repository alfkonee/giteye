use crate::errors::AppError;
use crate::git::ai_service;
use crate::git::commit_service;
use std::path::Path;
#[tauri::command]
pub fn get_ai_config(app_handle: tauri::AppHandle) -> Result<ai_service::AiConfigView, AppError> {
    ai_service::get_ai_config(&app_handle)
}

#[tauri::command]
pub fn save_ai_config(
    app_handle: tauri::AppHandle,
    request: ai_service::SaveAiConfigRequest,
) -> Result<ai_service::AiConfigView, AppError> {
    ai_service::save_ai_config(&app_handle, request)
}

#[tauri::command]
pub async fn list_ai_models(
    app_handle: tauri::AppHandle,
    request: ai_service::ListAiModelsRequest,
) -> Result<ai_service::AiModelListView, AppError> {
    tauri::async_runtime::spawn_blocking(move || ai_service::list_ai_models(&app_handle, request))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn resolve_conflict_with_ai(
    app_handle: tauri::AppHandle,
    base: String,
    ours: String,
    theirs: String,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        ai_service::resolve_merge_conflict(&app_handle, &base, &ours, &theirs)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn suggest_commit_message(
    app_handle: tauri::AppHandle,
    diffs: Vec<ai_service::CommitMessageDiff>,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || ai_service::suggest_commit_message(&app_handle, &diffs))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn suggest_pull_request(
    app_handle: tauri::AppHandle,
    repo_path: String,
    head_branch: String,
    base_branch: Option<String>,
) -> Result<ai_service::PullRequestDraft, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let commits = commit_service::branch_commit_subjects(
            Path::new(&repo_path),
            &head_branch,
            base_branch.as_deref(),
            50,
        )?;
        ai_service::suggest_pull_request(&app_handle, &head_branch, &commits)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

