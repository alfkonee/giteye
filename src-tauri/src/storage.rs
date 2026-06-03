use crate::errors::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    pub last_opened_at: String,
}

fn get_storage_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    fs::create_dir_all(&dir).map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(dir)
}

fn recent_repos_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    Ok(get_storage_dir(app_handle)?.join("recent_repositories.json"))
}

pub fn load_recent_repositories(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<RecentRepo>, AppError> {
    let path = recent_repos_path(app_handle)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = fs::read_to_string(&path).map_err(|e| AppError::StorageError(e.to_string()))?;
    serde_json::from_str(&data).map_err(|e| AppError::SerializationError(e.to_string()))
}

pub fn save_recent_repository(
    app_handle: &tauri::AppHandle,
    repo_path: &str,
    name: &str,
) -> Result<(), AppError> {
    let mut recents = load_recent_repositories(app_handle)?;

    // Remove existing entry with same path
    recents.retain(|r| r.path != repo_path);

    // Prepend new entry
    recents.insert(
        0,
        RecentRepo {
            path: repo_path.to_string(),
            name: name.to_string(),
            last_opened_at: chrono::Utc::now().to_rfc3339(),
        },
    );

    // Limit to 20
    recents.truncate(20);

    let path = recent_repos_path(app_handle)?;
    let data = serde_json::to_string_pretty(&recents)
        .map_err(|e| AppError::SerializationError(e.to_string()))?;
    fs::write(&path, data).map_err(|e| AppError::StorageError(e.to_string()))?;

    Ok(())
}
