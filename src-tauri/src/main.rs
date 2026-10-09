// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> std::process::ExitCode {
    // Release builds remain GUI apps; attaching lets CLI commands write
    // help/errors to the terminal that launched them, without creating one.
    #[cfg(windows)]
    let from_terminal = unsafe {
        windows_sys::Win32::System::Console::AttachConsole(
            windows_sys::Win32::System::Console::ATTACH_PARENT_PROCESS,
        )
    } != 0;
    #[cfg(not(windows))]
    let from_terminal = {
        use std::io::IsTerminal;
        std::io::stdin().is_terminal()
            || std::io::stdout().is_terminal()
            || std::io::stderr().is_terminal()
    };
    match giteye_lib::launch::parse_arguments(std::env::args_os().skip(1)) {
        Ok(giteye_lib::launch::LaunchArguments::Help) => {
            println!("{}", giteye_lib::launch::HELP);
        }
        Ok(giteye_lib::launch::LaunchArguments::Version) => {
            println!("giteye {}", env!("CARGO_PKG_VERSION"));
        }
        Ok(
            action @ (giteye_lib::launch::LaunchArguments::InstallCli(_)
            | giteye_lib::launch::LaunchArguments::UninstallCli(_)),
        ) => {
            let result = match action {
                giteye_lib::launch::LaunchArguments::InstallCli(directory) => {
                    giteye_lib::cli_install::install(directory.as_deref())
                }
                giteye_lib::launch::LaunchArguments::UninstallCli(directory) => {
                    giteye_lib::cli_install::uninstall(directory.as_deref())
                }
                _ => unreachable!(),
            };
            match result {
                Ok(result) => println!("{}\n\n{}", result.path, result.instructions),
                Err(error) => {
                    eprintln!("giteye: {error}");
                    return std::process::ExitCode::FAILURE;
                }
            }
        }
        Ok(giteye_lib::launch::LaunchArguments::Open(path)) => {
            // Terminal launches must return the prompt immediately. Debug builds stay
            // attached so `tauri dev` keeps supervising the process and its logs.
            if from_terminal && !cfg!(debug_assertions) {
                if let Err(error) =
                    giteye_lib::launch::spawn_detached(std::env::args_os().skip(1))
                {
                    eprintln!("giteye: cannot start GitEye in the background: {error}");
                    return std::process::ExitCode::FAILURE;
                }
                return std::process::ExitCode::SUCCESS;
            }
            let intent = path.map(|path| {
                let cwd = std::env::current_dir().unwrap_or_default();
                giteye_lib::launch::LaunchIntent::repository(&path, &cwd)
            });
            giteye_lib::run_with_launch(intent);
        }
        Err(error) => {
            eprintln!("giteye: {error}\nRun 'giteye --help' for usage.");
            return std::process::ExitCode::from(2);
        }
    }
    std::process::ExitCode::SUCCESS
}
