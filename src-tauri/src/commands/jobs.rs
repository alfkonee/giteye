use crate::errors::AppError;
use crate::git::job_runner::GitJobRunnerState;
use crate::models::job::{GitJobRecord, GitJobSummary};
use tauri::State;

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
    state: State<'_, GitJobRunnerState>,
    job_id: String,
) -> Result<GitJobSummary, AppError> {
    state.cancel_job(&job_id)
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
