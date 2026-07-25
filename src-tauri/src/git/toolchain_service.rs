use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::storage;
use bzip2::read::BzDecoder;
use flate2::read::GzDecoder;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::fs::OpenOptions;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex, MutexGuard, TryLockError};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;

const MAX_TOOL_ARCHIVE_BYTES: usize = 100 * 1024 * 1024;
const MAX_TOOL_BINARY_BYTES: u64 = 100 * 1024 * 1024;
const MICROMAMBA_VERSION: &str = "2.3.2";
static INSTALL_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolComponentStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub executable_path: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainStatus {
    pub platform: String,
    pub git: ToolComponentStatus,
    pub lfs: ToolComponentStatus,
    pub lfs_enabled: bool,
    pub install_provider: Option<String>,
    pub can_install_git: bool,
    pub can_install_lfs: bool,
    pub supports_custom_git_version: bool,
    pub user_tools_directory: String,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallGitRequest {
    pub version: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolInstallResult {
    pub message: String,
    pub status: ToolchainStatus,
}

#[derive(Debug, PartialEq, Eq)]
struct CommandSpec {
    program: String,
    args: Vec<String>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

pub fn configure_from_settings(app: &tauri::AppHandle) -> Result<(), AppError> {
    configure_managed_lfs(app)?;
    let settings = storage::load_app_settings(app)?;
    configure_git_executable_path(settings.git_executable_path.as_deref())
}

pub fn configure_git_executable_path(path: Option<&str>) -> Result<(), AppError> {
    let path = path.map(PathBuf::from);
    if let Some(path) = path.as_ref() {
        validate_git_executable(path)?;
    }
    GitCli::set_executable(path)
}

pub fn get_status(app: &tauri::AppHandle) -> ToolchainStatus {
    let installer_supported = micromamba_platform().is_some();
    let git_version = command_version(GitCli::command(), &["--version"]);
    let lfs_version = if git_version.is_some() {
        command_version(GitCli::command(), &["lfs", "version"])
    } else {
        None
    };
    let lfs_enabled = git_version.is_some()
        && GitCli::run(
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .as_path(),
            &["config", "--global", "--get", "filter.lfs.process"],
        )
        .map(|value| value.contains("git-lfs"))
        .unwrap_or(false);
    let tools_directory = user_tools_directory(app).unwrap_or_default();
    let managed_lfs = managed_lfs_binary(app).ok().filter(|path| path.is_file());

    ToolchainStatus {
        platform: std::env::consts::OS.to_string(),
        git: ToolComponentStatus {
            installed: git_version.is_some(),
            version: git_version,
            executable_path: GitCli::executable_path()
                .map(|path| path.to_string_lossy().to_string()),
        },
        lfs: ToolComponentStatus {
            installed: lfs_version.is_some(),
            version: lfs_version,
            executable_path: managed_lfs.map(|path| path.to_string_lossy().to_string()),
        },
        lfs_enabled,
        install_provider: installer_supported
            .then(|| "Isolated Micromamba environment".to_string()),
        can_install_git: installer_supported,
        can_install_lfs: true,
        supports_custom_git_version: installer_supported,
        user_tools_directory: tools_directory.to_string_lossy().to_string(),
    }
}

pub fn install_git(
    app: &tauri::AppHandle,
    request: &InstallGitRequest,
    cancellation: &AtomicBool,
) -> Result<ToolInstallResult, AppError> {
    let _guard = acquire_install_process_lock(cancellation)?;
    let _file_lock = acquire_install_file_lock(app, cancellation)?;
    if micromamba_platform().is_none() {
        return Err(AppError::GitError(
            "This operating-system architecture does not have a supported user-scoped installer. Choose a portable Git executable instead."
                .to_string(),
        ));
    }
    let version = clean_version(request.version.as_deref())?;
    let install_id = format!(
        "{}-{}",
        version.as_deref().unwrap_or("latest"),
        chrono::Utc::now().format("%Y%m%d%H%M%S%3f")
    );
    let install_root = user_tools_directory(app)?
        .join("git")
        .join("versions")
        .join(install_id);
    fs::create_dir_all(&install_root).map_err(|error| AppError::IoError(error.to_string()))?;
    let micromamba = ensure_micromamba(app, cancellation)?;
    let spec = build_install_command(&micromamba, version.as_deref(), &install_root)?;
    if let Err(error) = run_installer(&spec, cancellation) {
        let _ = fs::remove_dir_all(&install_root);
        return Err(error);
    }

    let Some(discovered) = discover_git_executable(&install_root) else {
        let _ = fs::remove_dir_all(&install_root);
        return Err(AppError::GitError(
            "Git installation completed, but GitEye could not find Git. Restart GitEye or choose the installed executable."
                .to_string(),
        ));
    };
    select_git_executable(app, Some(discovered.to_string_lossy().to_string()))?;
    prune_managed_git_versions(app, &install_root);
    let status = get_status(app);
    Ok(ToolInstallResult {
        message: format!(
            "Git {} is ready for this user.",
            status.git.version.as_deref().unwrap_or("")
        ),
        status,
    })
}

pub fn install_and_enable_lfs(
    app: &tauri::AppHandle,
    cancellation: &AtomicBool,
) -> Result<ToolInstallResult, AppError> {
    let _guard = acquire_install_process_lock(cancellation)?;
    let _file_lock = acquire_install_file_lock(app, cancellation)?;
    if command_version(GitCli::command(), &["--version"]).is_none() {
        return Err(AppError::GitNotFound);
    }
    if command_version(GitCli::command(), &["lfs", "version"]).is_none() {
        install_managed_lfs(app, cancellation)?;
        ensure_not_canceled(cancellation)?;
        configure_managed_lfs(app)?;
    }
    ensure_not_canceled(cancellation)?;
    let cwd = std::env::current_dir().map_err(|error| AppError::IoError(error.to_string()))?;
    GitCli::run(&cwd, &["lfs", "install"])?;
    let status = get_status(app);
    if !status.lfs.installed || !status.lfs_enabled {
        return Err(AppError::GitError(
            "Git LFS installation finished, but GitEye could not verify that it is enabled."
                .to_string(),
        ));
    }
    Ok(ToolInstallResult {
        message: "Git LFS is installed in GitEye's user tools directory and enabled for your user account."
            .to_string(),
        status,
    })
}

pub fn select_git_executable(
    app: &tauri::AppHandle,
    executable_path: Option<String>,
) -> Result<ToolchainStatus, AppError> {
    let path = executable_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    if let Some(path) = path.as_ref() {
        validate_git_executable(path)?;
    }
    let stored_path = path
        .as_ref()
        .map(|value| value.to_string_lossy().to_string());
    storage::update_git_executable_path(app, stored_path)?;
    GitCli::set_executable(path)?;
    Ok(get_status(app))
}

fn user_tools_directory(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::StorageError(error.to_string()))?
        .join("tools");
    fs::create_dir_all(&directory).map_err(|error| AppError::StorageError(error.to_string()))?;
    Ok(directory)
}

fn managed_lfs_binary(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let name = if cfg!(target_os = "windows") {
        "git-lfs.exe"
    } else {
        "git-lfs"
    };
    Ok(user_tools_directory(app)?
        .join("git-lfs")
        .join("bin")
        .join(name))
}

fn configure_managed_lfs(app: &tauri::AppHandle) -> Result<(), AppError> {
    let binary = managed_lfs_binary(app)?;
    GitCli::set_tool_path(
        binary
            .is_file()
            .then(|| binary.parent().unwrap().to_path_buf()),
    )
}

fn install_managed_lfs(app: &tauri::AppHandle, cancellation: &AtomicBool) -> Result<(), AppError> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("GitEye toolchain installer")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let release = client
        .get("https://api.github.com/repos/git-lfs/git-lfs/releases/latest")
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| AppError::IoError(error.to_string()))?
        .json::<GithubRelease>()
        .map_err(|error| AppError::SerializationError(error.to_string()))?;
    let asset = select_lfs_asset(&release.assets).ok_or_else(|| {
        AppError::GitError(format!(
            "Git LFS {} has no archive for {} {}",
            release.tag_name,
            std::env::consts::OS,
            std::env::consts::ARCH
        ))
    })?;
    ensure_not_canceled(cancellation)?;
    let bytes = download_limited(&client, &asset.browser_download_url)?;
    ensure_not_canceled(cancellation)?;
    verify_asset_digest(asset, &bytes)?;
    let destination = managed_lfs_binary(app)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| AppError::IoError(error.to_string()))?;
    }
    let temporary = destination.with_extension("download");
    let _ = fs::remove_file(&temporary);
    extract_expected_binary(
        &asset.name,
        &bytes,
        if cfg!(target_os = "windows") {
            "git-lfs.exe"
        } else {
            "git-lfs"
        },
        &temporary,
    )?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o755))
            .map_err(|error| AppError::IoError(error.to_string()))?;
    }
    let _ = fs::remove_file(&destination);
    fs::rename(temporary, destination).map_err(|error| AppError::IoError(error.to_string()))?;
    Ok(())
}

fn download_limited(client: &reqwest::blocking::Client, url: &str) -> Result<Vec<u8>, AppError> {
    let mut response = client
        .get(url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|error| AppError::IoError(error.to_string()))?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_TOOL_ARCHIVE_BYTES as u64)
    {
        return Err(AppError::GitError(
            "Tool archive exceeds the download limit".to_string(),
        ));
    }
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(MAX_TOOL_ARCHIVE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::IoError(error.to_string()))?;
    if bytes.len() > MAX_TOOL_ARCHIVE_BYTES {
        return Err(AppError::GitError(
            "Tool archive exceeds the download limit".to_string(),
        ));
    }
    Ok(bytes)
}

fn select_lfs_asset(assets: &[GithubAsset]) -> Option<&GithubAsset> {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        value => value,
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        value => value,
    };
    assets.iter().find(|asset| {
        let name = asset.name.to_ascii_lowercase();
        name.contains(os)
            && name.contains(arch)
            && (name.ends_with(".tar.gz") || name.ends_with(".zip"))
    })
}

fn verify_asset_digest(asset: &GithubAsset, bytes: &[u8]) -> Result<(), AppError> {
    let expected = asset
        .digest
        .as_deref()
        .and_then(|value| value.strip_prefix("sha256:"))
        .ok_or_else(|| {
            AppError::GitError("Git LFS release is missing a SHA-256 digest".to_string())
        })?;
    let actual = format!("{:x}", Sha256::digest(bytes));
    if actual != expected {
        return Err(AppError::GitError(
            "Downloaded Git LFS archive failed SHA-256 verification".to_string(),
        ));
    }
    Ok(())
}

fn extract_expected_binary(
    archive_name: &str,
    bytes: &[u8],
    expected_name: &str,
    destination: &Path,
) -> Result<(), AppError> {
    let mut output =
        fs::File::create(destination).map_err(|error| AppError::IoError(error.to_string()))?;
    if archive_name.ends_with(".zip") {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|error| AppError::IoError(error.to_string()))?;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| AppError::IoError(error.to_string()))?;
            if entry.is_file()
                && entry.name().rsplit('/').next() == Some(expected_name)
                && entry.size() <= MAX_TOOL_BINARY_BYTES
            {
                std::io::copy(&mut entry, &mut output)
                    .map_err(|error| AppError::IoError(error.to_string()))?;
                return Ok(());
            }
        }
    } else {
        let reader: Box<dyn Read> = if archive_name.ends_with(".tar.gz") {
            Box::new(GzDecoder::new(Cursor::new(bytes)))
        } else if archive_name.ends_with(".tar.bz2") {
            Box::new(BzDecoder::new(Cursor::new(bytes)))
        } else {
            return Err(AppError::GitError("Unsupported tool archive".to_string()));
        };
        let mut archive = tar::Archive::new(reader);
        for entry in archive
            .entries()
            .map_err(|error| AppError::IoError(error.to_string()))?
        {
            let mut entry = entry.map_err(|error| AppError::IoError(error.to_string()))?;
            let path = entry
                .path()
                .map_err(|error| AppError::IoError(error.to_string()))?;
            if entry.header().entry_type().is_file()
                && path.file_name().and_then(|value| value.to_str()) == Some(expected_name)
                && entry.size() <= MAX_TOOL_BINARY_BYTES
            {
                std::io::copy(&mut entry, &mut output)
                    .map_err(|error| AppError::IoError(error.to_string()))?;
                return Ok(());
            }
        }
    }
    drop(output);
    let _ = fs::remove_file(destination);
    Err(AppError::GitError(format!(
        "Tool archive did not contain {expected_name} as a regular file"
    )))
}

fn validate_git_executable(path: &Path) -> Result<(), AppError> {
    if !path.is_file() {
        return Err(AppError::InvalidPath(path.to_string_lossy().to_string()));
    }
    let expected_name = if cfg!(target_os = "windows") {
        "git.exe"
    } else {
        "git"
    };
    if path.file_name().and_then(|value| value.to_str()) != Some(expected_name) {
        return Err(AppError::GitError(format!(
            "The selected executable must be named {expected_name} so Git-dependent tools can locate it"
        )));
    }
    let version = command_version(Command::new(path), &["--version"]);
    if version
        .as_deref()
        .is_none_or(|value| !value.to_ascii_lowercase().starts_with("git version"))
    {
        return Err(AppError::GitError(
            "The selected file is not a working Git executable".to_string(),
        ));
    }
    Ok(())
}

fn discover_git_executable(install_root: &Path) -> Option<PathBuf> {
    let candidates = [
        install_root.join("cmd").join("git.exe"),
        install_root.join("Library").join("bin").join("git.exe"),
        install_root.join("bin").join("git.exe"),
        install_root.join("bin").join("git"),
    ];
    candidates
        .into_iter()
        .find(|path| validate_git_executable(path).is_ok())
}

fn command_version(mut command: Command, args: &[&str]) -> Option<String> {
    let output = command.args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn clean_version(version: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(version) = version.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if version.len() > 64
        || !version
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".+-~".contains(character))
    {
        return Err(AppError::GitError("Invalid Git version".to_string()));
    }
    Ok(Some(version.to_string()))
}

fn build_install_command(
    micromamba: &Path,
    version: Option<&str>,
    install_root: &Path,
) -> Result<CommandSpec, AppError> {
    let package = version.map_or_else(|| "git".to_string(), |value| format!("git={value}"));
    Ok(CommandSpec {
        program: micromamba.to_string_lossy().to_string(),
        args: vec![
            "create".to_string(),
            "--yes".to_string(),
            "--prefix".to_string(),
            install_root.to_string_lossy().to_string(),
            "--channel".to_string(),
            "conda-forge".to_string(),
            package,
        ],
    })
}

fn micromamba_platform() -> Option<(&'static str, &'static str)> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some((
            "win-64",
            "c90484d65d84b88edffa8a9746f26a7cfd9c323f9a634dbf7b03fe7ce386dae1",
        )),
        ("linux", "x86_64") => Some((
            "linux-64",
            "5512233cdd8564a671626081026dc861537a963baa06706baab08fac6f3bb9d2",
        )),
        ("linux", "aarch64") => Some((
            "linux-aarch64",
            "7ded447a291cd1a05efe42c895a43f11fa3446011957cffe899aeabda8c3ee25",
        )),
        ("macos", "x86_64") => Some((
            "osx-64",
            "78b845ea7789d20c0917e60099cd5ea38d684d8d01ce6a8b64c3d919948f8f7b",
        )),
        ("macos", "aarch64") => Some((
            "osx-arm64",
            "ae0b50b441fef93abd20711f18b074359a7f8f1f523a8046a4d6ab44aa68ff1b",
        )),
        _ => None,
    }
}

fn ensure_micromamba(
    app: &tauri::AppHandle,
    cancellation: &AtomicBool,
) -> Result<PathBuf, AppError> {
    let executable_name = if cfg!(target_os = "windows") {
        "micromamba.exe"
    } else {
        "micromamba"
    };
    let destination = user_tools_directory(app)?
        .join("micromamba")
        .join("bin")
        .join(executable_name);
    if destination.is_file()
        && command_version(Command::new(&destination), &["--version"])
            .as_deref()
            .is_some_and(|version| version.contains(MICROMAMBA_VERSION))
    {
        return Ok(destination);
    }
    let _ = fs::remove_file(&destination);
    let (platform, expected_digest) = micromamba_platform().ok_or_else(|| {
        AppError::GitError("Unsupported platform for the user-scoped Git installer".to_string())
    })?;
    let client = reqwest::blocking::Client::builder()
        .user_agent("GitEye toolchain installer")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let bytes = download_limited(
        &client,
        &format!("https://micro.mamba.pm/api/micromamba/{platform}/{MICROMAMBA_VERSION}"),
    )?;
    ensure_not_canceled(cancellation)?;
    let actual_digest = format!("{:x}", Sha256::digest(&bytes));
    if actual_digest != expected_digest {
        return Err(AppError::GitError(
            "Micromamba bootstrap archive failed SHA-256 verification".to_string(),
        ));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| AppError::IoError(error.to_string()))?;
    }
    let temporary = destination.with_extension("download");
    let _ = fs::remove_file(&temporary);
    extract_expected_binary("micromamba.tar.bz2", &bytes, executable_name, &temporary)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o755))
            .map_err(|error| AppError::IoError(error.to_string()))?;
    }
    if command_version(Command::new(&temporary), &["--version"])
        .as_deref()
        .is_none_or(|version| !version.contains(MICROMAMBA_VERSION))
    {
        let _ = fs::remove_file(&temporary);
        return Err(AppError::GitError(
            "Downloaded Micromamba executable failed validation".to_string(),
        ));
    }
    fs::rename(temporary, &destination).map_err(|error| AppError::IoError(error.to_string()))?;
    Ok(destination)
}

fn prune_managed_git_versions(app: &tauri::AppHandle, active: &Path) {
    let Ok(versions) = user_tools_directory(app).map(|path| path.join("git").join("versions"))
    else {
        return;
    };
    let Ok(entries) = fs::read_dir(versions) else {
        return;
    };
    let mut inactive = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && path != active)
        .collect::<Vec<_>>();
    inactive.sort_by_key(|path| {
        std::cmp::Reverse(
            fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .ok(),
        )
    });
    for old_version in inactive.into_iter().skip(1) {
        let _ = fs::remove_dir_all(old_version);
    }
}

fn run_installer(spec: &CommandSpec, cancellation: &AtomicBool) -> Result<(), AppError> {
    let mut child = Command::new(&spec.program)
        .args(&spec.args)
        .spawn()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let deadline = Instant::now() + Duration::from_secs(15 * 60);
    loop {
        if cancellation.load(Ordering::SeqCst) || Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::GitError(if cancellation.load(Ordering::SeqCst) {
                "Tool installation canceled".to_string()
            } else {
                "Tool installation timed out after 15 minutes".to_string()
            }));
        }
        match child
            .try_wait()
            .map_err(|error| AppError::IoError(error.to_string()))?
        {
            Some(status) if status.success() => return Ok(()),
            Some(status) => {
                return Err(AppError::GitError(format!(
                    "Installer exited with status {status}"
                )))
            }
            None => thread::sleep(Duration::from_millis(100)),
        }
    }
}

fn acquire_install_process_lock(
    cancellation: &AtomicBool,
) -> Result<MutexGuard<'static, ()>, AppError> {
    let deadline = Instant::now() + Duration::from_secs(15 * 60);
    loop {
        ensure_not_canceled(cancellation)?;
        if Instant::now() >= deadline {
            return Err(AppError::GitError(
                "Timed out waiting for another tool installation".to_string(),
            ));
        }
        match INSTALL_LOCK.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(TryLockError::WouldBlock) => thread::sleep(Duration::from_millis(100)),
            Err(TryLockError::Poisoned(error)) => return Err(AppError::IoError(error.to_string())),
        }
    }
}

fn acquire_install_file_lock(
    app: &tauri::AppHandle,
    cancellation: &AtomicBool,
) -> Result<fs::File, AppError> {
    let lock = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(user_tools_directory(app)?.join("install.lock"))
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let deadline = Instant::now() + Duration::from_secs(15 * 60);
    loop {
        ensure_not_canceled(cancellation)?;
        if Instant::now() >= deadline {
            return Err(AppError::GitError(
                "Timed out waiting for another GitEye process to finish installing tools"
                    .to_string(),
            ));
        }
        match lock.try_lock_exclusive() {
            Ok(()) => return Ok(lock),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(AppError::IoError(error.to_string())),
        }
    }
}

fn ensure_not_canceled(cancellation: &AtomicBool) -> Result<(), AppError> {
    if cancellation.load(Ordering::SeqCst) {
        Err(AppError::GitError("Tool installation canceled".to_string()))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_user_scoped_installer_commands() {
        let root = Path::new("/home/ada/.local/share/giteye/tools/git/current");
        let spec =
            build_install_command(Path::new("/tools/micromamba"), Some("2.50.1"), root).unwrap();
        assert_eq!(spec.program, "/tools/micromamba");
        assert!(spec
            .args
            .windows(2)
            .any(|args| args == ["--prefix", root.to_str().unwrap()]));
        assert_eq!(spec.args.last().map(String::as_str), Some("git=2.50.1"));
    }

    #[test]
    fn rejects_unsafe_versions() {
        assert!(clean_version(Some("2.50; rm -rf /")).is_err());
        assert!(clean_version(Some("../../git")).is_err());
        assert!(clean_version(Some("2.50:1")).is_err());
    }

    #[test]
    fn selects_matching_lfs_archive() {
        let os = if cfg!(target_os = "macos") {
            "darwin"
        } else {
            std::env::consts::OS
        };
        let arch = if cfg!(target_arch = "x86_64") {
            "amd64"
        } else {
            "arm64"
        };
        let assets = vec![GithubAsset {
            name: format!("git-lfs-{os}-{arch}-v3.7.0.tar.gz"),
            browser_download_url: "https://example.test/lfs".to_string(),
            digest: Some("sha256:test".to_string()),
        }];
        assert!(select_lfs_asset(&assets).is_some());
    }
}
