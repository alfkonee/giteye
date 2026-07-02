use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::git::job_runner::GitJobRunnerState;
use crate::git::status_service;
use crate::models::GitStatusFile;
use std::path::Path;
use tauri::State;

#[tauri::command]
pub fn get_status(repo_path: String) -> Result<Vec<GitStatusFile>, AppError> {
    status_service::get_status(Path::new(&repo_path))
}

#[tauri::command]
pub fn get_staged_files(repo_path: String) -> Result<Vec<GitStatusFile>, AppError> {
    status_service::get_staged_files(Path::new(&repo_path))
}

#[tauri::command]
pub fn get_unstaged_files(repo_path: String) -> Result<Vec<GitStatusFile>, AppError> {
    status_service::get_unstaged_files(Path::new(&repo_path))
}

#[tauri::command]
pub fn stage_file(
    repo_path: String,
    file_path: String,
    jobs: State<'_, GitJobRunnerState>,
) -> Result<(), AppError> {
    jobs.with_repo_mutation_lock(&repo_path, || {
        GitCli::run(Path::new(&repo_path), &["add", "--", &file_path])?;
        Ok(())
    })
}

#[tauri::command]
pub fn unstage_file(
    repo_path: String,
    file_path: String,
    jobs: State<'_, GitJobRunnerState>,
) -> Result<(), AppError> {
    jobs.with_repo_mutation_lock(&repo_path, || {
        GitCli::run(
            Path::new(&repo_path),
            &["restore", "--staged", "--", &file_path],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn stage_all(repo_path: String, jobs: State<'_, GitJobRunnerState>) -> Result<(), AppError> {
    jobs.with_repo_mutation_lock(&repo_path, || {
        GitCli::run(Path::new(&repo_path), &["add", "-A"])?;
        Ok(())
    })
}

#[tauri::command]
pub fn unstage_all(repo_path: String, jobs: State<'_, GitJobRunnerState>) -> Result<(), AppError> {
    jobs.with_repo_mutation_lock(&repo_path, || {
        GitCli::run(Path::new(&repo_path), &["reset", "HEAD"])?;
        Ok(())
    })
}

#[tauri::command]
pub fn commit(
    repo_path: String,
    message: String,
    jobs: State<'_, GitJobRunnerState>,
) -> Result<(), AppError> {
    jobs.with_repo_mutation_lock(&repo_path, || {
        GitCli::run(Path::new(&repo_path), &["commit", "-m", &message])?;
        Ok(())
    })
}
