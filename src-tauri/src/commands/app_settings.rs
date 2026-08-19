use crate::errors::AppError;
use crate::storage::{self, AppSettings};

#[tauri::command]
pub async fn get_app_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, AppError> {
    tauri::async_runtime::spawn_blocking(move || storage::load_app_settings(&app_handle))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn save_app_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, AppError> {
    // The Git path has a dedicated validated updater; theme/diff autosaves must not overwrite it.
    tauri::async_runtime::spawn_blocking(move || {
        storage::save_app_settings_preserving_git_path(&app_handle, settings)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
