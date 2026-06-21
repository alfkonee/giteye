use crate::errors::AppError;
use crate::git::patch_service;
use crate::models::PatchApplyRequest;
use std::path::Path;

#[tauri::command]
pub fn apply_patch(repo_path: String, request: PatchApplyRequest) -> Result<(), AppError> {
    patch_service::apply_patch(Path::new(&repo_path), request)
}

#[tauri::command]
pub fn stage_hunk(
    repo_path: String,
    file_path: String,
    hunk_patch: String,
) -> Result<(), AppError> {
    patch_service::stage_hunk(Path::new(&repo_path), &file_path, &hunk_patch)
}

#[tauri::command]
pub fn unstage_hunk(
    repo_path: String,
    file_path: String,
    hunk_patch: String,
) -> Result<(), AppError> {
    patch_service::unstage_hunk(Path::new(&repo_path), &file_path, &hunk_patch)
}

#[tauri::command]
pub fn discard_hunk(
    repo_path: String,
    file_path: String,
    staged: bool,
    hunk_patch: String,
) -> Result<(), AppError> {
    patch_service::discard_hunk(Path::new(&repo_path), &file_path, staged, &hunk_patch)
}

#[tauri::command]
pub fn discard_file(
    repo_path: String,
    file_path: String,
    staged: bool,
    untracked: bool,
) -> Result<(), AppError> {
    patch_service::discard_file(Path::new(&repo_path), &file_path, staged, untracked)
}
