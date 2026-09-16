use crate::errors::AppError;
use crate::git::history_service;
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::models::job::GitJobSummary;
use crate::models::{AmendPreview, ReflogEntry, ResetMode, ResetPreview};
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn cherry_pick_commit(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    commit_hash: String,
) -> Result<GitJobSummary, AppError> {
    start_history_operation(app, jobs, repo_path, commit_hash, false)
}

#[tauri::command]
pub fn revert_commit(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    commit_hash: String,
) -> Result<GitJobSummary, AppError> {
    start_history_operation(app, jobs, repo_path, commit_hash, true)
}

fn start_history_operation(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    commit_hash: String,
    revert: bool,
) -> Result<GitJobSummary, AppError> {
    let args =
        history_service::history_operation_args(Path::new(&repo_path), &commit_hash, revert)?;
    let preflight_repo = repo_path.clone();
    let request = GitJobRequest::new(
        repo_path,
        if revert {
            "revert.start"
        } else {
            "cherryPick.start"
        },
        if revert {
            "Revert commit"
        } else {
            "Cherry-pick commit"
        },
        args,
    )
    .with_invalidation_reasons(vec!["rebase", "refs", "worktree"])
    .before_start(Box::new(move || {
        history_service::preflight_history_operation(Path::new(&preflight_repo))
    }));
    jobs.start_job(app, request)
}

#[tauri::command]
pub async fn preview_reset_to_commit(
    repo_path: String,
    commit_hash: String,
) -> Result<ResetPreview, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        history_service::preview_reset_to_commit(Path::new(&repo_path), &commit_hash)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn reset_to_commit(
    repo_path: String,
    commit_hash: String,
    mode: ResetMode,
    confirm_discard_changes: bool,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        history_service::reset_to_commit(
            Path::new(&repo_path),
            &commit_hash,
            mode,
            confirm_discard_changes,
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn preview_amend(
    repo_path: String,
    message: Option<String>,
) -> Result<AmendPreview, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        history_service::preview_amend(Path::new(&repo_path), message.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn amend_commit(
    repo_path: String,
    message: Option<String>,
    sign_off: Option<bool>,
    no_verify: Option<bool>,
    allow_empty: Option<bool>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        history_service::amend_commit(
            Path::new(&repo_path),
            message.as_deref(),
            history_service::AmendOptions {
                sign_off: sign_off.unwrap_or(false),
                no_verify: no_verify.unwrap_or(false),
                allow_empty: allow_empty.unwrap_or(false),
            },
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn list_reflog_entries(
    repo_path: String,
    limit: Option<u32>,
) -> Result<Vec<ReflogEntry>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        history_service::list_reflog_entries(Path::new(&repo_path), limit)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn checkout_reflog_entry(repo_path: String, selector: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        history_service::checkout_reflog_entry(Path::new(&repo_path), &selector)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn create_branch_from_reflog_entry(
    repo_path: String,
    branch_name: String,
    selector: String,
    checkout: bool,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        history_service::create_branch_from_reflog_entry(
            Path::new(&repo_path),
            &branch_name,
            &selector,
            checkout,
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
