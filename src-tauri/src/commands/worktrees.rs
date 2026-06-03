use crate::errors::AppError;
use crate::git::worktree_service;
use crate::models::worktree::Worktree;
use std::path::Path;

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
pub fn prune_worktrees(repo_path: String) -> Result<(), AppError> {
    worktree_service::prune_worktrees(Path::new(&repo_path))
}
