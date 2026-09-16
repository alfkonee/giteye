use crate::errors::AppError;
use crate::git::{cli::GitCli, repository_service, state_graph::RepoStateReason};
use notify::{
    event::{AccessKind, AccessMode, ModifyKind},
    recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const WATCH_DEBOUNCE: Duration = Duration::from_millis(350);

#[derive(Default)]
pub struct RepositoryWatcherState {
    watchers: Mutex<HashMap<String, Arc<Mutex<RecommendedWatcher>>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStateChangedPayload {
    repo_path: String,
    reason: &'static str,
}

struct WatchRoots {
    repo: PathBuf,
    git_dirs: Vec<PathBuf>,
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

    let mut git_dirs = Vec::new();
    for option in ["--absolute-git-dir", "--git-common-dir"] {
        if let Some(path) = resolve_git_dir(&repo, option) {
            if !git_dirs.contains(&path) {
                git_dirs.push(path);
            }
        }
    }
    let roots = WatchRoots { repo, git_dirs };
    let (sender, receiver) = mpsc::channel();
    let mut watcher = recommended_watcher(move |event: notify::Result<Event>| {
        if let Ok(event) = event {
            if !matches!(
                event.kind,
                EventKind::Access(access) if !matches!(access, AccessKind::Close(AccessMode::Write))
            ) {
                let _ = sender.send(event);
            }
        }
    })
    .map_err(|e| AppError::IoError(e.to_string()))?;
    let mut watched_paths = HashSet::new();
    refresh_metadata_watches(&mut watcher, &roots, &mut watched_paths)?;

    let watcher = Arc::new(Mutex::new(watcher));
    let weak_watcher = Arc::downgrade(&watcher);
    watchers.insert(repo_key, watcher);
    thread::spawn(move || {
        while let Ok(first_event) = receiver.recv() {
            let deadline = Instant::now() + WATCH_DEBOUNCE;
            let mut reasons = Vec::new();
            let mut refresh_watches = false;
            let mut event = first_event;
            loop {
                if let Some(reason) = classify_event_reason(&event, &roots) {
                    repository_service::note_repository_change(Path::new(&repo_path), reason);
                    if !reasons.contains(&reason) {
                        reasons.push(reason);
                    }
                }
                refresh_watches |= matches!(
                    event.kind,
                    EventKind::Create(_)
                        | EventKind::Remove(_)
                        | EventKind::Modify(ModifyKind::Name(_))
                ) && event
                    .paths
                    .iter()
                    .any(|path| path.is_dir() || watched_paths.contains(path));
                match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                    Ok(next) => event = next,
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }

            // Only the state map retains the watcher. Removing a repository
            // drops its callback sender and disconnects this worker as well.
            let Some(watcher) = weak_watcher.upgrade() else {
                return;
            };
            if refresh_watches {
                if let Ok(mut watcher) = watcher.lock() {
                    let _ = refresh_metadata_watches(&mut watcher, &roots, &mut watched_paths);
                }
            }
            for reason in reasons {
                let _ = app.emit(
                    "git-state-changed",
                    GitStateChangedPayload {
                        repo_path: repo_path.clone(),
                        reason: reason_label(reason),
                    },
                );
            }
        }
    });
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
    watched_paths: &mut HashSet<PathBuf>,
    path: &Path,
    recursive_mode: RecursiveMode,
) -> Result<(), AppError> {
    if path.is_dir() && !watched_paths.contains(path) {
        watcher
            .watch(path, recursive_mode)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        watched_paths.insert(path.to_path_buf());
    }
    Ok(())
}

fn refresh_metadata_watches(
    watcher: &mut RecommendedWatcher,
    roots: &WatchRoots,
    watched_paths: &mut HashSet<PathBuf>,
) -> Result<(), AppError> {
    watched_paths.retain(|path| {
        if path.is_dir() {
            true
        } else {
            let _ = watcher.unwatch(path);
            false
        }
    });
    // Watching directories survives Git's atomic file replacements and catches
    // newly created metadata. The working tree itself is not watched recursively.
    watch_existing(
        watcher,
        watched_paths,
        &roots.repo,
        RecursiveMode::NonRecursive,
    )?;
    for git_dir in &roots.git_dirs {
        watch_git_metadata(watcher, watched_paths, git_dir)?;
    }
    Ok(())
}

fn watch_git_metadata(
    watcher: &mut RecommendedWatcher,
    watched_paths: &mut HashSet<PathBuf>,
    git_dir: &Path,
) -> Result<(), AppError> {
    watch_existing(watcher, watched_paths, git_dir, RecursiveMode::NonRecursive)?;
    for name in ["refs", "rebase-apply", "rebase-merge", "sequencer"] {
        watch_existing(
            watcher,
            watched_paths,
            &git_dir.join(name),
            RecursiveMode::Recursive,
        )?;
    }
    for registry in ["modules", "worktrees"] {
        watch_git_registry(watcher, watched_paths, &git_dir.join(registry))?;
    }
    Ok(())
}

fn watch_git_registry(
    watcher: &mut RecommendedWatcher,
    watched_paths: &mut HashSet<PathBuf>,
    registry: &Path,
) -> Result<(), AppError> {
    watch_existing(
        watcher,
        watched_paths,
        registry,
        RecursiveMode::NonRecursive,
    )?;
    let Ok(entries) = std::fs::read_dir(registry) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        let path = entry.path();
        if path.join("HEAD").is_file()
            || path.join("config").is_file()
            || path.join("objects").is_dir()
        {
            // Linked worktrees can also contain submodule object stores.
            watch_git_metadata(watcher, watched_paths, &path)?;
        } else {
            // Submodule names can contain directory components.
            watch_git_registry(watcher, watched_paths, &path)?;
        }
    }
    Ok(())
}

fn resolve_git_dir(repo: &Path, option: &str) -> Option<PathBuf> {
    let output = GitCli::run(repo, &["rev-parse", option]).ok()?;
    let path = output.trim();
    if path.is_empty() {
        None
    } else {
        Some(canonical_or_original(&repo.join(path)))
    }
}

fn canonical_or_original(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn classify_event_reason(event: &Event, roots: &WatchRoots) -> Option<RepoStateReason> {
    if matches!(
        event.kind,
        EventKind::Access(access) if !matches!(access, AccessKind::Close(AccessMode::Write))
    ) {
        return None;
    }

    event
        .paths
        .iter()
        .filter_map(|path| {
            if path == &roots.repo.join(".gitmodules") {
                return Some(RepoStateReason::Worktree);
            }
            roots.git_dirs.iter().find_map(|git_dir| {
                path.strip_prefix(git_dir)
                    .ok()
                    .and_then(git_metadata_reason)
            })
        })
        .max_by_key(|reason| match reason {
            RepoStateReason::Worktree => 0,
            RepoStateReason::Remote => 1,
            RepoStateReason::Refs => 2,
            RepoStateReason::Rebase => 3,
        })
}

fn reason_label(reason: RepoStateReason) -> &'static str {
    match reason {
        RepoStateReason::Worktree => "worktree",
        RepoStateReason::Refs => "refs",
        RepoStateReason::Remote => "remote",
        RepoStateReason::Rebase => "rebase",
    }
}

fn git_metadata_reason(relative: &Path) -> Option<RepoStateReason> {
    if relative.file_name()?.to_string_lossy().ends_with(".lock") {
        return None;
    }
    let first = relative.components().next()?.as_os_str();
    match first.to_str()? {
        "worktrees" | "modules" | "index" => Some(RepoStateReason::Worktree),
        "FETCH_HEAD" | "config" => Some(RepoStateReason::Remote),
        "rebase-apply" | "rebase-merge" | "sequencer" => Some(RepoStateReason::Rebase),
        "HEAD" | "ORIG_HEAD" | "MERGE_HEAD" | "REBASE_HEAD" | "CHERRY_PICK_HEAD"
        | "REVERT_HEAD" | "packed-refs" | "refs" => Some(RepoStateReason::Refs),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots() -> WatchRoots {
        WatchRoots {
            repo: PathBuf::from("/linked"),
            git_dirs: vec![
                PathBuf::from("/repo/.git/worktrees/linked"),
                PathBuf::from("/repo/.git"),
            ],
        }
    }

    #[test]
    fn metadata_reads_do_not_invalidate_repository_queries() {
        let event = Event::new(EventKind::Access(AccessKind::Read))
            .add_path(PathBuf::from("/repo/.git/HEAD"));
        assert_eq!(classify_event_reason(&event, &roots()), None);
    }

    #[test]
    fn linked_worktree_observes_common_refs_and_its_own_head() {
        for path in [
            "/repo/.git/refs/heads/main",
            "/repo/.git/worktrees/linked/HEAD",
        ] {
            let event =
                Event::new(EventKind::Modify(ModifyKind::Any)).add_path(PathBuf::from(path));
            assert_eq!(
                classify_event_reason(&event, &roots()),
                Some(RepoStateReason::Refs)
            );
        }
    }

    #[test]
    fn metadata_write_close_events_invalidate_repository_queries() {
        let event = Event::new(EventKind::Access(AccessKind::Close(AccessMode::Write)))
            .add_path(PathBuf::from("/repo/.git/refs/heads/main"));
        assert_eq!(
            classify_event_reason(&event, &roots()),
            Some(RepoStateReason::Refs)
        );
    }

    #[test]
    fn workspace_metadata_changes_refresh_linked_and_submodule_lists() {
        for path in [
            "/repo/.git/worktrees/other",
            "/repo/.git/modules/ui/HEAD",
            "/linked/.gitmodules",
        ] {
            let event =
                Event::new(EventKind::Modify(ModifyKind::Any)).add_path(PathBuf::from(path));
            assert_eq!(
                classify_event_reason(&event, &roots()),
                Some(RepoStateReason::Worktree)
            );
        }
    }

    #[test]
    fn unrelated_root_files_and_git_lockfiles_do_not_trigger_scans() {
        for path in [
            "/linked/main.rs",
            "/repo/.git/index.lock",
            "/repo/.git/objects/pack/data.pack",
        ] {
            let event =
                Event::new(EventKind::Modify(ModifyKind::Any)).add_path(PathBuf::from(path));
            assert_eq!(classify_event_reason(&event, &roots()), None);
        }
    }
}
