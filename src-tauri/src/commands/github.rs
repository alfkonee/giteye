use crate::errors::AppError;
use crate::git::github_service;
use crate::models::github::{PullRequestDiff, RepositoryGithubOverview};
use std::path::Path;

#[tauri::command]
pub fn get_repository_github_overview(
    repo_path: String,
) -> Result<RepositoryGithubOverview, AppError> {
    Ok(github_service::get_repository_github_overview(Path::new(
        &repo_path,
    )))
}

#[tauri::command]
pub fn get_pull_request_diff(repo_path: String, number: u64) -> Result<PullRequestDiff, AppError> {
    github_service::get_pull_request_diff(Path::new(&repo_path), number)
}

#[tauri::command]
pub fn checkout_pull_request(repo_path: String, number: u64) -> Result<(), AppError> {
    github_service::checkout_pull_request(Path::new(&repo_path), number)
}

#[tauri::command]
pub fn update_pull_request_branch(repo_path: String, number: u64) -> Result<(), AppError> {
    github_service::update_pull_request_branch(Path::new(&repo_path), number)
}

#[tauri::command]
pub fn merge_pull_request(repo_path: String, number: u64, method: String) -> Result<(), AppError> {
    github_service::merge_pull_request(Path::new(&repo_path), number, &method)
}
