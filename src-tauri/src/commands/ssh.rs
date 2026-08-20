use crate::errors::AppError;
use crate::git::ssh_service;
use crate::models::SshStatus;

#[tauri::command]
pub async fn get_ssh_status() -> Result<SshStatus, AppError> {
    tauri::async_runtime::spawn_blocking(ssh_service::get_ssh_status)
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn generate_ssh_key(name: String, comment: Option<String>) -> Result<SshStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        ssh_service::generate_ssh_key(&name, comment.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn add_ssh_key_to_agent(name: String) -> Result<SshStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || ssh_service::add_ssh_key_to_agent(&name))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}
