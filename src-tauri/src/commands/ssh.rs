use crate::errors::AppError;
use crate::git::ssh_service;
use crate::models::SshStatus;

#[tauri::command]
pub fn get_ssh_status() -> Result<SshStatus, AppError> {
    ssh_service::get_ssh_status()
}

#[tauri::command]
pub fn generate_ssh_key(name: String, comment: Option<String>) -> Result<SshStatus, AppError> {
    ssh_service::generate_ssh_key(&name, comment.as_deref())
}

#[tauri::command]
pub fn add_ssh_key_to_agent(name: String) -> Result<SshStatus, AppError> {
    ssh_service::add_ssh_key_to_agent(&name)
}
