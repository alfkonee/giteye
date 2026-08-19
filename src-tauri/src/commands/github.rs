use crate::errors::AppError;
use crate::git::github_service;
use crate::models::github::{PullRequestDiff, RepositoryGithubOverview};
use std::path::Path;

#[tauri::command]
pub async fn get_repository_github_overview(
    repo_path: String,
) -> Result<RepositoryGithubOverview, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(github_service::get_repository_github_overview(Path::new(&repo_path)))
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub fn cancel_repository_github_work(repo_path: String) -> Result<(), AppError> {
    github_service::cancel_repository_github_work(Path::new(&repo_path));
    Ok(())
}

#[tauri::command]
pub async fn get_pull_request_diff(repo_path: String, number: u64) -> Result<PullRequestDiff, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::get_pull_request_diff(Path::new(&repo_path), number)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn checkout_pull_request(repo_path: String, number: u64) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::checkout_pull_request(Path::new(&repo_path), number)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn update_pull_request_branch(repo_path: String, number: u64) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::update_pull_request_branch(Path::new(&repo_path), number)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn request_pull_request_review(
    repo_path: String,
    number: u64,
    reviewers: Vec<String>,
    teams: Vec<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::request_pull_request_review(Path::new(&repo_path), number, &reviewers, &teams)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn submit_pull_request_review(
    repo_path: String,
    number: u64,
    event: String,
    body: Option<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::submit_pull_request_review(
            Path::new(&repo_path),
            number,
            &event,
            body.as_deref(),
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn submit_pull_request_line_comment(
    repo_path: String,
    number: u64,
    path: String,
    line: u64,
    side: String,
    body: String,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::submit_pull_request_line_comment(
            Path::new(&repo_path),
            number,
            &path,
            line,
            &side,
            &body,
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn add_pull_request_label(
    repo_path: String,
    number: u64,
    labels: Vec<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::add_pull_request_label(Path::new(&repo_path), number, &labels)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn remove_pull_request_label(
    repo_path: String,
    number: u64,
    labels: Vec<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::remove_pull_request_label(Path::new(&repo_path), number, &labels)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn merge_pull_request(
    repo_path: String,
    number: u64,
    method: String,
    admin: Option<bool>,
    delete_branch: Option<bool>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::merge_pull_request(
            Path::new(&repo_path),
            number,
            &method,
            admin.unwrap_or(false),
            delete_branch.unwrap_or(true),
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn close_pull_request(repo_path: String, number: u64) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        github_service::close_pull_request(Path::new(&repo_path), number)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}
