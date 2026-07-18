use crate::errors::AppError;
use crate::storage;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundle {
    pub version: String,
    pub exported_at: String,
    pub theme: String,
    pub diff_mode: String,
    pub recent_repositories: Vec<storage::RecentRepo>,
    pub favorite_repositories: Vec<storage::FavoriteRepo>,
}

#[tauri::command]
pub fn export_settings(
    app_handle: tauri::AppHandle,
    output_path: String,
    theme: String,
    diff_mode: String,
) -> Result<String, AppError> {
    let recents = storage::load_recent_repositories(&app_handle)?;
    let favorites = storage::load_favorite_repositories(&app_handle)?;

    let bundle = ExportBundle {
        version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        theme,
        diff_mode,
        recent_repositories: recents,
        favorite_repositories: favorites,
    };

    let json = serde_json::to_string_pretty(&bundle)
        .map_err(|e| AppError::SerializationError(e.to_string()))?;

    fs::write(Path::new(&output_path), json)
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    Ok(format!("Settings exported to {output_path}"))
}

#[tauri::command]
pub fn import_settings(
    app_handle: tauri::AppHandle,
    input_path: String,
) -> Result<ExportBundle, AppError> {
    let data = fs::read_to_string(Path::new(&input_path))
        .map_err(|e| AppError::StorageError(e.to_string()))?;

    let bundle: ExportBundle = serde_json::from_str(&data)
        .map_err(|e| AppError::SerializationError(format!("Invalid settings file: {}", e)))?;

    for repo in &bundle.recent_repositories {
        let _ = storage::save_recent_repository(&app_handle, &repo.path, &repo.name);
    }

    for fav in &bundle.favorite_repositories {
        let _ = storage::set_repository_favorite(&app_handle, &fav.path, &fav.name, true);
    }

    Ok(bundle)
}
