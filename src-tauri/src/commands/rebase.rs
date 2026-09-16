use crate::errors::AppError;
use crate::git::cli::{has_worktree_changes, required_git_arg};
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::git::{conflict_service, rebase_service};
use crate::models::job::GitJobSummary;
use crate::models::rebase::{
    ConflictContent, ConflictResolutionRequest, OperationSnapshot, RebasePreviewItem,
    RebaseTodoItem, RerereStatus,
};
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_conflict_content(
    repo_path: String,
    file_path: String,
) -> Result<ConflictContent, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        conflict_service::get_conflict_content(Path::new(&repo_path), &file_path)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn save_conflict_result(
    app: AppHandle,
    repo_path: String,
    request: ConflictResolutionRequest,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<GitJobRunnerState>()
            .with_repo_mutation_lock(&repo_path, || {
                conflict_service::save_conflict_result(Path::new(&repo_path), &request)?;
                crate::git::repository_service::note_repository_change(
                    Path::new(&repo_path),
                    crate::git::state_graph::RepoStateReason::Worktree,
                );
                Ok(())
            })
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn mark_conflict_resolved(
    app: AppHandle,
    repo_path: String,
    request: ConflictResolutionRequest,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<GitJobRunnerState>()
            .with_repo_mutation_lock(&repo_path, || {
                conflict_service::mark_conflict_resolved(Path::new(&repo_path), &request)?;
                crate::git::repository_service::note_repository_change(
                    Path::new(&repo_path),
                    crate::git::state_graph::RepoStateReason::Worktree,
                );
                Ok(())
            })
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn update_rebase_todo(
    app: AppHandle,
    repo_path: String,
    items: Vec<RebaseTodoItem>,
) -> Result<(), AppError> {
    let expected = rebase_service::get_operation_summary(Path::new(&repo_path))?.id;
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<GitJobRunnerState>()
            .with_repo_mutation_lock(&repo_path, || {
                let current = rebase_service::get_operation_summary(Path::new(&repo_path))?;
                if current.id != expected || !current.rebase.in_progress {
                    return Err(AppError::GitError(
                        "The rebase changed. Reload the todo list.".into(),
                    ));
                }
                rebase_service::update_rebase_todo(Path::new(&repo_path), items)
            })
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn preview_rebase(
    repo_path: String,
    upstream: String,
    onto: Option<String>,
    branch: Option<String>,
) -> Result<Vec<RebasePreviewItem>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        rebase_service::preview_rebase(
            Path::new(&repo_path),
            &upstream,
            onto.as_deref(),
            branch.as_deref(),
        )
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub fn rebase_onto(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    upstream: String,
    onto: String,
    branch: Option<String>,
    autostash: bool,
) -> Result<GitJobSummary, AppError> {
    let args = rebase_onto_args(
        Path::new(&repo_path),
        &upstream,
        &onto,
        branch.as_deref(),
        autostash,
    )?;
    let request = GitJobRequest::new(repo_path, "rebase.onto", "Rebase onto target", args)
        .with_invalidation_reasons(vec!["rebase", "refs", "worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub fn rebase_upstream(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    upstream: String,
    branch: Option<String>,
    autostash: bool,
) -> Result<GitJobSummary, AppError> {
    let args = rebase_upstream_args(
        Path::new(&repo_path),
        &upstream,
        branch.as_deref(),
        autostash,
    )?;
    let request = GitJobRequest::new(repo_path, "rebase.upstream", "Rebase onto upstream", args)
        .with_invalidation_reasons(vec!["rebase", "refs", "worktree"]);
    jobs.start_job(app, request)
}

#[tauri::command]
pub async fn get_rerere_config(repo_path: String) -> Result<bool, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        rebase_service::get_rerere_config(Path::new(&repo_path))
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn get_rerere_status(repo_path: String) -> Result<RerereStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        rebase_service::get_rerere_status(Path::new(&repo_path))
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn set_rerere_enabled(
    repo_path: String,
    enabled: bool,
) -> Result<RerereStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        rebase_service::set_rerere_enabled(Path::new(&repo_path), enabled)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn get_operation_summary(repo_path: String) -> Result<OperationSnapshot, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        rebase_service::get_operation_summary(Path::new(&repo_path))
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

fn rebase_onto_args(
    repo_path: &Path,
    upstream: &str,
    onto: &str,
    branch: Option<&str>,
    autostash: bool,
) -> Result<Vec<String>, AppError> {
    let upstream = required_git_arg(upstream, "rebase upstream")?;
    let onto = required_git_arg(onto, "rebase onto target")?;
    ensure_rebase_worktree_ready(repo_path, autostash)?;

    let mut args = vec!["rebase".to_string()];
    if autostash {
        args.push("--autostash".to_string());
    }
    args.push("--onto".to_string());
    args.push(onto.to_string());
    args.push(upstream.to_string());
    if let Some(branch) = branch.map(str::trim).filter(|value| !value.is_empty()) {
        args.push(required_git_arg(branch, "rebase branch")?.to_string());
    }
    Ok(args)
}

fn rebase_upstream_args(
    repo_path: &Path,
    upstream: &str,
    branch: Option<&str>,
    autostash: bool,
) -> Result<Vec<String>, AppError> {
    let upstream = required_git_arg(upstream, "rebase upstream")?;
    ensure_rebase_worktree_ready(repo_path, autostash)?;

    let mut args = vec!["rebase".to_string()];
    if autostash {
        args.push("--autostash".to_string());
    }
    args.push(upstream.to_string());
    if let Some(branch) = branch.map(str::trim).filter(|value| !value.is_empty()) {
        args.push(required_git_arg(branch, "rebase branch")?.to_string());
    }
    Ok(args)
}

fn ensure_rebase_worktree_ready(repo_path: &Path, autostash: bool) -> Result<(), AppError> {
    if !autostash && has_worktree_changes(repo_path)? {
        return Err(AppError::GitError(
            "Working tree must be clean before rebasing without autostash".to_string(),
        ));
    }
    Ok(())
}
