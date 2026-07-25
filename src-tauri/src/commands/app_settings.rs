use crate::errors::AppError;
use crate::storage::{self, AppSettings};

#[tauri::command]
pub fn get_app_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, AppError> {
    storage::load_app_settings(&app_handle)
}

#[tauri::command]
pub fn save_app_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, AppError> {
    storage::save_app_settings(&app_handle, settings)
}
