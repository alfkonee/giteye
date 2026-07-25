use crate::errors::AppError;
use crate::git::toolchain_service::{self, InstallGitRequest, ToolInstallResult, ToolchainStatus};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Default)]
pub struct ToolchainInstallerState {
    cancellation: Arc<AtomicBool>,
}

#[tauri::command]
pub fn get_toolchain_status(app_handle: tauri::AppHandle) -> ToolchainStatus {
    toolchain_service::get_status(&app_handle)
}

#[tauri::command]
pub async fn install_git_toolchain(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, ToolchainInstallerState>,
    request: InstallGitRequest,
) -> Result<ToolInstallResult, AppError> {
    state.cancellation.store(false, Ordering::SeqCst);
    let cancellation = Arc::clone(&state.cancellation);
    tauri::async_runtime::spawn_blocking(move || {
        toolchain_service::install_git(&app_handle, &request, &cancellation)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn install_and_enable_lfs(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, ToolchainInstallerState>,
) -> Result<ToolInstallResult, AppError> {
    state.cancellation.store(false, Ordering::SeqCst);
    let cancellation = Arc::clone(&state.cancellation);
    tauri::async_runtime::spawn_blocking(move || {
        toolchain_service::install_and_enable_lfs(&app_handle, &cancellation)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub fn cancel_toolchain_install(state: tauri::State<'_, ToolchainInstallerState>) {
    state.cancellation.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn select_git_executable(
    app_handle: tauri::AppHandle,
    executable_path: Option<String>,
) -> Result<ToolchainStatus, AppError> {
    toolchain_service::select_git_executable(&app_handle, executable_path)
}
