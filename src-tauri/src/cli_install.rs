use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::fs::{Dir, File, OpenOptions};
use cap_tempfile::TempFile;
use directories::BaseDirs;
use serde::Serialize;
#[cfg(test)]
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

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
    Ok((directory, scope))
}

fn resolve_user_directory(directory: &Path, home: &Path) -> Result<PathBuf, String> {
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
            .any(|component| component == Component::ParentDir)
    {
        return Err("The CLI launcher directory must be inside your home directory. System-wide installation is not supported.".to_string());
    }
    Ok(resolved.join(
        directory
            .strip_prefix(ancestor)
            .map_err(|error| error.to_string())?,
    ))
}

fn open_user_directory(directory: &Path, home: &Path, create: bool) -> Result<Option<Dir>, String> {
    let resolved = resolve_user_directory(directory, home)?;
    let root: PathBuf = home
        .components()
        .take_while(|component| !matches!(component, Component::Normal(_)))
        .collect();
    let mut opened = Dir::open_ambient_dir(&root, cap_std::ambient_authority())
        .map_err(|error| error.to_string())?;
    // Pin every ancestor, not just the final directory. Canonicalization alone
    // cannot prevent a writable ancestor from being replaced with a symlink.
    for component in home
        .strip_prefix(&root)
        .map_err(|error| error.to_string())?
        .components()
    {
        opened = opened
            .open_dir_nofollow(component.as_os_str())
            .map_err(|error| error.to_string())?;
    }
    for component in resolved
        .strip_prefix(home)
        .map_err(|error| error.to_string())?
        .components()
    {
        if create {
            match opened.create_dir(component.as_os_str()) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        match opened.open_dir_nofollow(component.as_os_str()) {
            Ok(directory) => opened = directory,
            Err(error) if !create && error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(None)
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(Some(opened))
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

fn owned_launcher(directory: &Dir, path: &Path) -> Result<bool, String> {
    match directory.symlink_metadata(LAUNCHER_NAME) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
        Ok(metadata) => {
            if !metadata.file_type().is_file() {
                return Err(format!(
                    "Refusing to modify '{}': it is not a GitEye-owned launcher file.",
                    path.display()
                ));
            }
            let mut options = OpenOptions::new();
            options.read(true).follow(FollowSymlinks::No);
            let mut file = directory
                .open_with(LAUNCHER_NAME, &options)
                .map_err(|error| error.to_string())?;
            if !file
                .metadata()
                .map_err(|error| error.to_string())?
                .is_file()
            {
                return Err(format!(
                    "Refusing to modify '{}': it is not a regular file.",
                    path.display()
                ));
            }
            let mut header = [0; OWNERSHIP_HEADER.len()];
            let matches =
                file.read_exact(&mut header).is_ok() && header == OWNERSHIP_HEADER.as_bytes();
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
    let contents = launcher_contents(executable)?;
    let opened = open_user_directory(directory, home, true)?
        .ok_or("Cannot open the CLI launcher directory.")?;
    let target = directory.join(LAUNCHER_NAME);
    let installed = owned_launcher(&opened, &target)?;
    write_launcher(&opened, &target, &contents, installed)?;
    Ok(status_at(directory, true))
}

fn write_launcher_file(file: &mut File, contents: &str) -> Result<(), String> {
    file.write_all(contents.as_bytes())
        .map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use cap_std::fs::PermissionsExt;
        file.set_permissions(cap_std::fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn write_launcher(
    directory: &Dir,
    target: &Path,
    contents: &str,
    installed: bool,
) -> Result<(), String> {
    if installed {
        // Never write or chmod an existing inode: even a marked launcher may
        // have hard links elsewhere. Renaming a fresh file also cannot follow
        // a target symlink swapped in after the ownership check.
        let mut staged = TempFile::new(directory).map_err(|error| error.to_string())?;
        write_launcher_file(staged.as_file_mut(), contents)?;
        if !owned_launcher(directory, target)? {
            return Err(
                "The CLI launcher changed during installation. Please try again.".to_string(),
            );
        }
        staged
            .replace(LAUNCHER_NAME)
            .map_err(|error| format!("Cannot install '{}': {error}", target.display()))?;
    } else {
        // Preserve no-clobber semantics if another command appears after the
        // absence check. All access remains relative to the pinned directory.
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        let mut file = directory
            .open_with(LAUNCHER_NAME, &options)
            .map_err(|error| format!("Cannot install '{}': {error}", target.display()))?;
        write_launcher_file(&mut file, contents)?;
    }
    Ok(())
}

pub fn install(install_dir: Option<&Path>) -> Result<CliLauncherStatus, String> {
    let (directory, home) = user_paths(install_dir)?;
    install_at(&directory, &home, &stable_executable()?)
}

pub fn uninstall(install_dir: Option<&Path>) -> Result<CliLauncherStatus, String> {
    let (directory, home) = user_paths(install_dir)?;
    uninstall_at(&directory, &home)
}

fn uninstall_at(directory: &Path, home: &Path) -> Result<CliLauncherStatus, String> {
    if let Some(opened) = open_user_directory(directory, home, false)? {
        remove_launcher(&opened, &directory.join(LAUNCHER_NAME))?;
    }
    let mut status = status_at(directory, false);
    status.instructions = "GitEye CLI launcher removed. No directories, application files, PATH entries, or shell profiles were removed.".to_string();
    Ok(status)
}

fn remove_launcher(directory: &Dir, target: &Path) -> Result<(), String> {
    if owned_launcher(directory, target)? {
        directory
            .remove_file(LAUNCHER_NAME)
            .map_err(|error| format!("Cannot remove '{}': {error}", target.display()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_cli_launcher_status() -> Result<CliLauncherStatus, String> {
    let (directory, home) = user_paths(None)?;
    let installed = match open_user_directory(&directory, &home, false)? {
        Some(opened) => owned_launcher(&opened, &directory.join(LAUNCHER_NAME))?,
        None => false,
    };
    Ok(status_at(&directory, installed))
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
        assert!(uninstall_at(&home.0, &home.0).is_err());
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
        assert!(!uninstall_at(&directory, &home.0).unwrap().installed);
        assert_eq!(
            fs::read_to_string(directory.join("keep")).unwrap(),
            "sibling"
        );
    }

    #[test]
    fn reinstall_does_not_write_through_a_hardlinked_launcher() {
        let home = TemporaryHome::new();
        let victim = home.0.join("keep");
        let original = launcher_contents(Path::new("original application")).unwrap();
        fs::write(&victim, &original).unwrap();
        let target = home.0.join(LAUNCHER_NAME);
        fs::hard_link(&victim, &target).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&victim, fs::Permissions::from_mode(0o600)).unwrap();
        }

        install_at(&home.0, &home.0, Path::new("updated application")).unwrap();
        assert_eq!(fs::read_to_string(&victim).unwrap(), original);
        assert_eq!(
            fs::read_to_string(&target).unwrap(),
            launcher_contents(Path::new("updated application")).unwrap()
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&victim).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        uninstall_at(&home.0, &home.0).unwrap();
        assert_eq!(fs::read_to_string(&victim).unwrap(), original);
    }

    #[test]
    fn a_command_appearing_after_the_absence_check_is_not_replaced() {
        let home = TemporaryHome::new();
        let opened = open_user_directory(&home.0, &home.0, false)
            .unwrap()
            .unwrap();
        let target = home.0.join(LAUNCHER_NAME);
        assert!(!owned_launcher(&opened, &target).unwrap());
        fs::write(&target, "another command").unwrap();

        assert!(write_launcher(&opened, &target, "new launcher", false).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "another command");
    }

    #[test]
    fn an_unrelated_replacement_after_the_ownership_check_is_not_modified() {
        let home = TemporaryHome::new();
        install_at(&home.0, &home.0, Path::new("original application")).unwrap();
        let opened = open_user_directory(&home.0, &home.0, false)
            .unwrap()
            .unwrap();
        let target = home.0.join(LAUNCHER_NAME);
        assert!(owned_launcher(&opened, &target).unwrap());
        fs::remove_file(&target).unwrap();
        fs::write(&target, "another command").unwrap();

        assert!(write_launcher(&opened, &target, "new launcher", true).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "another command");
    }

    #[cfg(unix)]
    #[test]
    fn a_launcher_swapped_for_a_symlink_never_writes_to_its_target() {
        let home = TemporaryHome::new();
        let other = TemporaryHome::new();
        let victim = other.0.join("keep");
        let original = launcher_contents(Path::new("unrelated application")).unwrap();
        fs::write(&victim, &original).unwrap();
        install_at(&home.0, &home.0, Path::new("original application")).unwrap();
        let opened = open_user_directory(&home.0, &home.0, false)
            .unwrap()
            .unwrap();
        let target = home.0.join(LAUNCHER_NAME);
        assert!(owned_launcher(&opened, &target).unwrap());
        fs::remove_file(&target).unwrap();
        std::os::unix::fs::symlink(&victim, &target).unwrap();

        assert!(write_launcher(&opened, &target, "new launcher", true).is_err());
        assert!(remove_launcher(&opened, &target).is_err());
        assert_eq!(fs::read_to_string(&victim).unwrap(), original);
        assert!(fs::symlink_metadata(&target)
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn an_ancestor_swap_cannot_redirect_reinstall_or_uninstall() {
        let home = TemporaryHome::new();
        let other = TemporaryHome::new();
        let parent = home.0.join("custom");
        let directory = parent.join("bin");
        install_at(&directory, &home.0, Path::new("original application")).unwrap();
        let opened = open_user_directory(&directory, &home.0, false)
            .unwrap()
            .unwrap();
        let target = directory.join(LAUNCHER_NAME);
        assert!(owned_launcher(&opened, &target).unwrap());

        fs::create_dir(other.0.join("bin")).unwrap();
        let victim = other.0.join("bin").join(LAUNCHER_NAME);
        let original = launcher_contents(Path::new("unrelated application")).unwrap();
        fs::write(&victim, &original).unwrap();
        let moved = home.0.join("moved");
        fs::rename(&parent, &moved).unwrap();
        std::os::unix::fs::symlink(&other.0, &parent).unwrap();

        let updated = launcher_contents(Path::new("updated application")).unwrap();
        write_launcher(&opened, &target, &updated, true).unwrap();
        assert_eq!(fs::read_to_string(&victim).unwrap(), original);
        assert_eq!(
            fs::read_to_string(moved.join("bin").join(LAUNCHER_NAME)).unwrap(),
            updated
        );
        remove_launcher(&opened, &target).unwrap();
        assert!(!moved.join("bin").join(LAUNCHER_NAME).exists());
        assert_eq!(fs::read_to_string(&victim).unwrap(), original);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_launcher_symlinks_and_directories_outside_home() {
        let home = TemporaryHome::new();
        let other = TemporaryHome::new();
        let target = home.0.join(LAUNCHER_NAME);
        std::os::unix::fs::symlink(other.0.join("unrelated"), &target).unwrap();
        assert!(install_at(&home.0, &home.0, Path::new("giteye")).is_err());
        assert!(uninstall_at(&home.0, &home.0).is_err());
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
