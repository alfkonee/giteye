use crate::errors::AppError;
use crate::git::github_service;
use crate::models::github::RepositoryGithubOverview;
use std::path::Path;

#[tauri::command]
pub fn get_repository_github_overview(repo_path: String) -> Result<RepositoryGithubOverview, AppError> {
    Ok(github_service::get_repository_github_overview(Path::new(&repo_path)))
}
