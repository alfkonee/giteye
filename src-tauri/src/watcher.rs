use crate::errors::AppError;
use crate::git::{cli::GitCli, repository_service, state_graph::RepoStateReason};
use notify::{
    event::{AccessKind, AccessMode},
    recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const WATCH_DEBOUNCE: Duration = Duration::from_millis(350);

#[derive(Default)]
pub struct RepositoryWatcherState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStateChangedPayload {
    repo_path: String,
    reason: &'static str,
}

#[tauri::command]
pub fn start_repository_watch(
    app: AppHandle,
    state: State<'_, RepositoryWatcherState>,
    repo_path: String,
) -> Result<(), AppError> {
    let repo = canonical_or_original(Path::new(&repo_path));
    let repo_key = repo.to_string_lossy().to_string();

    let mut watchers = state
        .watchers
        .lock()
        .map_err(|e| AppError::IoError(e.to_string()))?;

    if watchers.contains_key(&repo_key) {
        return Ok(());
    }

    let last_emit = Arc::new(Mutex::new(Instant::now() - WATCH_DEBOUNCE));
    let event_repo_path = repo_path.clone();
    let event_app = app.clone();
    let event_last_emit = Arc::clone(&last_emit);

    let mut watcher = recommended_watcher(move |event: notify::Result<Event>| {
        let Ok(event) = event else {
            return;
        };

        let Some(reason) = classify_event_reason(&event) else {
            return;
        };

        repository_service::note_repository_change(Path::new(&event_repo_path), reason);

        let Ok(mut last_emit) = event_last_emit.lock() else {
            return;
        };

        if last_emit.elapsed() < WATCH_DEBOUNCE {
            return;
        }

        *last_emit = Instant::now();
        let _ = event_app.emit(
            "git-state-changed",
            GitStateChangedPayload {
                repo_path: event_repo_path.clone(),
                reason: reason_label(reason),
            },
        );
    })
    .map_err(|e| AppError::IoError(e.to_string()))?;

    if let Some(git_dir) = absolute_git_dir(&repo) {
        watch_git_metadata(&mut watcher, &git_dir)?;
    }

    watchers.insert(repo_key, watcher);
    Ok(())
}

#[tauri::command]
pub fn stop_repository_watch(
    state: State<'_, RepositoryWatcherState>,
    repo_path: String,
) -> Result<(), AppError> {
    let repo_key = canonical_or_original(Path::new(&repo_path))
        .to_string_lossy()
        .to_string();
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|e| AppError::IoError(e.to_string()))?;
    watchers.remove(&repo_key);
    Ok(())
}

fn watch_existing(
    watcher: &mut RecommendedWatcher,
    path: &Path,
    recursive_mode: RecursiveMode,
) -> Result<(), AppError> {
    if path.exists() {
        watcher
            .watch(path, recursive_mode)
            .map_err(|e| AppError::IoError(e.to_string()))?;
    }
    Ok(())
}

fn watch_git_metadata(watcher: &mut RecommendedWatcher, git_dir: &Path) -> Result<(), AppError> {
    for file_name in [
        "HEAD",
        "FETCH_HEAD",
        "ORIG_HEAD",
        "MERGE_HEAD",
        "REBASE_HEAD",
        "CHERRY_PICK_HEAD",
        "packed-refs",
    ] {
        watch_existing(
            watcher,
            &git_dir.join(file_name),
            RecursiveMode::NonRecursive,
        )?;
    }

    for dir_name in ["refs", "rebase-apply", "rebase-merge", "sequencer"] {
        watch_existing(watcher, &git_dir.join(dir_name), RecursiveMode::Recursive)?;
    }

    Ok(())
}

fn absolute_git_dir(repo: &Path) -> Option<PathBuf> {
    let output = GitCli::run(repo, &["rev-parse", "--absolute-git-dir"]).ok()?;
    let path = output.trim();
    if path.is_empty() {
        None
    } else {
        Some(canonical_or_original(Path::new(path)))
    }
}

fn canonical_or_original(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn classify_event_reason(event: &Event) -> Option<RepoStateReason> {
    if matches!(
        event.kind,
        EventKind::Access(access) if !matches!(access, AccessKind::Close(AccessMode::Write))
    ) {
        return None;
    }

    let mut reason = None;

    for path in &event.paths {
        if is_build_artifact_path(path) {
            continue;
        }

        let path_reason = git_metadata_reason(path).unwrap_or(RepoStateReason::Worktree);
        reason = Some(match (reason, path_reason) {
            (Some(RepoStateReason::Rebase), _) | (_, RepoStateReason::Rebase) => {
                RepoStateReason::Rebase
            }
            (Some(RepoStateReason::Refs), _) | (_, RepoStateReason::Refs) => RepoStateReason::Refs,
            (Some(RepoStateReason::Remote), _) | (_, RepoStateReason::Remote) => {
                RepoStateReason::Remote
            }
            _ => RepoStateReason::Worktree,
        });
    }

    reason
}

fn reason_label(reason: RepoStateReason) -> &'static str {
    match reason {
        RepoStateReason::Worktree => "worktree",
        RepoStateReason::Refs => "refs",
        RepoStateReason::Remote => "remote",
        RepoStateReason::Rebase => "rebase",
    }
}

fn is_build_artifact_path(path: &Path) -> bool {
    path.components().any(|component| {
        let Component::Normal(value) = component else {
            return false;
        };

        matches!(
            value.to_string_lossy().as_ref(),
            "node_modules" | "target" | "dist" | ".vite"
        )
    })
}

fn git_metadata_reason(path: &Path) -> Option<RepoStateReason> {
    let git_index = path
        .components()
        .position(|component| matches!(component, Component::Normal(value) if value == ".git"))?;

    let git_relative: Vec<String> = path
        .components()
        .skip(git_index + 1)
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect();

    if git_relative.is_empty() {
        return None;
    }

    let joined = git_relative.join("/");
    if joined == "FETCH_HEAD" {
        return Some(RepoStateReason::Remote);
    }

    if joined.starts_with("rebase-apply/")
        || joined.starts_with("rebase-merge/")
        || joined.starts_with("sequencer/")
    {
        return Some(RepoStateReason::Rebase);
    }

    if matches!(
        joined.as_str(),
        "HEAD" | "ORIG_HEAD" | "MERGE_HEAD" | "REBASE_HEAD" | "CHERRY_PICK_HEAD" | "packed-refs"
    ) || joined.starts_with("refs/")
    {
        return Some(RepoStateReason::Refs);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, AccessMode, ModifyKind};

    #[test]
    fn metadata_reads_do_not_invalidate_repository_queries() {
        let event = Event::new(EventKind::Access(AccessKind::Read))
            .add_path(PathBuf::from("/repo/.git/HEAD"));

        assert_eq!(classify_event_reason(&event), None);
    }

    #[test]
    fn metadata_modifications_still_invalidate_repository_queries() {
        let event = Event::new(EventKind::Modify(ModifyKind::Any))
            .add_path(PathBuf::from("/repo/.git/refs/heads/main"));

        assert_eq!(classify_event_reason(&event), Some(RepoStateReason::Refs));
    }

    #[test]
    fn metadata_write_close_events_invalidate_repository_queries() {
        let event = Event::new(EventKind::Access(AccessKind::Close(AccessMode::Write)))
            .add_path(PathBuf::from("/repo/.git/refs/heads/main"));

        assert_eq!(classify_event_reason(&event), Some(RepoStateReason::Refs));
    }
}
