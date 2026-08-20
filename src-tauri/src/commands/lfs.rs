use crate::errors::AppError;
use crate::git::job_runner::{GitJobRequest, GitJobRunnerState};
use crate::git::lfs_service;
use crate::models::{
    GitJobSummary, LfsCommandPreview, LfsLocks, LfsMigrationRequest, LfsMigrationStart,
    LfsPruneRequest, LfsStatus, LfsTransferOperation, LfsTransferRequest,
};
use std::path::Path;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_lfs_status(repo_path: String) -> Result<LfsStatus, AppError> {
    tauri::async_runtime::spawn_blocking(move || lfs_service::get_lfs_status(Path::new(&repo_path)))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn install_lfs(repo_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || lfs_service::install_lfs(Path::new(&repo_path)))
        .await
        .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn track_lfs_pattern(repo_path: String, pattern: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::track_lfs_pattern(Path::new(&repo_path), &pattern)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn untrack_lfs_pattern(repo_path: String, pattern: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::untrack_lfs_pattern(Path::new(&repo_path), &pattern)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn list_lfs_locks(repo_path: String, remote: Option<String>) -> Result<LfsLocks, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::list_lfs_locks(Path::new(&repo_path), remote.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn lock_lfs_file(
    repo_path: String,
    path: String,
    remote: Option<String>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::lock_lfs_file(Path::new(&repo_path), &path, remote.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn unlock_lfs_file(
    repo_path: String,
    lock_id: String,
    remote: Option<String>,
    force: bool,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::unlock_lfs_file(Path::new(&repo_path), &lock_id, remote.as_deref(), force)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn preview_lfs_transfer(
    repo_path: String,
    request: LfsTransferRequest,
) -> Result<LfsCommandPreview, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::preview_lfs_transfer(Path::new(&repo_path), &request)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub fn start_lfs_transfer(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    request: LfsTransferRequest,
) -> Result<GitJobSummary, AppError> {
    let args = lfs_service::build_transfer_args(&request, false)?;
    let (kind, title, reasons) = match request.operation {
        LfsTransferOperation::Fetch => ("lfs.fetch", "Fetch Git LFS objects", vec![]),
        LfsTransferOperation::Pull => ("lfs.pull", "Pull Git LFS objects", vec!["worktree"]),
        LfsTransferOperation::Push => ("lfs.push", "Push Git LFS objects", vec![]),
    };
    let job = GitJobRequest::new(repo_path, kind, title, args).with_invalidation_reasons(reasons);
    jobs.start_job(app, job)
}

#[tauri::command]
pub async fn preview_lfs_prune(
    repo_path: String,
    request: LfsPruneRequest,
) -> Result<LfsCommandPreview, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::preview_lfs_prune(Path::new(&repo_path), &request)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub fn start_lfs_prune(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    request: LfsPruneRequest,
) -> Result<GitJobSummary, AppError> {
    let args = lfs_service::build_prune_args(&request, false);
    let job = GitJobRequest::new(repo_path, "lfs.prune", "Prune local Git LFS objects", args)
        .with_invalidation_reasons(vec![]);
    jobs.start_job(app, job)
}

#[tauri::command]
pub async fn preview_lfs_fsck(
    repo_path: String,
    revision: Option<String>,
) -> Result<LfsCommandPreview, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::preview_lfs_fsck(Path::new(&repo_path), revision.as_deref())
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub fn start_lfs_fsck(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    revision: Option<String>,
) -> Result<GitJobSummary, AppError> {
    let args = lfs_service::build_fsck_args(revision.as_deref())?;
    let job = GitJobRequest::new(
        repo_path,
        "lfs.fsck",
        "Repair Git LFS object integrity",
        args,
    )
    .with_invalidation_reasons(vec![]);
    jobs.start_job(app, job)
}

#[tauri::command]
pub async fn preview_lfs_migration(
    repo_path: String,
    request: LfsMigrationRequest,
) -> Result<LfsCommandPreview, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        lfs_service::preview_lfs_migration(Path::new(&repo_path), &request)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub fn start_lfs_migration(
    app: AppHandle,
    jobs: State<'_, GitJobRunnerState>,
    repo_path: String,
    request: LfsMigrationRequest,
) -> Result<LfsMigrationStart, AppError> {
    let args = lfs_service::build_migration_args(&request)?;
    let backup_branch = lfs_service::migration_backup_name();
    let preflight_repo_path = repo_path.clone();
    let preflight_backup_branch = backup_branch.clone();
    let mode = match request.mode {
        crate::models::LfsMigrationMode::Import => "import",
        crate::models::LfsMigrationMode::Export => "export",
    };
    let job = GitJobRequest::new(
        repo_path,
        format!("lfs.migrate.{mode}"),
        format!("Git LFS migrate {mode}"),
        args,
    )
    .with_invalidation_reasons(vec!["worktree", "refs", "reflog"])
    .before_start(Box::new(move || {
        lfs_service::create_migration_backup(
            Path::new(&preflight_repo_path),
            &preflight_backup_branch,
        )
    }));
    Ok(LfsMigrationStart {
        backup_branch,
        job: jobs.start_job(app, job)?,
    })
}
