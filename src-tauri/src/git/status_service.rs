use crate::errors::AppError;
use crate::git::repository_service;
use crate::models::GitStatusFile;
use std::path::Path;

pub fn get_status(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    Ok(repository_service::get_repository_snapshot(repo_path)?.files)
}

pub fn get_staged_files(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    let snapshot = repository_service::get_repository_snapshot(repo_path)?;
    Ok(snapshot.files.into_iter().filter(|f| f.staged).collect())
}

pub fn get_unstaged_files(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    let snapshot = repository_service::get_repository_snapshot(repo_path)?;
    Ok(snapshot.files.into_iter().filter(|f| f.unstaged).collect())
}
