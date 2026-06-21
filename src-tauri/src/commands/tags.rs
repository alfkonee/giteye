use crate::errors::AppError;
use crate::git::tag_service;
use crate::models::GitTag;
use std::path::Path;

#[tauri::command]
pub fn list_tags(repo_path: String) -> Result<Vec<GitTag>, AppError> {
    tag_service::list_tags(Path::new(&repo_path))
}

#[tauri::command]
pub fn create_tag(
    repo_path: String,
    name: String,
    target: Option<String>,
    message: Option<String>,
) -> Result<(), AppError> {
    tag_service::create_tag(
        Path::new(&repo_path),
        &name,
        target.as_deref(),
        message.as_deref(),
    )
}

#[tauri::command]
pub fn delete_tag(repo_path: String, name: String) -> Result<(), AppError> {
    tag_service::delete_tag(Path::new(&repo_path), &name)
}

#[tauri::command]
pub fn push_tag(repo_path: String, remote: String, name: String) -> Result<(), AppError> {
    tag_service::push_tag(Path::new(&repo_path), &remote, &name)
}

#[tauri::command]
pub fn push_tag_dry_run(
    repo_path: String,
    remote: String,
    name: String,
) -> Result<Vec<String>, AppError> {
    tag_service::push_tag_dry_run(Path::new(&repo_path), &remote, &name)
}

#[tauri::command]
pub fn delete_remote_tag(repo_path: String, remote: String, name: String) -> Result<(), AppError> {
    tag_service::delete_remote_tag(Path::new(&repo_path), &remote, &name)
}

#[tauri::command]
pub fn delete_remote_tag_dry_run(
    repo_path: String,
    remote: String,
    name: String,
) -> Result<Vec<String>, AppError> {
    tag_service::delete_remote_tag_dry_run(Path::new(&repo_path), &remote, &name)
}
