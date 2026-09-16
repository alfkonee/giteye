use crate::errors::AppError;
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::git::rebase_service;
use crate::models::job::{GitJobRecord, GitJobSummary, GitRecoveryState};
use crate::models::rebase::OperationAction;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

/// Lists GitEye-triggered background Git jobs, optionally scoped to one repository path.
#[tauri::command]
pub fn list_git_jobs(
    state: State<'_, GitJobRunnerState>,
    repo_path: Option<String>,
) -> Result<Vec<GitJobSummary>, AppError> {
    state.list_jobs(repo_path.as_deref())
}

/// Returns one GitEye-triggered background Git job, including its captured stdout/stderr log.
#[tauri::command]
pub fn get_git_job(
    state: State<'_, GitJobRunnerState>,
    job_id: String,
) -> Result<Option<GitJobRecord>, AppError> {
    state.get_job(&job_id)
}

/// Requests cancellation for a running GitEye-triggered background Git job where the child process can be killed.
#[tauri::command]
pub fn cancel_git_job(
    app: AppHandle,
    state: State<'_, GitJobRunnerState>,
    job_id: String,
) -> Result<GitJobSummary, AppError> {
    state.cancel_job(&app, &job_id)
}

/// Inspects the actual Git operation and index lock state for a recovered repository.
#[tauri::command]
pub fn get_git_recovery_state(
    state: State<'_, GitJobRunnerState>,
    repo_path: String,
) -> Result<GitRecoveryState, AppError> {
    state.get_recovery_state(&repo_path)
}

/// Executes a revision-checked action on the operation still present on disk.
#[tauri::command]
pub fn recover_git_operation(
    app: AppHandle,
    state: State<'_, GitJobRunnerState>,
    repo_path: String,
    action: OperationAction,
    operation_id: String,
) -> Result<GitJobSummary, AppError> {
    let operation =
        rebase_service::preflight_operation_action(Path::new(&repo_path), &operation_id, action)?
            .operation
            .ok_or_else(|| {
                AppError::GitError("No recoverable Git operation is in progress".into())
            })?;
    let command = match operation.as_str() {
        "rebase" => "rebase",
        "merge" => "merge",
        "cherryPick" => "cherry-pick",
        "revert" => "revert",
        _ => {
            return Err(AppError::GitError(
                "This interrupted job has no safe automatic recovery action".to_string(),
            ))
        }
    };
    let option = format!("--{}", action.as_str());
    let title = format!("{} {}", action.as_str(), command);
    let preflight_repo = repo_path.clone();
    let action_name = action.as_str();
    let repo_hook = repo_path.clone();
    let app_hook = app.clone();
    let request = GitJobRequest::new(
        repo_path,
        format!("recovery.{operation}.{action_name}"),
        title,
        vec![
            "-c".into(),
            "core.editor=true".into(),
            "-c".into(),
            "sequence.editor=true".into(),
            command.to_string(),
            option,
        ],
    )
    .with_invalidation_reasons(vec!["rebase", "refs", "worktree"])
    .before_start(Box::new(move || {
        rebase_service::preflight_operation_action(
            Path::new(&preflight_repo),
            &operation_id,
            action,
        )
        .map(|_| ())
    }))
    .on_success(Box::new(move || {
        let state = app_hook.state::<GitJobRunnerState>();
        let _ = state.dismiss_interrupted_for_repo(&app_hook, &repo_hook);
    }));
    state.start_job(app, request)
}

/// Removes a recovery record after its repository state has been inspected and handled.
#[tauri::command]
pub fn dismiss_interrupted_git_job(
    app: AppHandle,
    state: State<'_, GitJobRunnerState>,
    job_id: String,
) -> Result<(), AppError> {
    state.dismiss_interrupted_job(&app, &job_id)
}

/// Clears captured stdout/stderr lines for retained Git jobs while keeping lifecycle summaries.
#[tauri::command]
pub fn clear_git_job_log(
    state: State<'_, GitJobRunnerState>,
    repo_path: Option<String>,
    job_id: Option<String>,
) -> Result<Vec<GitJobSummary>, AppError> {
    state.clear_job_logs(repo_path.as_deref(), job_id.as_deref())
}
