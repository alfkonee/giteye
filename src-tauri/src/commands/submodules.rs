use crate::errors::AppError;
use crate::git::submodule_service;
use crate::models::submodule::{Submodule, SubmoduleForeachStatus};
use std::path::Path;

#[tauri::command]
pub fn list_submodules(repo_path: String) -> Result<Vec<Submodule>, AppError> {
    submodule_service::list_submodules(Path::new(&repo_path))
}

#[tauri::command]
pub fn update_submodule(repo_path: String, path: String, recursive: bool) -> Result<(), AppError> {
    submodule_service::update_submodule(Path::new(&repo_path), &path, recursive)
}

#[tauri::command]
pub fn sync_submodules(repo_path: String, recursive: bool) -> Result<(), AppError> {
    submodule_service::sync_submodules(Path::new(&repo_path), recursive)
}

#[tauri::command]
pub fn submodule_init_update(
    repo_path: String,
    path: Option<String>,
    recursive: bool,
    remote: bool,
) -> Result<(), AppError> {
    submodule_service::submodule_init_update(
        Path::new(&repo_path),
        path.as_deref(),
        recursive,
        remote,
    )
}

#[tauri::command]
pub fn submodule_set_branch(
    repo_path: String,
    path: String,
    branch: String,
) -> Result<(), AppError> {
    submodule_service::submodule_set_branch(Path::new(&repo_path), &path, &branch)
}

#[tauri::command]
pub fn submodule_foreach_status(
    repo_path: String,
    recursive: bool,
) -> Result<Vec<SubmoduleForeachStatus>, AppError> {
    submodule_service::submodule_foreach_status(Path::new(&repo_path), recursive)
}

#[tauri::command]
pub fn open_submodule(repo_path: String, path: String) -> Result<String, AppError> {
    submodule_service::open_submodule(Path::new(&repo_path), &path)
}

#[tauri::command]
pub fn bump_submodule(repo_path: String, path: String) -> Result<(), AppError> {
    submodule_service::bump_submodule(Path::new(&repo_path), &path)
}
