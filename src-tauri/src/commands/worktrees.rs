use crate::errors::AppError;
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::git::worktree_service;
use crate::models::job::GitJobSummary;
use crate::models::worktree::Worktree;
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_worktrees(repo_path: String) -> Result<Vec<Worktree>, AppError> {
    worktree_service::list_worktrees(Path::new(&repo_path))
}

#[tauri::command]
pub fn create_worktree(
    repo_path: String,
    path: String,
    branch: Option<String>,
    create_branch: bool,
) -> Result<(), AppError> {
    worktree_service::create_worktree(
        Path::new(&repo_path),
        Path::new(&path),
        branch.as_deref(),
        create_branch,
    )
}

#[tauri::command]
pub fn remove_worktree(repo_path: String, path: String, force: bool) -> Result<(), AppError> {
    worktree_service::remove_worktree(Path::new(&repo_path), Path::new(&path), force)
}

#[tauri::command]
pub fn remove_worktree_dry_run(
    repo_path: String,
    path: String,
    force: bool,
) -> Result<Vec<String>, AppError> {
    worktree_service::remove_worktree_dry_run(Path::new(&repo_path), Path::new(&path), force)
}

#[tauri::command]
pub fn worktree_move(repo_path: String, path: String, new_path: String) -> Result<(), AppError> {
    worktree_service::move_worktree(
        Path::new(&repo_path),
        Path::new(&path),
        Path::new(&new_path),
    )
}

#[tauri::command]
pub fn worktree_lock(
    repo_path: String,
    path: String,
    reason: Option<String>,
) -> Result<(), AppError> {
    worktree_service::lock_worktree(Path::new(&repo_path), Path::new(&path), reason.as_deref())
}

#[tauri::command]
pub fn worktree_unlock(repo_path: String, path: String) -> Result<(), AppError> {
    worktree_service::unlock_worktree(Path::new(&repo_path), Path::new(&path))
}

#[tauri::command]
pub fn worktree_repair(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    path: String,
) -> Result<GitJobSummary, AppError> {
    let args = vec!["worktree".to_string(), "repair".to_string(), path];
    let request = GitJobRequest::new(
        repo_path,
        "worktree.repair",
        "Repair worktree metadata",
        args,
    )
    .with_invalidation_reasons(vec!["worktree", "refs"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn worktree_repair_dry_run(repo_path: String, path: String) -> Result<Vec<String>, AppError> {
    worktree_service::repair_worktree_dry_run(Path::new(&repo_path), Path::new(&path))
}

#[tauri::command]
pub fn worktree_prune_dry_run(repo_path: String) -> Result<Vec<String>, AppError> {
    worktree_service::prune_worktrees_dry_run(Path::new(&repo_path))
}

#[tauri::command]
pub fn prune_worktrees(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
) -> Result<GitJobSummary, AppError> {
    let args = vec!["worktree".to_string(), "prune".to_string()];
    let request = GitJobRequest::new(repo_path, "worktree.prune", "Prune stale worktrees", args)
        .with_invalidation_reasons(vec!["worktree"]);
    jobs.start_job(app, request)
}
