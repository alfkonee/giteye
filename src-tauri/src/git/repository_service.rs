use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::RepositoryInfo;
use std::path::Path;

pub fn get_repository_info(path: &Path) -> Result<RepositoryInfo, AppError> {
    let name = GitCli::repo_name_from_path(path);

    let current_branch = GitCli::run(path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let head_commit = GitCli::run(path, &["rev-parse", "HEAD"])
        .map(|s| Some(s.trim().to_string()))
        .unwrap_or(None);

    let is_clean = GitCli::run(path, &["status", "--porcelain"])
        .map(|s| s.trim().is_empty())
        .unwrap_or(false);

    Ok(RepositoryInfo {
        path: path.to_string_lossy().to_string(),
        name,
        current_branch,
        is_clean,
        head_commit,
    })
}
