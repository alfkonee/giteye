use crate::errors::AppError;
use crate::git::ignore_service;
use crate::git::job_runner::GitJobRunnerState;
use crate::models::{IgnoreRuleRequest, IgnoreRuleResult};
use std::path::Path;
use tauri::State;

#[tauri::command]
pub fn add_ignore_rules(
    repo_path: String,
    request: IgnoreRuleRequest,
    jobs: State<'_, GitJobRunnerState>,
) -> Result<IgnoreRuleResult, AppError> {
    jobs.with_repo_mutation_lock(&repo_path, || {
        ignore_service::add_ignore_rules(Path::new(&repo_path), &request)
    })
}
