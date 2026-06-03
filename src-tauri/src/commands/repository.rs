use crate::errors::AppError;
use crate::git::repository_service;
use crate::models::RepositoryInfo;
use crate::storage;
use std::path::Path;
use tauri::AppHandle;

#[tauri::command]
pub fn open_repository(path: String, app_handle: AppHandle) -> Result<RepositoryInfo, AppError> {
    let repo_path = Path::new(&path);
    if !repo_path.exists() {
        return Err(AppError::RepositoryNotFound(path));
    }
    let info = repository_service::get_repository_info(repo_path)?;
    storage::save_recent_repository(&app_handle, &path, &info.name)?;
    Ok(info)
}

#[tauri::command]
pub fn init_repository(path: String, app_handle: AppHandle) -> Result<RepositoryInfo, AppError> {
    let info = repository_service::init_repository(Path::new(&path))?;
    storage::save_recent_repository(&app_handle, &path, &info.name)?;
    Ok(info)
}

#[tauri::command]
pub fn clone_repository(
    url: String,
    destination: String,
    app_handle: AppHandle,
) -> Result<RepositoryInfo, AppError> {
    let info = repository_service::clone_repository(&url, Path::new(&destination))?;
    storage::save_recent_repository(&app_handle, &destination, &info.name)?;
    Ok(info)
}

#[tauri::command]
pub fn get_repository_info(path: String) -> Result<RepositoryInfo, AppError> {
    repository_service::get_repository_info(Path::new(&path))
}

#[tauri::command]
pub fn list_recent_repositories(
    app_handle: AppHandle,
) -> Result<Vec<storage::RecentRepo>, AppError> {
    storage::load_recent_repositories(&app_handle)
}
