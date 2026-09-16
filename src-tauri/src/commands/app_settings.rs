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

#[tauri::command]
pub async fn set_external_editor_path(
    app_handle: tauri::AppHandle,
    path: Option<String>,
) -> Result<AppSettings, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        storage::update_external_editor_path(&app_handle, path)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
