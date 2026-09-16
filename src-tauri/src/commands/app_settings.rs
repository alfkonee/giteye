use crate::errors::AppError;
use crate::storage::{self, AppSettings};

#[tauri::command]
pub fn get_app_build_commit() -> Option<&'static str> {
    let commit = env!("GITEYE_BUILD_COMMIT");
    (!commit.is_empty()).then_some(commit)
}

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
    // Dedicated updaters own device-local fields; delayed preference saves must preserve them.
    tauri::async_runtime::spawn_blocking(move || {
        storage::save_app_settings_preserving_device_fields(&app_handle, settings)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn remember_cli_setup(app_handle: tauri::AppHandle) -> Result<AppSettings, AppError> {
    tauri::async_runtime::spawn_blocking(move || storage::remember_cli_setup(&app_handle))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}
