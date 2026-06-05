mod commands;
mod errors;
mod git;
mod models;
mod storage;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(watcher::RepositoryWatcherState::default())
        .setup(|_app| {
            if !git::cli::GitCli::is_git_available() {
                eprintln!("Warning: Git is not installed or not in PATH");
            }
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
            commands::branches::list_branches,
            commands::branches::get_current_branch,
            commands::branches::checkout_branch,
            commands::branches::create_branch,
            commands::branches::delete_branch,
            commands::remotes::list_remotes,
            commands::remotes::fetch,
            commands::remotes::pull,
            commands::remotes::push,
            commands::diff::get_file_diff,
            commands::diff::get_commit_diff,
            commands::worktrees::list_worktrees,
            commands::worktrees::create_worktree,
            commands::github::cancel_repository_github_work,
            commands::worktrees::remove_worktree,
            commands::worktrees::prune_worktrees,
            commands::submodules::list_submodules,
            commands::submodules::update_submodule,
            commands::submodules::sync_submodules,
            commands::submodules::open_submodule,
            commands::submodules::bump_submodule,
            commands::rebase::get_rebase_state,
            commands::rebase::get_conflict_content,
            commands::rebase::continue_rebase,
            commands::rebase::abort_rebase,
            commands::rebase::skip_rebase,
            commands::rebase::mark_file_resolved,
            commands::rebase::update_rebase_todo,
            commands::github::get_repository_github_overview,
            commands::github::get_pull_request_diff,
            commands::github::checkout_pull_request,
            commands::github::update_pull_request_branch,
            commands::github::merge_pull_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
