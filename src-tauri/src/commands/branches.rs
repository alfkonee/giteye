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
pub fn rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), AppError> {
    branch_service::rename_branch(Path::new(&repo_path), &old_name, &new_name)
}

#[tauri::command]
pub fn set_branch_upstream(
    repo_path: String,
    branch_name: String,
    upstream: Option<String>,
) -> Result<(), AppError> {
    branch_service::set_branch_upstream(Path::new(&repo_path), &branch_name, upstream.as_deref())
}

#[tauri::command]
pub fn fast_forward_branch(
    repo_path: String,
    branch_name: String,
    upstream: String,
) -> Result<(), AppError> {
    branch_service::fast_forward_branch(Path::new(&repo_path), &branch_name, &upstream)
}

#[tauri::command]
pub fn merge_branch(repo_path: String, source: String) -> Result<(), AppError> {
    branch_service::merge_branch(Path::new(&repo_path), &source)
}

#[tauri::command]
pub fn merge_with_options(
    repo_path: String,
    source: String,
    no_ff: bool,
    squash: bool,
    strategy_option: Option<String>,
) -> Result<(), AppError> {
    branch_service::merge_with_options(
        Path::new(&repo_path),
        &source,
        no_ff,
        squash,
        strategy_option.as_deref(),
    )
}

#[tauri::command]
pub fn delete_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    branch_service::delete_branch(Path::new(&repo_path), &branch_name)
}
