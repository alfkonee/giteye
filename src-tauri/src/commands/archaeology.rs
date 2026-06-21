use crate::errors::AppError;
use crate::git::archaeology_service;
use crate::models::{
    BlameLine, CommitSearchResult, FileHistoryEntry, GitGrepMatch, LostCommit, PickaxeSearchResult,
    ReflogEntry,
};
use std::path::Path;

#[tauri::command]
pub fn commit_search(
    repo_path: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<CommitSearchResult>, AppError> {
    archaeology_service::commit_search(Path::new(&repo_path), &query, limit)
}

#[tauri::command]
pub fn file_history(
    repo_path: String,
    file_path: String,
    limit: Option<u32>,
) -> Result<Vec<FileHistoryEntry>, AppError> {
    archaeology_service::file_history(Path::new(&repo_path), &file_path, limit)
}

#[tauri::command]
pub fn blame_file(
    repo_path: String,
    file_path: String,
    revision: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<BlameLine>, AppError> {
    archaeology_service::blame_file(
        Path::new(&repo_path),
        &file_path,
        revision.as_deref(),
        limit,
    )
}

#[tauri::command]
pub fn git_grep(
    repo_path: String,
    query: String,
    pathspec: Option<String>,
    case_sensitive: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<GitGrepMatch>, AppError> {
    archaeology_service::git_grep(
        Path::new(&repo_path),
        &query,
        pathspec.as_deref(),
        case_sensitive,
        limit,
    )
}

#[tauri::command]
pub fn pickaxe_search(
    repo_path: String,
    query: String,
    regex: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<PickaxeSearchResult>, AppError> {
    archaeology_service::pickaxe_search(Path::new(&repo_path), &query, regex, limit)
}

#[tauri::command]
pub fn discover_lost_commits(
    repo_path: String,
    limit: Option<u32>,
) -> Result<Vec<LostCommit>, AppError> {
    archaeology_service::discover_lost_commits(Path::new(&repo_path), limit)
}

#[tauri::command]
pub fn reflog_search(
    repo_path: String,
    query: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<ReflogEntry>, AppError> {
    archaeology_service::reflog_search(Path::new(&repo_path), query.as_deref(), limit)
}
