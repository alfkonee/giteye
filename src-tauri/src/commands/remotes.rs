use crate::errors::AppError;
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::git::remote_service;
use crate::models::{GitJobSummary, Remote};
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_remotes(repo_path: String) -> Result<Vec<Remote>, AppError> {
    remote_service::list_remotes(Path::new(&repo_path))
}

#[tauri::command]
pub fn fetch(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    remote: Option<String>,
) -> Result<GitJobSummary, AppError> {
    let mut args = vec!["fetch".to_string()];
    if let Some(remote) = non_empty(remote) {
        args.push(remote);
    }
    let request = GitJobRequest::new(repo_path, "fetch", "Fetch remote updates", args)
        .with_invalidation_reasons(vec!["remote", "refs"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn pull(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<GitJobSummary, AppError> {
    let mut args = vec!["pull".to_string()];
    if let Some(remote) = non_empty(remote) {
        args.push(remote);
    }
    if let Some(branch) = non_empty(branch) {
        args.push(branch);
    }
    let request = GitJobRequest::new(repo_path, "pull", "Pull remote changes", args)
        .with_invalidation_reasons(vec!["remote", "refs", "worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn push(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<GitJobSummary, AppError> {
    let mut args = vec!["push".to_string()];
    if let Some(remote) = non_empty(remote) {
        args.push(remote);
    }
    if let Some(branch) = non_empty(branch) {
        args.push(branch);
    }
    let request = GitJobRequest::new(repo_path, "push", "Push local commits", args)
        .with_invalidation_reasons(vec!["remote", "refs"]);
    jobs.start_job(app, request)
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[tauri::command]
pub fn add_remote(repo_path: String, name: String, url: String) -> Result<(), AppError> {
    remote_service::add_remote(Path::new(&repo_path), &name, &url)
}

#[tauri::command]
pub fn update_remote(
    repo_path: String,
    name: String,
    fetch_url: String,
    push_url: Option<String>,
) -> Result<(), AppError> {
    remote_service::update_remote(
        Path::new(&repo_path),
        &name,
        &fetch_url,
        push_url.as_deref(),
    )
}

#[tauri::command]
pub fn delete_remote(repo_path: String, name: String) -> Result<(), AppError> {
    remote_service::delete_remote(Path::new(&repo_path), &name)
}

#[tauri::command]
pub fn prune_remote(repo_path: String, name: String) -> Result<(), AppError> {
    remote_service::prune_remote(Path::new(&repo_path), &name)
}

#[tauri::command]
pub fn prune_remote_dry_run(repo_path: String, name: String) -> Result<Vec<String>, AppError> {
    remote_service::prune_remote_dry_run(Path::new(&repo_path), &name)
}

#[tauri::command]
pub fn push_branch(
    repo_path: String,
    remote: String,
    local_branch: String,
    remote_branch: Option<String>,
    set_upstream: bool,
    force_with_lease: bool,
) -> Result<(), AppError> {
    remote_service::push_branch(
        Path::new(&repo_path),
        &remote,
        &local_branch,
        remote_branch.as_deref(),
        set_upstream,
        force_with_lease,
    )
}

#[tauri::command]
pub fn push_branch_dry_run(
    repo_path: String,
    remote: String,
    local_branch: String,
    remote_branch: Option<String>,
    set_upstream: bool,
    force_with_lease: bool,
) -> Result<Vec<String>, AppError> {
    remote_service::push_branch_dry_run(
        Path::new(&repo_path),
        &remote,
        &local_branch,
        remote_branch.as_deref(),
        set_upstream,
        force_with_lease,
    )
}

#[tauri::command]
pub fn delete_remote_branch(
    repo_path: String,
    remote: String,
    branch: String,
) -> Result<(), AppError> {
    remote_service::delete_remote_branch(Path::new(&repo_path), &remote, &branch)
}

#[tauri::command]
pub fn delete_remote_branch_dry_run(
    repo_path: String,
    remote: String,
    branch: String,
) -> Result<Vec<String>, AppError> {
    remote_service::delete_remote_branch_dry_run(Path::new(&repo_path), &remote, &branch)
}
