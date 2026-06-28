use crate::errors::AppError;
use crate::git::branch_service;
use crate::git::cli::{has_worktree_changes, required_git_arg};
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::models::{Branch, GitJobSummary};
use std::path::Path;
use tauri::{AppHandle, State};

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
pub fn merge_branch(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    source: String,
) -> Result<GitJobSummary, AppError> {
    let args = merge_args(Path::new(&repo_path), &source, false, false, None)?;
    let request = GitJobRequest::new(repo_path, "merge", "Merge branch", args)
        .with_invalidation_reasons(vec!["refs", "worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn merge_with_options(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    source: String,
    no_ff: bool,
    squash: bool,
    strategy_option: Option<String>,
) -> Result<GitJobSummary, AppError> {
    let args = merge_args(
        Path::new(&repo_path),
        &source,
        no_ff,
        squash,
        strategy_option.as_deref(),
    )?;
    let request = GitJobRequest::new(
        repo_path,
        "merge.options",
        "Merge branch with options",
        args,
    )
    .with_invalidation_reasons(vec!["refs", "worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn delete_branch(repo_path: String, branch_name: String) -> Result<(), AppError> {
    branch_service::delete_branch(Path::new(&repo_path), &branch_name)
}

fn merge_args(
    repo_path: &Path,
    source: &str,
    no_ff: bool,
    squash: bool,
    strategy_option: Option<&str>,
) -> Result<Vec<String>, AppError> {
    let source = required_git_arg(source, "merge source")?;
    if no_ff && squash {
        return Err(AppError::GitError(
            "Cannot combine --no-ff and --squash merge options".to_string(),
        ));
    }

    let current = branch_service::get_current_branch(repo_path)?;
    if current == source {
        return Err(AppError::GitError(format!(
            "Cannot merge branch {source} into itself"
        )));
    }

    if has_worktree_changes(repo_path)? {
        return Err(AppError::GitError(
            "Working tree must be clean before merging branches".to_string(),
        ));
    }

    let mut args = vec!["merge".to_string()];
    if no_ff {
        args.push("--no-ff".to_string());
    }
    if squash {
        args.push("--squash".to_string());
    } else {
        args.push("--no-edit".to_string());
    }
    if let Some(option) = strategy_option
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let option = validate_merge_strategy_option(option)?;
        args.push("-X".to_string());
        args.push(option.to_string());
    }
    args.push(source.to_string());
    Ok(args)
}

fn validate_merge_strategy_option(option: &str) -> Result<&str, AppError> {
    let option = option.trim();
    let is_safe = matches!(
        option,
        "ours"
            | "theirs"
            | "ignore-space-change"
            | "ignore-all-space"
            | "ignore-space-at-eol"
            | "ignore-cr-at-eol"
            | "renormalize"
            | "no-renormalize"
            | "patience"
            | "diff-algorithm=patience"
            | "diff-algorithm=minimal"
            | "diff-algorithm=histogram"
            | "diff-algorithm=myers"
    );
    if !is_safe {
        return Err(AppError::GitError(format!(
            "Unsupported merge strategy option: {option}"
        )));
    }
    Ok(option)
}
