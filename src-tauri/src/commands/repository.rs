use crate::errors::AppError;
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::git::repository_service;
use crate::models::{
    BranchSummary, GitJobSummary, RepositoryInfo, RepositorySnapshot, WorkspaceSummary,
};
use crate::storage;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn open_repository(
    path: String,
    app_handle: AppHandle,
) -> Result<RepositorySnapshot, AppError> {
    let repo_path = Path::new(&path);
    if !repo_path.exists() {
        return Err(AppError::RepositoryNotFound(path));
    }
    let snapshot = repository_service::get_repository_snapshot(repo_path)?;
    storage::save_recent_repository(&app_handle, &path, &snapshot.repository_info.name)?;
    repository_service::prime_repository_context_with_budget(repo_path.to_path_buf(), false);
    Ok(snapshot)
}

#[tauri::command]
pub fn init_repository(
    path: String,
    app_handle: AppHandle,
) -> Result<RepositorySnapshot, AppError> {
    repository_service::init_repository(Path::new(&path))?;
    let snapshot = repository_service::get_repository_snapshot(Path::new(&path))?;
    storage::save_recent_repository(&app_handle, &path, &snapshot.repository_info.name)?;
    repository_service::prime_repository_context_with_budget(Path::new(&path).to_path_buf(), false);
    Ok(snapshot)
}

#[tauri::command]
pub fn clone_repository(
    app_handle: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    url: String,
    destination: String,
) -> Result<GitJobSummary, AppError> {
    let destination_path = PathBuf::from(&destination);
    let parent = destination_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let Some(name) = destination_path
        .file_name()
        .and_then(|value| value.to_str())
    else {
        return Err(AppError::InvalidPath(destination));
    };
    let args = vec!["clone".to_string(), url, name.to_string()];
    let hook_destination = destination.clone();
    let hook_app = app_handle.clone();
    let request = GitJobRequest::new(destination, "clone", "Clone repository", args)
        .with_working_dir(parent)
        .with_invalidation_reasons(vec!["worktree", "refs", "remote"])
        .on_success(Box::new(move || {
            let repo_path = Path::new(&hook_destination);
            if let Ok(snapshot) = repository_service::get_repository_snapshot(repo_path) {
                let _ = storage::save_recent_repository(
                    &hook_app,
                    &hook_destination,
                    &snapshot.repository_info.name,
                );
                repository_service::prime_repository_context_with_budget(
                    repo_path.to_path_buf(),
                    false,
                );
            }
        }));
    jobs.start_job(app_handle, request)
}

#[tauri::command]
pub fn get_repository_info(path: String) -> Result<RepositoryInfo, AppError> {
    repository_service::get_repository_info(Path::new(&path))
}

#[tauri::command]
pub fn get_repository_snapshot(path: String) -> Result<RepositorySnapshot, AppError> {
    repository_service::get_repository_snapshot(Path::new(&path))
}

#[tauri::command]
pub fn get_branch_summary(path: String) -> Result<BranchSummary, AppError> {
    repository_service::get_branch_summary(Path::new(&path))
}

#[tauri::command]
pub fn get_workspace_summary(path: String) -> Result<WorkspaceSummary, AppError> {
    repository_service::get_workspace_summary(Path::new(&path))
}

#[tauri::command]
pub fn warm_repository_context(repo_path: String, include_github: bool) -> Result<(), AppError> {
    repository_service::warm_repository_context(
        Path::new(&repo_path).to_path_buf(),
        include_github,
    );
    Ok(())
}

#[tauri::command]
pub fn list_recent_repositories(
    app_handle: AppHandle,
) -> Result<Vec<storage::RecentRepo>, AppError> {
    storage::load_recent_repositories(&app_handle)
}

#[tauri::command]
pub fn list_favorite_repositories(
    app_handle: AppHandle,
) -> Result<Vec<storage::FavoriteRepo>, AppError> {
    storage::load_favorite_repositories(&app_handle)
}

#[tauri::command]
pub fn set_repository_favorite(
    app_handle: AppHandle,
    repo_path: String,
    name: String,
    favorite: bool,
) -> Result<Vec<storage::FavoriteRepo>, AppError> {
    storage::set_repository_favorite(&app_handle, &repo_path, &name, favorite)
}
