use crate::errors::AppError;
use crate::git::remote_service;
use crate::models::Remote;
use std::path::Path;

#[tauri::command]
pub fn list_remotes(repo_path: String) -> Result<Vec<Remote>, AppError> {
    remote_service::list_remotes(Path::new(&repo_path))
}

#[tauri::command]
pub fn fetch(repo_path: String, remote: Option<String>) -> Result<(), AppError> {
    remote_service::fetch(Path::new(&repo_path), remote.as_deref())
}

#[tauri::command]
pub fn pull(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<(), AppError> {
    remote_service::pull(Path::new(&repo_path), remote.as_deref(), branch.as_deref())
}

#[tauri::command]
pub fn push(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<(), AppError> {
    remote_service::push(Path::new(&repo_path), remote.as_deref(), branch.as_deref())
}

#[tauri::command]
pub fn add_remote(repo_path: String, name: String, url: String) -> Result<(), AppError> {
    remote_service::add_remote(Path::new(&repo_path), &name, &url)
}

#[tauri::command]
pub fn update_remote(
    repo_path: String,
    name: String,
    fetch_url: String,
    push_url: Option<String>,
) -> Result<(), AppError> {
    remote_service::update_remote(
        Path::new(&repo_path),
        &name,
        &fetch_url,
        push_url.as_deref(),
    )
}

#[tauri::command]
pub fn delete_remote(repo_path: String, name: String) -> Result<(), AppError> {
    remote_service::delete_remote(Path::new(&repo_path), &name)
}

#[tauri::command]
pub fn prune_remote(repo_path: String, name: String) -> Result<(), AppError> {
    remote_service::prune_remote(Path::new(&repo_path), &name)
}

#[tauri::command]
pub fn prune_remote_dry_run(repo_path: String, name: String) -> Result<Vec<String>, AppError> {
    remote_service::prune_remote_dry_run(Path::new(&repo_path), &name)
}

#[tauri::command]
pub fn push_branch(
    repo_path: String,
    remote: String,
    local_branch: String,
    remote_branch: Option<String>,
    set_upstream: bool,
    force_with_lease: bool,
) -> Result<(), AppError> {
    remote_service::push_branch(
        Path::new(&repo_path),
        &remote,
        &local_branch,
        remote_branch.as_deref(),
        set_upstream,
        force_with_lease,
    )
}

#[tauri::command]
pub fn push_branch_dry_run(
    repo_path: String,
    remote: String,
    local_branch: String,
    remote_branch: Option<String>,
    set_upstream: bool,
    force_with_lease: bool,
) -> Result<Vec<String>, AppError> {
    remote_service::push_branch_dry_run(
        Path::new(&repo_path),
        &remote,
        &local_branch,
        remote_branch.as_deref(),
        set_upstream,
        force_with_lease,
    )
}

#[tauri::command]
pub fn delete_remote_branch(
    repo_path: String,
    remote: String,
    branch: String,
) -> Result<(), AppError> {
    remote_service::delete_remote_branch(Path::new(&repo_path), &remote, &branch)
}

#[tauri::command]
pub fn delete_remote_branch_dry_run(
    repo_path: String,
    remote: String,
    branch: String,
) -> Result<Vec<String>, AppError> {
    remote_service::delete_remote_branch_dry_run(Path::new(&repo_path), &remote, &branch)
}
