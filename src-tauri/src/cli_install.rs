use directories::BaseDirs;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

#[cfg(windows)]
const LAUNCHER_NAME: &str = "giteye.cmd";
#[cfg(not(windows))]
const LAUNCHER_NAME: &str = "giteye";
#[cfg(windows)]
const OWNERSHIP_HEADER: &str = "@echo off\r\nrem GitEye CLI launcher v1\r\n";
#[cfg(not(windows))]
const OWNERSHIP_HEADER: &str = "#!/bin/sh\n# GitEye CLI launcher v1\n";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliLauncherStatus {
    pub path: String,
    pub installed: bool,
    pub on_path: bool,
    pub instructions: String,
}

fn user_paths(install_dir: Option<&Path>) -> Result<(PathBuf, PathBuf), String> {
    let dirs = BaseDirs::new().ok_or("Cannot locate your home directory.")?;
    let home = dirs
        .home_dir()
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let directory = match install_dir {
        Some(path) if path.is_absolute() => path.to_path_buf(),
        Some(path) => std::env::current_dir()
            .map_err(|error| error.to_string())?
            .join(path),
        None => {
            #[cfg(windows)]
            {
                dirs.data_local_dir().join("GitEye").join("bin")
            }
            #[cfg(not(windows))]
            {
                home.join(".local").join("bin")
            }
        }
    };
    #[cfg(windows)]
    let scope = if install_dir.is_none() {
        // Windows may redirect LocalAppData outside the profile's home directory.
        dirs.data_local_dir()
            .canonicalize()
            .map_err(|error| error.to_string())?
    } else {
        home
    };
    #[cfg(not(windows))]
    let scope = home;
    ensure_user_directory(&directory, &scope)?;
    Ok((directory, scope))
}

fn ensure_user_directory(directory: &Path, home: &Path) -> Result<(), String> {
    let mut ancestor = directory;
    while !ancestor.try_exists().map_err(|error| error.to_string())? {
        ancestor = ancestor
            .parent()
            .ok_or("Cannot locate the launcher directory's parent.")?;
    }
    let resolved = ancestor.canonicalize().map_err(|error| error.to_string())?;
    if !resolved.starts_with(home)
        || !resolved.is_dir()
        || directory
            .components()
            .any(|component| component == std::path::Component::ParentDir)
    {
        return Err("The CLI launcher directory must be inside your home directory. System-wide installation is not supported.".to_string());
    }
    Ok(())
}

fn stable_executable() -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    if let Some(appimage) = std::env::var_os("APPIMAGE").filter(|value| !value.is_empty()) {
        let executable = PathBuf::from(appimage).canonicalize().map_err(|error| {
            format!("Cannot locate the AppImage file: {error}. Move it to a permanent location and try again.")
        })?;
        if !executable.is_file() {
            return Err(
                "APPIMAGE must point to the original AppImage file, not a directory.".to_string(),
            );
        }
        return Ok(executable);
    }
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    if executable
        .components()
        .any(|part| part.as_os_str() == "AppTranslocation")
    {
        return Err(
            "Move GitEye.app to a permanent location, reopen it, and install the CLI again."
                .to_string(),
        );
    }
    #[cfg(target_os = "linux")]
    if std::env::var_os("APPDIR").is_some_and(|appdir| executable.starts_with(appdir)) {
        return Err("Cannot install from a temporary AppImage mount without APPIMAGE. Run the original AppImage file.".to_string());
    }
    executable.canonicalize().map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn launcher_contents(executable: &Path) -> Result<String, String> {
    let executable = executable
        .to_str()
        .ok_or("The application path must be valid Unicode.")?;
    if executable.contains(['\r', '\n']) {
        return Err("The application path cannot contain a newline.".to_string());
    }
    #[cfg(windows)]
    {
        Ok(format!(
            "{OWNERSHIP_HEADER}\"{}\" %*\r\nexit /b %errorlevel%\r\n",
            executable.replace('%', "%%")
        ))
    }
    #[cfg(not(windows))]
    {
        Ok(format!(
            "{OWNERSHIP_HEADER}exec {} \"$@\"\n",
            shell_quote(executable)
        ))
    }
}

fn owned_launcher(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
        Ok(metadata) => {
            if !metadata.file_type().is_file() {
                return Err(format!(
                    "Refusing to modify '{}': it is not a GitEye-owned launcher file.",
                    path.display()
                ));
            }
            let mut header = [0; OWNERSHIP_HEADER.len()];
            let matches = fs::File::open(path)
                .and_then(|mut file| file.read_exact(&mut header))
                .is_ok()
                && header == OWNERSHIP_HEADER.as_bytes();
            if !matches {
                return Err(format!("Refusing to modify '{}': an unrelated command already exists. Choose another user directory with --install-dir.", path.display()));
            }
            Ok(true)
        }
    }
}

fn on_path(directory: &Path) -> bool {
    let directory = directory
        .canonicalize()
        .unwrap_or_else(|_| directory.to_path_buf());
    std::env::var_os("PATH").is_some_and(|path| {
        std::env::split_paths(&path).any(|entry| entry.canonicalize().unwrap_or(entry) == directory)
    })
}

fn status_at(directory: &Path, installed: bool) -> CliLauncherStatus {
    let on_path = on_path(directory);
    let instructions = if !installed {
        "The CLI launcher is not installed. Installing only writes a launcher in your user directory; it does not modify PATH or shell profiles.".to_string()
    } else if on_path {
        "CLI installed. In a terminal, run: giteye .\nKeep the GitEye application in its current location; reinstall the launcher if you move it.".to_string()
    } else {
        #[cfg(windows)]
        {
            format!("Add '{}' to your user Path using Settings → System → About → Advanced system settings → Environment Variables → User variables → Path → Edit → New. Open a new terminal, then run: giteye .\nNo PATH or system settings were changed. Keep GitEye in its current location or reinstall the launcher after moving it.", directory.display())
        }
        #[cfg(not(windows))]
        {
            format!("Add this directory to PATH in your shell configuration, then open a new terminal:\n\nsh/bash/zsh: export PATH={}:\"$PATH\"\nfish: fish_add_path {}\n\nThen run: giteye .\nNo shell profiles or PATH settings were changed. Keep GitEye in its current location or reinstall the launcher after moving it.", shell_quote(&directory.to_string_lossy()), shell_quote(&directory.to_string_lossy()))
        }
    };
    CliLauncherStatus {
        path: directory.join(LAUNCHER_NAME).to_string_lossy().into_owned(),
        installed,
        on_path,
        instructions,
    }
}

fn install_at(
    directory: &Path,
    home: &Path,
    executable: &Path,
) -> Result<CliLauncherStatus, String> {
    ensure_user_directory(directory, home)?;
    let contents = launcher_contents(executable)?;
    let target = directory.join(LAUNCHER_NAME);
    let installed = owned_launcher(&target)?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    // Recheck after directory creation to reject symlinks escaping the user scope.
    ensure_user_directory(directory, home)?;
    let mut options = OpenOptions::new();
    options.write(true);
    if installed {
        options.truncate(true);
    } else {
        options.create_new(true);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o755);
    }
    let mut file = options
        .open(&target)
        .map_err(|error| format!("Cannot install '{}': {error}", target.display()))?;
    file.write_all(contents.as_bytes())
        .map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
    }
    Ok(status_at(directory, true))
}

pub fn install(install_dir: Option<&Path>) -> Result<CliLauncherStatus, String> {
    let (directory, home) = user_paths(install_dir)?;
    install_at(&directory, &home, &stable_executable()?)
}

pub fn uninstall(install_dir: Option<&Path>) -> Result<CliLauncherStatus, String> {
    let (directory, _) = user_paths(install_dir)?;
    uninstall_at(&directory)
}

fn uninstall_at(directory: &Path) -> Result<CliLauncherStatus, String> {
    let target = directory.join(LAUNCHER_NAME);
    if owned_launcher(&target)? {
        fs::remove_file(&target)
            .map_err(|error| format!("Cannot remove '{}': {error}", target.display()))?;
    }
    let mut status = status_at(directory, false);
    status.instructions = "GitEye CLI launcher removed. No directories, application files, PATH entries, or shell profiles were removed.".to_string();
    Ok(status)
}

#[tauri::command]
pub fn get_cli_launcher_status() -> Result<CliLauncherStatus, String> {
    let (directory, _) = user_paths(None)?;
    Ok(status_at(
        &directory,
        owned_launcher(&directory.join(LAUNCHER_NAME))?,
    ))
}

#[tauri::command]
pub fn install_cli_launcher() -> Result<CliLauncherStatus, String> {
    install(None)
}

#[tauri::command]
pub fn uninstall_cli_launcher() -> Result<CliLauncherStatus, String> {
    uninstall(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);

    struct TemporaryHome(PathBuf);
    impl TemporaryHome {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "giteye-cli-install-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self(path.canonicalize().unwrap())
        }
    }
    impl Drop for TemporaryHome {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn install_and_uninstall_never_replace_an_unrelated_command() {
        let home = TemporaryHome::new();
        let target = home.0.join(LAUNCHER_NAME);
        fs::write(&target, "unrelated command").unwrap();
        assert!(install_at(&home.0, &home.0, Path::new("giteye")).is_err());
        assert!(uninstall_at(&home.0).is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "unrelated command");
    }

    #[test]
    fn install_can_update_only_its_owned_launcher_and_uninstall_preserves_siblings() {
        let home = TemporaryHome::new();
        let directory = home.0.join("bin");
        assert!(
            install_at(&directory, &home.0, Path::new("first giteye"))
                .unwrap()
                .installed
        );
        install_at(&directory, &home.0, Path::new("second giteye")).unwrap();
        assert_eq!(
            fs::read_to_string(directory.join(LAUNCHER_NAME)).unwrap(),
            launcher_contents(Path::new("second giteye")).unwrap()
        );
        fs::write(directory.join("keep"), "sibling").unwrap();
        assert!(!uninstall_at(&directory).unwrap().installed);
        assert_eq!(
            fs::read_to_string(directory.join("keep")).unwrap(),
            "sibling"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_launcher_symlinks_and_directories_outside_home() {
        let home = TemporaryHome::new();
        let other = TemporaryHome::new();
        let target = home.0.join(LAUNCHER_NAME);
        std::os::unix::fs::symlink(other.0.join("unrelated"), &target).unwrap();
        assert!(install_at(&home.0, &home.0, Path::new("giteye")).is_err());
        assert!(uninstall_at(&home.0).is_err());
        assert!(install_at(&other.0, &home.0, Path::new("giteye")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn installed_launcher_preserves_cwd_and_argument_boundaries() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Command;
        let home = TemporaryHome::new();
        let executable = home.0.join("Git Eye's app");
        fs::write(&executable, "#!/bin/sh\nprintf '%s\\n' \"$PWD\" \"$@\"\n").unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
        let directory = home.0.join("bin");
        install_at(&directory, &home.0, &executable).unwrap();
        let output = Command::new(directory.join(LAUNCHER_NAME))
            .current_dir(&home.0)
            .args([
                "repo with spaces",
                "--",
                "-leading-dash",
                "$(not-a-command)",
            ])
            .output()
            .unwrap();
        assert!(output.status.success());
        assert_eq!(
            String::from_utf8(output.stdout).unwrap(),
            format!(
                "{}\nrepo with spaces\n--\n-leading-dash\n$(not-a-command)\n",
                home.0.display()
            )
        );
    }
}
