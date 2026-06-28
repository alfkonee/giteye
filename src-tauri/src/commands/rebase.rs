use crate::errors::AppError;
use crate::git::cli::{has_worktree_changes, required_git_arg};
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::git::rebase_service;
use crate::models::job::GitJobSummary;
use crate::models::rebase::{
    ConflictContent, GitOperationSummary, RebasePreviewItem, RebaseState, RebaseTodoItem,
    RerereStatus,
};
use std::path::Path;
use tauri::{AppHandle, State};

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
pub fn continue_rebase(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
) -> Result<GitJobSummary, AppError> {
    let request = GitJobRequest::new(
        repo_path,
        "rebase.continue",
        "Continue rebase",
        vec!["rebase".to_string(), "--continue".to_string()],
    )
    .with_invalidation_reasons(vec!["rebase", "refs", "worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn abort_rebase(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
) -> Result<GitJobSummary, AppError> {
    let request = GitJobRequest::new(
        repo_path,
        "rebase.abort",
        "Abort rebase",
        vec!["rebase".to_string(), "--abort".to_string()],
    )
    .with_invalidation_reasons(vec!["rebase", "refs", "worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn skip_rebase(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
) -> Result<GitJobSummary, AppError> {
    let request = GitJobRequest::new(
        repo_path,
        "rebase.skip",
        "Skip rebase commit",
        vec!["rebase".to_string(), "--skip".to_string()],
    )
    .with_invalidation_reasons(vec!["rebase", "refs", "worktree"]);
    jobs.start_job(app, request)
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
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    upstream: String,
    onto: String,
    branch: Option<String>,
    autostash: bool,
) -> Result<GitJobSummary, AppError> {
    let args = rebase_onto_args(
        Path::new(&repo_path),
        &upstream,
        &onto,
        branch.as_deref(),
        autostash,
    )?;
    let request = GitJobRequest::new(repo_path, "rebase.onto", "Rebase onto target", args)
        .with_invalidation_reasons(vec!["rebase", "refs", "worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn rebase_upstream(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    upstream: String,
    branch: Option<String>,
    autostash: bool,
) -> Result<GitJobSummary, AppError> {
    let args = rebase_upstream_args(
        Path::new(&repo_path),
        &upstream,
        branch.as_deref(),
        autostash,
    )?;
    let request = GitJobRequest::new(repo_path, "rebase.upstream", "Rebase onto upstream", args)
        .with_invalidation_reasons(vec!["rebase", "refs", "worktree"]);
    jobs.start_job(app, request)
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

fn rebase_onto_args(
    repo_path: &Path,
    upstream: &str,
    onto: &str,
    branch: Option<&str>,
    autostash: bool,
) -> Result<Vec<String>, AppError> {
    let upstream = required_git_arg(upstream, "rebase upstream")?;
    let onto = required_git_arg(onto, "rebase onto target")?;
    ensure_rebase_worktree_ready(repo_path, autostash)?;

    let mut args = vec!["rebase".to_string()];
    if autostash {
        args.push("--autostash".to_string());
    }
    args.push("--onto".to_string());
    args.push(onto.to_string());
    args.push(upstream.to_string());
    if let Some(branch) = branch.map(str::trim).filter(|value| !value.is_empty()) {
        args.push(required_git_arg(branch, "rebase branch")?.to_string());
    }
    Ok(args)
}

fn rebase_upstream_args(
    repo_path: &Path,
    upstream: &str,
    branch: Option<&str>,
    autostash: bool,
) -> Result<Vec<String>, AppError> {
    let upstream = required_git_arg(upstream, "rebase upstream")?;
    ensure_rebase_worktree_ready(repo_path, autostash)?;

    let mut args = vec!["rebase".to_string()];
    if autostash {
        args.push("--autostash".to_string());
    }
    args.push(upstream.to_string());
    if let Some(branch) = branch.map(str::trim).filter(|value| !value.is_empty()) {
        args.push(required_git_arg(branch, "rebase branch")?.to_string());
    }
    Ok(args)
}

fn ensure_rebase_worktree_ready(repo_path: &Path, autostash: bool) -> Result<(), AppError> {
    if !autostash && has_worktree_changes(repo_path)? {
        return Err(AppError::GitError(
            "Working tree must be clean before rebasing without autostash".to_string(),
        ));
    }
    Ok(())
}
