use serde::Serialize;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub const REPOSITORY_LAUNCH_EVENT: &str = "repository-launch-pending";
pub const HELP: &str = "GitEye — open a Git repository in the desktop app

Usage: giteye [OPTIONS] [--] [PATH]

Arguments:
  [PATH]         Repository directory (relative to the calling shell or absolute)

Options:
  -h, --help     Print help without opening a window
  -V, --version  Print version without opening a window
  --install-cli  Install a user-scoped giteye launcher (no GUI)
  --uninstall-cli Remove only the GitEye-owned launcher (no GUI)
  --install-dir DIR  Choose a directory inside your home for either setup command
  --             Treat the following argument as a path, even if it starts with '-'

Examples:
  giteye .
  giteye \"/path/to/my repository\"
  giteye -- -repository

With no path, open GitEye or activate its existing window.
Repository paths are forwarded to the running instance when one exists.";

#[derive(Debug, PartialEq, Eq)]
pub enum LaunchArguments {
    Open(Option<PathBuf>),
    Help,
    Version,
    InstallCli(Option<PathBuf>),
    UninstallCli(Option<PathBuf>),
}

/// Arguments exclude argv[0]. Parsing is independent of Tauri and the display server.
pub fn parse_arguments(
    args: impl IntoIterator<Item = OsString>,
) -> Result<LaunchArguments, String> {
    let mut path = None;
    let mut output = None;
    let mut installation = None;
    let mut install_dir = None;
    let mut literal = false;
    let mut args = args.into_iter();
    while let Some(argument) = args.next() {
        let argument = argument
            .into_string()
            .map_err(|_| "Repository arguments must be valid Unicode.".to_string())?;
        if !literal && argument == "--" && output.is_none() {
            literal = true;
            continue;
        }
        if !literal && matches!(argument.as_str(), "--install-cli" | "--uninstall-cli") {
            if installation.is_some() || output.is_some() || path.is_some() {
                return Err(
                    "Choose one CLI setup command, without a repository path or output flags."
                        .to_string(),
                );
            }
            installation = Some(argument == "--install-cli");
            continue;
        }
        if !literal && argument == "--install-dir" {
            if install_dir.is_some() || output.is_some() || path.is_some() {
                return Err(
                    "Use --install-dir once, with --install-cli or --uninstall-cli.".to_string(),
                );
            }
            let directory = args
                .next()
                .and_then(|value| value.into_string().ok())
                .filter(|value| !value.is_empty() && !value.starts_with('-'))
                .ok_or("--install-dir requires a directory path.")?;
            install_dir = Some(PathBuf::from(directory));
            continue;
        }
        if !literal && matches!(argument.as_str(), "--help" | "-h" | "--version" | "-V") {
            if output.is_some() || path.is_some() || installation.is_some() || install_dir.is_some()
            {
                return Err("Use --help or --version on its own.".to_string());
            }
            output = Some(if matches!(argument.as_str(), "--help" | "-h") {
                LaunchArguments::Help
            } else {
                LaunchArguments::Version
            });
            continue;
        }
        if output.is_some() {
            return Err("Use --help or --version on its own.".to_string());
        }
        if !literal && argument.starts_with('-') {
            return Err(format!(
                "Unknown option '{argument}'. Use '--' before a path starting with '-'."
            ));
        }
        if installation.is_some() || install_dir.is_some() {
            return Err(
                "CLI setup commands cannot be combined with a repository path.".to_string(),
            );
        }
        if argument.is_empty() {
            return Err("The repository path cannot be empty.".to_string());
        }
        if path.replace(PathBuf::from(argument)).is_some() {
            return Err(
                "Expected at most one repository path. Quote paths containing spaces.".to_string(),
            );
        }
    }
    if let Some(install) = installation {
        return Ok(if install {
            LaunchArguments::InstallCli(install_dir)
        } else {
            LaunchArguments::UninstallCli(install_dir)
        });
    }
    if install_dir.is_some() {
        return Err("--install-dir requires --install-cli or --uninstall-cli.".to_string());
    }
    Ok(output.unwrap_or(LaunchArguments::Open(path)))
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LaunchIntent {
    OpenRepository { path: String },
    Error { message: String },
}

impl LaunchIntent {
    pub fn repository(path: &Path, cwd: &Path) -> Self {
        match resolve_repository_path(path, cwd) {
            Ok(path) => Self::OpenRepository { path },
            Err(message) => Self::Error { message },
        }
    }
}

fn resolve_repository_path(path: &Path, cwd: &Path) -> Result<String, String> {
    // Never resolve a forwarded relative path against the first process's cwd.
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else if cwd.is_absolute() {
        cwd.join(path)
    } else {
        return Err("Cannot resolve the repository path: the calling directory is unavailable. Use an absolute path.".to_string());
    };
    let canonical = absolute.canonicalize().map_err(|error| {
        format!(
            "Cannot open '{}': {error}. Choose an existing Git repository directory.",
            absolute.display()
        )
    })?;
    if !canonical.is_dir() {
        return Err(format!(
            "Cannot open '{}': expected a Git repository directory, not a file.",
            absolute.display()
        ));
    }
    canonical
        .into_os_string()
        .into_string()
        .map_err(|_| "Cannot open this repository: its path is not valid Unicode.".to_string())
}

/// Events are wake-ups only. Intents remain here until the registered frontend
/// listener drains them, so an event emitted before page readiness cannot lose a launch.
pub struct RepositoryLaunchState(Mutex<Vec<LaunchIntent>>);

impl RepositoryLaunchState {
    pub fn new(initial: Option<LaunchIntent>) -> Self {
        Self(Mutex::new(initial.into_iter().collect()))
    }

    fn enqueue(&self, intent: LaunchIntent) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|error| error.to_string())?
            .push(intent);
        Ok(())
    }

    fn take(&self) -> Result<Vec<LaunchIntent>, String> {
        let mut pending = self.0.lock().map_err(|error| error.to_string())?;
        Ok(std::mem::take(&mut *pending))
    }
}

#[tauri::command]
pub fn take_repository_launches(
    state: State<'_, RepositoryLaunchState>,
) -> Result<Vec<LaunchIntent>, String> {
    state.take()
}

#[cfg(desktop)]
pub fn forward_launch(app: &AppHandle, args: Vec<String>, cwd: String) {
    let intent = match parse_arguments(args.into_iter().skip(1).map(OsString::from)) {
        Ok(LaunchArguments::Open(Some(path))) => {
            Some(LaunchIntent::repository(&path, Path::new(&cwd)))
        }
        Ok(LaunchArguments::Open(None)) => None,
        // These flags exit in main before the single-instance plugin is initialized.
        Ok(
            LaunchArguments::Help
            | LaunchArguments::Version
            | LaunchArguments::InstallCli(_)
            | LaunchArguments::UninstallCli(_),
        ) => return,
        Err(message) => Some(LaunchIntent::Error { message }),
    };
    if let Some(intent) = intent {
        if let Err(error) = app.state::<RepositoryLaunchState>().enqueue(intent) {
            eprintln!("Could not queue repository launch: {error}");
        } else if let Err(error) = app.emit_to("main", REPOSITORY_LAUNCH_EVENT, ()) {
            eprintln!("Could not notify the repository launch listener: {error}");
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};

    fn parse(args: &[&str]) -> Result<LaunchArguments, String> {
        parse_arguments(args.iter().map(OsString::from))
    }

    #[test]
    fn distinguishes_output_flags_from_literal_paths() {
        assert_eq!(parse(&[]).unwrap(), LaunchArguments::Open(None));
        assert_eq!(parse(&["-h"]).unwrap(), LaunchArguments::Help);
        assert_eq!(parse(&["--version"]).unwrap(), LaunchArguments::Version);
        assert_eq!(
            parse(&["--", "--help"]).unwrap(),
            LaunchArguments::Open(Some(PathBuf::from("--help")))
        );
        assert_eq!(
            parse(&["repository with spaces"]).unwrap(),
            LaunchArguments::Open(Some(PathBuf::from("repository with spaces")))
        );
    }

    #[test]
    fn rejects_ambiguous_or_unsupported_invocations() {
        for args in [
            vec!["--unknown"],
            vec!["one", "two"],
            vec![""],
            vec!["--help", "repo"],
            vec!["repo", "--version"],
        ] {
            assert!(parse(&args).is_err(), "unexpectedly accepted {args:?}");
        }
    }

    #[test]
    fn parses_setup_commands_without_accepting_repository_arguments() {
        assert_eq!(
            parse(&["--install-cli"]).unwrap(),
            LaunchArguments::InstallCli(None)
        );
        assert_eq!(
            parse(&["--uninstall-cli", "--install-dir", "my bin"]).unwrap(),
            LaunchArguments::UninstallCli(Some(PathBuf::from("my bin")))
        );
        assert_eq!(
            parse(&["--install-dir", "bin", "--install-cli"]).unwrap(),
            LaunchArguments::InstallCli(Some(PathBuf::from("bin")))
        );
        for args in [
            vec!["--install-cli", "."],
            vec!["--install-dir", "bin"],
            vec!["--install-cli", "--uninstall-cli"],
            vec!["--install-cli", "--install-dir"],
        ] {
            assert!(parse(&args).is_err(), "unexpectedly accepted {args:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn non_unicode_arguments_are_rejected_before_plugin_forwarding() {
        use std::os::unix::ffi::OsStringExt;
        assert!(parse_arguments([OsString::from_vec(vec![0xff])]).is_err());
    }

    #[test]
    fn resolves_relative_paths_using_the_invoking_directory() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .canonicalize()
            .unwrap();
        let caller = root.join("src");
        assert_eq!(
            resolve_repository_path(Path::new(".."), &caller).unwrap(),
            root.to_str().unwrap()
        );
        assert_eq!(
            resolve_repository_path(&caller, Path::new("unavailable")).unwrap(),
            caller.to_str().unwrap()
        );
        assert!(resolve_repository_path(Path::new("."), Path::new("")).is_err());
        assert!(resolve_repository_path(&root.join("Cargo.toml"), &root).is_err());
    }

    #[test]
    fn startup_and_early_forwarded_launches_are_consumed_once_in_order() {
        let initial = LaunchIntent::OpenRepository {
            path: "initial".into(),
        };
        let forwarded = LaunchIntent::OpenRepository {
            path: "forwarded".into(),
        };
        let state = RepositoryLaunchState::new(Some(initial.clone()));
        state.enqueue(forwarded.clone()).unwrap();
        assert_eq!(state.take().unwrap(), vec![initial, forwarded]);
        assert!(state.take().unwrap().is_empty());
    }

    #[test]
    fn launch_racing_with_readiness_is_not_lost_or_duplicated() {
        let state = Arc::new(RepositoryLaunchState::new(None));
        let barrier = Arc::new(Barrier::new(2));
        let incoming = LaunchIntent::OpenRepository {
            path: "racing".into(),
        };
        let producer = {
            let state = state.clone();
            let barrier = barrier.clone();
            let incoming = incoming.clone();
            std::thread::spawn(move || {
                barrier.wait();
                state.enqueue(incoming).unwrap();
            })
        };
        barrier.wait();
        let mut observed = state.take().unwrap();
        producer.join().unwrap();
        observed.extend(state.take().unwrap());
        assert_eq!(observed, vec![incoming]);
        assert!(state.take().unwrap().is_empty());
    }
}
