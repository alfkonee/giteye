use crate::errors::AppError;
use crate::git::repository_service;
use crate::models::{BranchSummary, RepositoryInfo, RepositorySnapshot, WorkspaceSummary};
use crate::storage;
use std::path::Path;
use tauri::AppHandle;

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
    url: String,
    destination: String,
    app_handle: AppHandle,
) -> Result<RepositorySnapshot, AppError> {
    repository_service::clone_repository(&url, Path::new(&destination))?;
    let snapshot = repository_service::get_repository_snapshot(Path::new(&destination))?;
    storage::save_recent_repository(&app_handle, &destination, &snapshot.repository_info.name)?;
    repository_service::prime_repository_context_with_budget(
        Path::new(&destination).to_path_buf(),
        false,
    );
    Ok(snapshot)
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
