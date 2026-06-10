use crate::errors::AppError;
use crate::git::branch_service;
use crate::models::Branch;
use std::path::Path;

#[tauri::command]
pub fn list_branches(repo_path: String) -> Result<Vec<Branch>, AppError> {
    branch_service::list_branches(Path::new(&repo_path))
}

#[tauri::command]
pub fn get_current_branch(repo_path: String) -> Result<String, AppError> {
    branch_service::get_current_branch(Path::new(&repo_path))
}

#[tauri::command]
pub fn checkout_branch(
    repo_path: String,
    branch_name: String,
    strategy: Option<String>,
) -> Result<(), AppError> {
    branch_service::checkout_branch(
        Path::new(&repo_path),
        &branch_name,
        strategy.as_deref().unwrap_or("move"),
    )
}

#[tauri::command]
pub fn create_branch(
    repo_path: String,
    branch_name: String,
    checkout: bool,
    start_point: Option<String>,
) -> Result<(), AppError> {
    branch_service::create_branch(
        Path::new(&repo_path),
        &branch_name,
        checkout,
        start_point.as_deref(),
    )
}

#[tauri::command]
pub fn delete_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    branch_service::delete_branch(Path::new(&repo_path), &branch_name)
}
