use crate::errors::AppError;
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::git::submodule_service;
use crate::models::job::GitJobSummary;
use crate::models::submodule::{Submodule, SubmoduleForeachStatus};
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_submodules(repo_path: String) -> Result<Vec<Submodule>, AppError> {
    submodule_service::list_submodules(Path::new(&repo_path))
}

#[tauri::command]
pub fn update_submodule(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    path: String,
    recursive: bool,
) -> Result<GitJobSummary, AppError> {
    let path = path.trim().to_string();
    submodule_service::validate_relative_path(&path)?;

    let mut args = vec![
        "submodule".to_string(),
        "update".to_string(),
        "--init".to_string(),
    ];
    if recursive {
        args.push("--recursive".to_string());
    }
    args.push("--".to_string());
    args.push(path);
    let request = GitJobRequest::new(repo_path, "submodule.update", "Update submodule", args)
        .with_invalidation_reasons(vec!["worktree", "refs"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn add_submodule(
    repo_path: String,
    url: String,
    path: String,
    branch: Option<String>,
    name: Option<String>,
) -> Result<(), AppError> {
    submodule_service::add_submodule(
        Path::new(&repo_path),
        &url,
        &path,
        branch.as_deref(),
        name.as_deref(),
    )
}

#[tauri::command]
pub fn sync_submodules(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    recursive: bool,
) -> Result<GitJobSummary, AppError> {
    let mut args = vec!["submodule".to_string(), "sync".to_string()];
    if recursive {
        args.push("--recursive".to_string());
    }
    let request = GitJobRequest::new(repo_path, "submodule.sync", "Sync submodules", args)
        .with_invalidation_reasons(vec!["worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn submodule_init_update(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    path: Option<String>,
    recursive: bool,
    remote: bool,
) -> Result<GitJobSummary, AppError> {
    let mut args = vec![
        "submodule".to_string(),
        "update".to_string(),
        "--init".to_string(),
    ];
    if recursive {
        args.push("--recursive".to_string());
    }
    if remote {
        args.push("--remote".to_string());
    }
    if let Some(path) = path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        submodule_service::validate_relative_path(&path)?;
        args.push("--".to_string());
        args.push(path);
    }
    let request = GitJobRequest::new(
        repo_path,
        "submodule.initUpdate",
        "Initialize and update submodules",
        args,
    )
    .with_invalidation_reasons(vec!["worktree", "refs", "remote"]);
    jobs.start_job(app, request)
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
