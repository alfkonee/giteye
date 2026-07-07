mod commands;
mod errors;
mod git;
mod models;
mod storage;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_linux_webkit_environment();

    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_mcp_bridge::init());

    builder
        .manage(watcher::RepositoryWatcherState::default())
        .manage(git::job_runner::GitJobRunnerState::default())
        .setup(|_app| {
            if !git::cli::GitCli::is_git_available() {
                eprintln!("Warning: Git is not installed or not in PATH");
            }
            configure_linux_webview(_app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::repository::open_repository,
            commands::repository::init_repository,
            commands::repository::clone_repository,
            commands::repository::get_repository_info,
            commands::repository::get_repository_snapshot,
            commands::repository::get_branch_summary,
            commands::repository::get_workspace_summary,
            commands::repository::warm_repository_context,
            commands::repository::list_recent_repositories,
            commands::repository::list_favorite_repositories,
            commands::repository::set_repository_favorite,
            commands::repository::remove_recent_repository,
            commands::jobs::list_git_jobs,
            commands::jobs::get_git_job,
            commands::jobs::cancel_git_job,
            commands::jobs::clear_git_job_log,
            watcher::start_repository_watch,
            watcher::stop_repository_watch,
            commands::status::get_status,
            commands::status::get_staged_files,
            commands::status::get_unstaged_files,
            commands::status::stage_file,
            commands::status::unstage_file,
            commands::status::stage_all,
            commands::status::unstage_all,
            commands::status::commit,
            commands::commits::get_commit_history,
            commands::commits::get_commit_details,
            commands::archaeology::commit_search,
            commands::archaeology::file_history,
            commands::archaeology::blame_file,
            commands::archaeology::git_grep,
            commands::archaeology::pickaxe_search,
            commands::archaeology::discover_lost_commits,
            commands::archaeology::reflog_search,
            commands::history::cherry_pick_commit,
            commands::history::revert_commit,
            commands::history::preview_reset_to_commit,
            commands::history::reset_to_commit,
            commands::history::preview_amend,
            commands::history::amend_commit,
            commands::history::list_reflog_entries,
            commands::history::checkout_reflog_entry,
            commands::history::create_branch_from_reflog_entry,
            commands::branches::list_branches,
            commands::branches::get_current_branch,
            commands::branches::checkout_branch,
            commands::branches::create_branch,
            commands::branches::rename_branch,
            commands::branches::set_branch_upstream,
            commands::branches::fast_forward_branch,
            commands::branches::merge_branch,
            commands::branches::merge_with_options,
            commands::branches::delete_branch,
            commands::config::get_git_identity,
            commands::config::set_git_identity,
            commands::config::get_git_credential_config,
            commands::config::set_git_credential_helper,
            commands::config::test_git_authentication,
            commands::config::clear_credential_cache,
            commands::config::run_custom_git_command,
            commands::lfs::get_lfs_status,
            commands::lfs::install_lfs,
            commands::lfs::track_lfs_pattern,
            commands::lfs::untrack_lfs_pattern,
            commands::ssh::get_ssh_status,
            commands::ssh::generate_ssh_key,
            commands::ssh::add_ssh_key_to_agent,
            commands::remotes::list_remotes,
            commands::remotes::fetch,
            commands::remotes::pull,
            commands::remotes::push,
            commands::remotes::add_remote,
            commands::remotes::update_remote,
            commands::remotes::delete_remote,
            commands::remotes::prune_remote,
            commands::remotes::prune_remote_dry_run,
            commands::remotes::push_branch,
            commands::remotes::push_branch_dry_run,
            commands::remotes::delete_remote_branch,
            commands::remotes::delete_remote_branch_dry_run,
            commands::stashes::list_stashes,
            commands::stashes::create_stash,
            commands::stashes::create_stash_for_paths,
            commands::stashes::apply_stash,
            commands::stashes::pop_stash,
            commands::stashes::preview_stash,
            commands::stashes::drop_stash,
            commands::tags::list_tags,
            commands::tags::create_tag,
            commands::tags::delete_tag,
            commands::tags::push_tag,
            commands::tags::push_tag_dry_run,
            commands::tags::delete_remote_tag,
            commands::tags::delete_remote_tag_dry_run,
            commands::diff::get_file_diff,
            commands::diff::get_commit_diff,
            commands::patch::apply_patch,
            commands::patch::stage_hunk,
            commands::patch::unstage_hunk,
            commands::patch::discard_hunk,
            commands::patch::discard_file,
            commands::worktrees::list_worktrees,
            commands::worktrees::create_worktree,
            commands::github::cancel_repository_github_work,
            commands::worktrees::remove_worktree,
            commands::worktrees::remove_worktree_dry_run,
            commands::worktrees::prune_worktrees,
            commands::worktrees::worktree_move,
            commands::worktrees::worktree_lock,
            commands::worktrees::worktree_unlock,
            commands::worktrees::worktree_repair,
            commands::worktrees::worktree_repair_dry_run,
            commands::worktrees::worktree_prune_dry_run,
            commands::submodules::list_submodules,
            commands::submodules::update_submodule,
            commands::submodules::add_submodule,
            commands::submodules::sync_submodules,
            commands::submodules::open_submodule,
            commands::submodules::bump_submodule,
            commands::submodules::submodule_init_update,
            commands::submodules::submodule_set_branch,
            commands::submodules::submodule_foreach_status,
            commands::rebase::get_rebase_state,
            commands::rebase::get_conflict_content,
            commands::rebase::continue_rebase,
            commands::rebase::abort_rebase,
            commands::rebase::skip_rebase,
            commands::rebase::mark_file_resolved,
            commands::rebase::checkout_conflict_side,
            commands::rebase::update_rebase_todo,
            commands::rebase::preview_rebase,
            commands::rebase::rebase_onto,
            commands::rebase::rebase_upstream,
            commands::rebase::get_rerere_config,
            commands::rebase::get_rerere_status,
            commands::rebase::set_rerere_enabled,
            commands::rebase::get_operation_summary,
            commands::diagnostics::get_bisect_state,
            commands::diagnostics::bisect_start,
            commands::diagnostics::bisect_good,
            commands::diagnostics::bisect_bad,
            commands::diagnostics::bisect_skip,
            commands::diagnostics::bisect_reset,
            commands::diagnostics::run_git_fsck,
            commands::diagnostics::run_git_maintenance,
            commands::diagnostics::verify_git_signature,
            commands::github::get_repository_github_overview,
            commands::github::get_pull_request_diff,
            commands::github::checkout_pull_request,
            commands::github::update_pull_request_branch,
            commands::github::request_pull_request_review,
            commands::github::submit_pull_request_review,
            commands::github::submit_pull_request_line_comment,
            commands::github::add_pull_request_label,
            commands::github::remove_pull_request_label,
            commands::github::merge_pull_request,
            commands::github::close_pull_request,
            commands::ai::resolve_conflict_with_ai,
            commands::ai::suggest_commit_message,
            commands::settings_io::export_settings,
            commands::settings_io::import_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "linux")]
fn configure_linux_webkit_environment() {
    // AppImage runs can otherwise load host GIO modules against bundled GLib/WebKitGTK
    // libraries. That mismatch has produced blank windows on newer Linux desktops.
    if std::env::var_os("GIO_MODULE_DIR").is_none() {
        if let Some(app_dir) = std::env::var_os("APPDIR") {
            let gio_modules = std::path::PathBuf::from(app_dir)
                .join("usr/lib/x86_64-linux-gnu/gio/modules");
            if gio_modules.is_dir() {
                std::env::set_var("GIO_MODULE_DIR", gio_modules);
            }
        }
    }

    // WebKitGTK's accelerated compositing path can also render a blank AppImage window on
    // some Linux GPU/session combinations. User-provided environment values still win.
    for (key, value) in [
        ("WEBKIT_DISABLE_DMABUF_RENDERER", "1"),
        ("WEBKIT_DISABLE_COMPOSITING_MODE", "1"),
    ] {
        if std::env::var_os(key).is_none() {
            std::env::set_var(key, value);
        }
    }
}

#[cfg(target_os = "linux")]
fn configure_linux_webview(app: &tauri::App) {
    use tauri::Manager;
    use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};

    if let Some(webview_window) = app.get_webview_window("main") {
        let _ = webview_window.with_webview(|webview| {
            if let Some(settings) = webview.inner().settings() {
                settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Never);
            }
        });
    }
}

#[cfg(not(target_os = "linux"))]
fn configure_linux_webview(_app: &tauri::App) {}

#[cfg(not(target_os = "linux"))]
fn configure_linux_webkit_environment() {}
