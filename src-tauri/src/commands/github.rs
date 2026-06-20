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
pub fn cancel_repository_github_work(repo_path: String) -> Result<(), AppError> {
    github_service::cancel_repository_github_work(Path::new(&repo_path));
    Ok(())
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
pub fn request_pull_request_review(
    repo_path: String,
    number: u64,
    reviewers: Vec<String>,
    teams: Vec<String>,
) -> Result<(), AppError> {
    github_service::request_pull_request_review(Path::new(&repo_path), number, &reviewers, &teams)
}

#[tauri::command]
pub fn submit_pull_request_review(
    repo_path: String,
    number: u64,
    event: String,
    body: Option<String>,
) -> Result<(), AppError> {
    github_service::submit_pull_request_review(
        Path::new(&repo_path),
        number,
        &event,
        body.as_deref(),
    )
}

#[tauri::command]
pub fn submit_pull_request_line_comment(
    repo_path: String,
    number: u64,
    path: String,
    line: u64,
    side: String,
    body: String,
) -> Result<(), AppError> {
    github_service::submit_pull_request_line_comment(
        Path::new(&repo_path),
        number,
        &path,
        line,
        &side,
        &body,
    )
}

#[tauri::command]
pub fn add_pull_request_label(
    repo_path: String,
    number: u64,
    labels: Vec<String>,
) -> Result<(), AppError> {
    github_service::add_pull_request_label(Path::new(&repo_path), number, &labels)
}

#[tauri::command]
pub fn remove_pull_request_label(
    repo_path: String,
    number: u64,
    labels: Vec<String>,
) -> Result<(), AppError> {
    github_service::remove_pull_request_label(Path::new(&repo_path), number, &labels)
}

#[tauri::command]
pub fn merge_pull_request(repo_path: String, number: u64, method: String) -> Result<(), AppError> {
    github_service::merge_pull_request(Path::new(&repo_path), number, &method)
}
