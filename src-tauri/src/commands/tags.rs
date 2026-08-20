use crate::errors::AppError;
use crate::git::tag_service;
use crate::models::GitTag;
use std::path::Path;

#[tauri::command]
pub async fn list_tags(repo_path: String) -> Result<Vec<GitTag>, AppError> {
    tauri::async_runtime::spawn_blocking(move || tag_service::list_tags(Path::new(&repo_path)))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn create_tag(
    repo_path: String,
    name: String,
    target: Option<String>,
    message: Option<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        tag_service::create_tag(
            Path::new(&repo_path),
            &name,
            target.as_deref(),
            message.as_deref(),
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn delete_tag(repo_path: String, name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || tag_service::delete_tag(Path::new(&repo_path), &name))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn push_tag(repo_path: String, remote: String, name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || tag_service::push_tag(Path::new(&repo_path), &remote, &name))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn push_tag_dry_run(
    repo_path: String,
    remote: String,
    name: String,
) -> Result<Vec<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || tag_service::push_tag_dry_run(Path::new(&repo_path), &remote, &name))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn delete_remote_tag(repo_path: String, remote: String, name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || tag_service::delete_remote_tag(Path::new(&repo_path), &remote, &name))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn delete_remote_tag_dry_run(
    repo_path: String,
    remote: String,
    name: String,
) -> Result<Vec<String>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        tag_service::delete_remote_tag_dry_run(Path::new(&repo_path), &remote, &name)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
