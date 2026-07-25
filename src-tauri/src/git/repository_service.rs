use crate::errors::AppError;
use crate::git::{
    cli::GitCli,
    state_graph::{mark_node_fresh, mark_repository_change, RepoStateNode, RepoStateReason},
    submodule_service, worktree_service,
};
use crate::models::{
    BranchSummary, GitStatusFile, GitStatusSummary, RepositoryInfo, RepositoryParent,
    RepositorySnapshot, WorkspaceSummary,
};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{LazyLock, Mutex};
use std::thread;
use std::time::UNIX_EPOCH;

#[derive(Clone, Debug, PartialEq, Eq)]
struct SnapshotFingerprint {
    head_contents: Option<String>,
    head_mtime: Option<u128>,
    current_ref: Option<String>,
    current_ref_mtime: Option<u128>,
    index_mtime: Option<u128>,
    fetch_head_mtime: Option<u128>,
    packed_refs_mtime: Option<u128>,
    worktree_sequence: u64,
}

#[derive(Clone)]
struct SnapshotCacheEntry {
    fingerprint: SnapshotFingerprint,
    snapshot: RepositorySnapshot,
}

#[derive(Clone)]
struct BranchSummaryCacheEntry {
    fingerprint: SnapshotFingerprint,
    summary: BranchSummary,
}

#[derive(Clone)]
struct WorkspaceSummaryCacheEntry {
    fingerprint: SnapshotFingerprint,
    summary: WorkspaceSummary,
}

static SNAPSHOT_CACHE: LazyLock<Mutex<HashMap<String, SnapshotCacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static WORKTREE_SEQUENCES: LazyLock<Mutex<HashMap<String, u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static BRANCH_SUMMARY_CACHE: LazyLock<Mutex<HashMap<String, BranchSummaryCacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static WORKSPACE_SUMMARY_CACHE: LazyLock<Mutex<HashMap<String, WorkspaceSummaryCacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn get_repository_snapshot(path: &Path) -> Result<RepositorySnapshot, AppError> {
    let repo_key = canonical_repo_key(path);
    let fingerprint = snapshot_fingerprint(path, &repo_key)?;

    if let Some(snapshot) = cached_snapshot(&repo_key, &fingerprint)? {
        return Ok(snapshot);
    }

    let snapshot = build_repository_snapshot(path)?;
    store_snapshot(repo_key, fingerprint, snapshot.clone())?;
    Ok(snapshot)
}
fn build_repository_snapshot(path: &Path) -> Result<RepositorySnapshot, AppError> {
    let name = GitCli::repo_name_from_path(path);
    let output = GitCli::run(
        path,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
            "-z",
        ],
    )?;
    let entries: Vec<&str> = output
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .collect();

    let mut current_branch = "unknown".to_string();
    let mut head_commit = None;
    let mut ahead = 0;
    let mut behind = 0;
    let submodule_parent = detect_submodule_parent(path);
    let mut files = Vec::new();
    let mut summary = GitStatusSummary::default();

    let mut index = 0;
    while index < entries.len() {
        let entry = entries[index];

        if let Some(value) = entry.strip_prefix("# branch.head ") {
            current_branch = value.to_string();
            index += 1;
            continue;
        }

        if let Some(value) = entry.strip_prefix("# branch.oid ") {
            if value != "(initial)" {
                head_commit = Some(value.to_string());
            }
            index += 1;
            continue;
        }

        if let Some(value) = entry.strip_prefix("# branch.ab ") {
            let mut parts = value.split_whitespace();
            ahead = parts
                .next()
                .and_then(|part| part.strip_prefix('+'))
                .and_then(|part| part.parse::<u32>().ok())
                .unwrap_or(0);
            behind = parts
                .next()
                .and_then(|part| part.strip_prefix('-'))
                .and_then(|part| part.parse::<u32>().ok())
                .unwrap_or(0);
            index += 1;
            continue;
        }

        match parse_status_entry(&entries, index) {
            Some((file, consumed)) => {
                update_summary(&mut summary, &file);
                files.push(file);
                index += consumed;
            }
            None => {
                index += 1;
            }
        }
    }

    let repository_info = RepositoryInfo {
        path: path.to_string_lossy().to_string(),
        name,
        current_branch,
        is_clean: summary.total_count == 0,
        head_commit,
        ahead,
        behind,
        submodule_parent,
    };

    Ok(RepositorySnapshot {
        repository_info,
        files,
        summary,
    })
}

fn detect_submodule_parent(path: &Path) -> Option<RepositoryParent> {
    let parent_output =
        GitCli::run(path, &["rev-parse", "--show-superproject-working-tree"]).ok()?;
    let parent_path = PathBuf::from(parent_output.trim());
    if parent_path.as_os_str().is_empty() {
        return None;
    }

    let parent_path = parent_path.canonicalize().ok().unwrap_or(parent_path);
    let repo_path = path
        .canonicalize()
        .ok()
        .unwrap_or_else(|| path.to_path_buf());
    let submodule_path = repo_path
        .strip_prefix(&parent_path)
        .ok()
        .filter(|relative| !relative.as_os_str().is_empty())
        .map(|relative| {
            relative
                .components()
                .map(|component| component.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_else(|| GitCli::repo_name_from_path(path));

    Some(RepositoryParent {
        name: GitCli::repo_name_from_path(&parent_path),
        path: parent_path.to_string_lossy().to_string(),
        submodule_path,
    })
}

pub fn get_repository_info(path: &Path) -> Result<RepositoryInfo, AppError> {
    Ok(get_repository_snapshot(path)?.repository_info)
}

pub fn get_branch_summary(path: &Path) -> Result<BranchSummary, AppError> {
    let repo_key = canonical_repo_key(path);
    let fingerprint = snapshot_fingerprint(path, &repo_key)?;

    if let Some(summary) = cached_branch_summary(&repo_key, &fingerprint)? {
        return Ok(summary);
    }

    let snapshot = get_repository_snapshot(path)?;
    let branches = crate::git::branch_service::list_branches(path)?;
    let local_count = branches.iter().filter(|branch| !branch.is_remote).count() as u32;
    let remote_count = branches.iter().filter(|branch| branch.is_remote).count() as u32;

    let summary = BranchSummary {
        current_branch: snapshot.repository_info.current_branch,
        local_count,
        remote_count,
        ahead: snapshot.repository_info.ahead,
        behind: snapshot.repository_info.behind,
    };
    store_branch_summary(repo_key, fingerprint, summary.clone())?;
    Ok(summary)
}

pub fn get_workspace_summary(path: &Path) -> Result<WorkspaceSummary, AppError> {
    let repo_key = canonical_repo_key(path);
    let fingerprint = snapshot_fingerprint(path, &repo_key)?;

    if let Some(summary) = cached_workspace_summary(&repo_key, &fingerprint)? {
        return Ok(summary);
    }

    let worktree_count = worktree_service::worktree_count(path)?;
    let (submodule_count, behind_submodule_count) =
        submodule_service::submodule_count_and_behind(path)?;

    let summary = WorkspaceSummary {
        worktree_count,
        submodule_count,
        behind_submodule_count,
    };
    store_workspace_summary(repo_key, fingerprint, summary.clone())?;
    Ok(summary)
}

pub fn init_repository(path: &Path) -> Result<RepositoryInfo, AppError> {
    std::fs::create_dir_all(path).map_err(|e| AppError::IoError(e.to_string()))?;
    let output = Command::new("git")
        .args(["init", "-b", "main"])
        .current_dir(path)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(e.to_string())
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::GitError(stderr.trim().to_string()));
    }

    get_repository_info(path)
}

#[allow(dead_code)]
pub fn clone_repository(url: &str, destination: &Path) -> Result<RepositoryInfo, AppError> {
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let Some(name) = destination.file_name().and_then(|value| value.to_str()) else {
        return Err(AppError::InvalidPath(
            destination.to_string_lossy().to_string(),
        ));
    };

    let output = Command::new("git")
        .args(["clone", url, name])
        .current_dir(parent)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(e.to_string())
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::GitError(stderr.trim().to_string()));
    }

    get_repository_info(destination)
}

pub fn warm_repository_context(path: PathBuf, include_github: bool) {
    thread::spawn(move || {
        let _ = get_branch_summary(&path);
        let _ = get_workspace_summary(&path);
        if include_github {
            let _ = crate::git::github_service::get_repository_github_overview(&path);
        }
    });
}

pub fn prime_repository_context_with_budget(path: PathBuf, include_github: bool) {
    warm_repository_context(path, include_github);
}

pub fn note_repository_change(path: &Path, reason: RepoStateReason) {
    let repo_key = canonical_repo_key(path);
    let plan = mark_repository_change(&repo_key, reason);

    if matches!(reason, RepoStateReason::Worktree | RepoStateReason::Remote) {
        if let Ok(mut sequences) = worktree_sequences().lock() {
            let entry = sequences.entry(repo_key.clone()).or_insert(0);
            *entry += 1;
        }
    }

    if plan.affects(RepoStateNode::Snapshot) {
        if let Ok(mut cache) = snapshot_cache().lock() {
            cache.remove(&repo_key);
        }
    }
    if plan.affects(RepoStateNode::BranchSummary) {
        if let Ok(mut cache) = branch_summary_cache().lock() {
            cache.remove(&repo_key);
        }
    }
    if plan.affects(RepoStateNode::WorkspaceSummary) {
        if let Ok(mut cache) = workspace_summary_cache().lock() {
            cache.remove(&repo_key);
        }
    }
}

fn cached_snapshot(
    repo_key: &str,
    fingerprint: &SnapshotFingerprint,
) -> Result<Option<RepositorySnapshot>, AppError> {
    let cache = snapshot_cache()
        .lock()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    Ok(cache
        .get(repo_key)
        .filter(|entry| entry.fingerprint == *fingerprint)
        .map(|entry| entry.snapshot.clone()))
}

fn store_snapshot(
    repo_key: String,
    fingerprint: SnapshotFingerprint,
    snapshot: RepositorySnapshot,
) -> Result<(), AppError> {
    let mut cache = snapshot_cache()
        .lock()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let graph_fingerprint = format!("{fingerprint:?}");
    cache.insert(
        repo_key.clone(),
        SnapshotCacheEntry {
            fingerprint,
            snapshot,
        },
    );
    mark_node_fresh(&repo_key, RepoStateNode::Snapshot, graph_fingerprint);
    Ok(())
}

fn cached_branch_summary(
    repo_key: &str,
    fingerprint: &SnapshotFingerprint,
) -> Result<Option<BranchSummary>, AppError> {
    let cache = branch_summary_cache()
        .lock()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    Ok(cache
        .get(repo_key)
        .filter(|entry| entry.fingerprint == *fingerprint)
        .map(|entry| entry.summary.clone()))
}

fn store_branch_summary(
    repo_key: String,
    fingerprint: SnapshotFingerprint,
    summary: BranchSummary,
) -> Result<(), AppError> {
    let mut cache = branch_summary_cache()
        .lock()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let graph_fingerprint = format!("{fingerprint:?}");
    cache.insert(
        repo_key.clone(),
        BranchSummaryCacheEntry {
            fingerprint,
            summary,
        },
    );
    mark_node_fresh(&repo_key, RepoStateNode::BranchSummary, graph_fingerprint);
    Ok(())
}

fn cached_workspace_summary(
    repo_key: &str,
    fingerprint: &SnapshotFingerprint,
) -> Result<Option<WorkspaceSummary>, AppError> {
    let cache = workspace_summary_cache()
        .lock()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    Ok(cache
        .get(repo_key)
        .filter(|entry| entry.fingerprint == *fingerprint)
        .map(|entry| entry.summary.clone()))
}

fn store_workspace_summary(
    repo_key: String,
    fingerprint: SnapshotFingerprint,
    summary: WorkspaceSummary,
) -> Result<(), AppError> {
    let mut cache = workspace_summary_cache()
        .lock()
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let graph_fingerprint = format!("{fingerprint:?}");
    cache.insert(
        repo_key.clone(),
        WorkspaceSummaryCacheEntry {
            fingerprint,
            summary,
        },
    );
    mark_node_fresh(
        &repo_key,
        RepoStateNode::WorkspaceSummary,
        graph_fingerprint,
    );
    Ok(())
}

fn branch_summary_cache() -> &'static Mutex<HashMap<String, BranchSummaryCacheEntry>> {
    &BRANCH_SUMMARY_CACHE
}

fn workspace_summary_cache() -> &'static Mutex<HashMap<String, WorkspaceSummaryCacheEntry>> {
    &WORKSPACE_SUMMARY_CACHE
}

fn snapshot_cache() -> &'static Mutex<HashMap<String, SnapshotCacheEntry>> {
    &SNAPSHOT_CACHE
}

fn worktree_sequences() -> &'static Mutex<HashMap<String, u64>> {
    &WORKTREE_SEQUENCES
}

fn snapshot_fingerprint(path: &Path, repo_key: &str) -> Result<SnapshotFingerprint, AppError> {
    let git_dir = absolute_git_dir(path)?;
    let head_path = git_dir.join("HEAD");
    let head_contents = fs::read_to_string(&head_path)
        .ok()
        .map(|content| content.trim().to_string());
    let current_ref = head_contents
        .as_deref()
        .and_then(|head| head.strip_prefix("ref: "))
        .map(str::to_string);
    let current_ref_mtime = current_ref
        .as_ref()
        .and_then(|reference| file_mtime(&git_dir.join(reference)));

    Ok(SnapshotFingerprint {
        head_contents,
        head_mtime: file_mtime(&head_path),
        current_ref,
        current_ref_mtime,
        index_mtime: file_mtime(&git_dir.join("index")),
        fetch_head_mtime: file_mtime(&git_dir.join("FETCH_HEAD")),
        packed_refs_mtime: file_mtime(&git_dir.join("packed-refs")),
        worktree_sequence: repo_worktree_sequence(repo_key),
    })
}

fn repo_worktree_sequence(repo_key: &str) -> u64 {
    worktree_sequences()
        .lock()
        .ok()
        .and_then(|sequences| sequences.get(repo_key).copied())
        .unwrap_or(0)
}

fn absolute_git_dir(path: &Path) -> Result<PathBuf, AppError> {
    GitCli::run(path, &["rev-parse", "--absolute-git-dir"])
        .map(|output| PathBuf::from(output.trim()))
}

fn canonical_repo_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

fn file_mtime(path: &Path) -> Option<u128> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
}

fn parse_status_entry(entries: &[&str], index: usize) -> Option<(GitStatusFile, usize)> {
    let entry = entries.get(index)?;

    if let Some(path) = entry.strip_prefix("? ") {
        return Some((
            GitStatusFile {
                path: path.to_string(),
                status: "??".to_string(),
                staged: false,
                unstaged: true,
                old_path: None,
            },
            1,
        ));
    }

    if let Some(path) = entry.strip_prefix("! ") {
        return Some((
            GitStatusFile {
                path: path.to_string(),
                status: "!!".to_string(),
                staged: false,
                unstaged: false,
                old_path: None,
            },
            1,
        ));
    }

    if entry.starts_with("1 ") {
        let parts: Vec<&str> = entry.splitn(9, ' ').collect();
        if parts.len() < 9 {
            return None;
        }

        let status = parts[1].to_string();
        let (staged, unstaged) = status_flags(&status);
        return Some((
            GitStatusFile {
                path: parts[8].to_string(),
                status,
                staged,
                unstaged,
                old_path: None,
            },
            1,
        ));
    }

    if entry.starts_with("2 ") {
        let parts: Vec<&str> = entry.splitn(10, ' ').collect();
        if parts.len() < 10 {
            return None;
        }

        let status = parts[1].to_string();
        let (staged, unstaged) = status_flags(&status);
        let old_path = entries.get(index + 1).map(|value| (*value).to_string());
        return Some((
            GitStatusFile {
                path: parts[9].to_string(),
                status,
                staged,
                unstaged,
                old_path,
            },
            if entries.get(index + 1).is_some() {
                2
            } else {
                1
            },
        ));
    }

    if entry.starts_with("u ") {
        let parts: Vec<&str> = entry.splitn(11, ' ').collect();
        if parts.len() < 11 {
            return None;
        }

        let status = parts[1].to_string();
        let (staged, unstaged) = status_flags(&status);
        return Some((
            GitStatusFile {
                path: parts[10].to_string(),
                status,
                staged,
                unstaged,
                old_path: None,
            },
            1,
        ));
    }

    None
}

fn status_flags(status: &str) -> (bool, bool) {
    let mut chars = status.chars();
    let index_status = chars.next().unwrap_or(' ');
    let worktree_status = chars.next().unwrap_or(' ');

    (
        is_changed_status(index_status),
        status == "??" || is_changed_status(worktree_status),
    )
}

fn is_changed_status(status: char) -> bool {
    !matches!(status, ' ' | '.' | '?' | '!')
}

fn update_summary(summary: &mut GitStatusSummary, file: &GitStatusFile) {
    summary.total_count += 1;

    if file.status == "??" {
        summary.untracked_count += 1;
    }
    if file.status == "!!" {
        summary.ignored_count += 1;
    }
    if file.staged {
        summary.staged_count += 1;
    }
    if file.unstaged {
        summary.unstaged_count += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create test dir");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn git(cwd: &Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn create_source_repo(path: &Path) {
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
        git(path, &["config", "core.autocrlf", "false"]);
        git(path, &["config", "core.eol", "lf"]);
        fs::write(path.join("README.md"), "# source\n").expect("write source file");
        git(path, &["add", "README.md"]);
        git(path, &["commit", "-m", "Initial commit"]);
    }

    #[test]
    fn init_repository_creates_git_repo_and_returns_info() {
        let temp = TestDir::new("init");
        let repo_path = temp.path.join("new-repo");

        let info = init_repository(&repo_path).expect("init repository");

        assert_eq!(info.name, "new-repo");
        assert_eq!(info.path, repo_path.to_string_lossy());
        assert!(repo_path.join(".git").is_dir());
        assert_eq!(info.current_branch, "main");
        assert!(info.is_clean);
        assert!(info.head_commit.is_none());
        assert_eq!(info.ahead, 0);
        assert_eq!(info.behind, 0);
    }

    #[test]
    fn repository_snapshot_reports_submodule_parent() {
        let temp = TestDir::new("submodule-parent");
        let source = temp.path.join("source");
        let parent = temp.path.join("parent");
        fs::create_dir_all(&source).expect("create source");
        fs::create_dir_all(&parent).expect("create parent");
        create_source_repo(&source);
        create_source_repo(&parent);

        git(
            &parent,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                source.to_str().expect("source path"),
                "modules/source",
            ],
        );
        git(&parent, &["commit", "-am", "Add source submodule"]);

        let submodule_path = parent.join("modules/source");
        let snapshot = get_repository_snapshot(&submodule_path).expect("snapshot");
        let parent_info = snapshot
            .repository_info
            .submodule_parent
            .expect("submodule parent");

        assert_eq!(parent_info.name, "parent");
        assert_eq!(
            parent_info.path,
            parent
                .canonicalize()
                .expect("canonical parent")
                .to_string_lossy()
        );
        assert_eq!(parent_info.submodule_path, "modules/source");
    }

    #[test]
    fn clone_repository_clones_source_and_returns_info() {
        let temp = TestDir::new("clone");
        let source = temp.path.join("source");
        let destination = temp.path.join("destination");
        fs::create_dir_all(&source).expect("create source");
        create_source_repo(&source);

        let info = clone_repository(source.to_str().expect("source path"), &destination)
            .expect("clone repository");

        assert_eq!(info.name, "destination");
        assert_eq!(info.path, destination.to_string_lossy());
        assert!(destination.join(".git").is_dir());
        assert_eq!(info.current_branch, "main");
        assert!(info.is_clean);
        assert!(info.head_commit.is_some());
        assert_eq!(info.ahead, 0);
        assert_eq!(info.behind, 0);
    }

    #[test]
    fn repository_snapshot_parses_status_summary_and_rename() {
        let temp = TestDir::new("snapshot");
        create_source_repo(&temp.path);
        fs::rename(temp.path.join("README.md"), temp.path.join("RENAMED.md")).expect("rename file");
        git(&temp.path, &["add", "-A"]);
        fs::write(temp.path.join("untracked.txt"), "hello\n").expect("write untracked");

        let snapshot = get_repository_snapshot(&temp.path).expect("snapshot");

        assert_eq!(snapshot.repository_info.current_branch, "main");
        assert!(!snapshot.repository_info.is_clean);
        assert_eq!(snapshot.summary.total_count, 2);
        assert_eq!(snapshot.summary.staged_count, 1);
        assert_eq!(snapshot.summary.untracked_count, 1);
        assert!(
            snapshot
                .files
                .iter()
                .any(|file| file.path == "RENAMED.md"
                    && file.old_path.as_deref() == Some("README.md"))
        );
        assert!(snapshot
            .files
            .iter()
            .any(|file| file.path == "untracked.txt" && file.status == "??"));
    }

    #[test]
    fn repository_snapshot_lists_files_inside_untracked_directories() {
        let temp = TestDir::new("snapshot-untracked-directory");
        create_source_repo(&temp.path);
        fs::create_dir_all(temp.path.join(".agents/skills")).expect("create nested directory");
        fs::write(temp.path.join(".agents/config.json"), "{}\n").expect("write config");
        fs::write(temp.path.join(".agents/skills/review.md"), "review\n")
            .expect("write nested file");

        let snapshot = get_repository_snapshot(&temp.path).expect("snapshot");

        let paths: Vec<&str> = snapshot
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect();
        assert_eq!(
            paths,
            vec![".agents/config.json", ".agents/skills/review.md"]
        );
        assert_eq!(snapshot.summary.total_count, 2);
        assert_eq!(snapshot.summary.untracked_count, 2);
    }

    #[test]
    fn repository_snapshot_separates_index_and_worktree_statuses() {
        let temp = TestDir::new("status-split");
        create_source_repo(&temp.path);

        fs::write(temp.path.join("README.md"), "# source\nunstaged\n")
            .expect("modify unstaged file");
        fs::write(temp.path.join("staged.txt"), "staged\n").expect("write staged file");
        git(&temp.path, &["add", "staged.txt"]);
        fs::write(temp.path.join("partial.txt"), "base\n").expect("write partial base");
        git(&temp.path, &["add", "partial.txt"]);
        fs::write(temp.path.join("partial.txt"), "base\nunstaged\n")
            .expect("add unstaged partial change");

        let snapshot = get_repository_snapshot(&temp.path).expect("snapshot");
        let readme = snapshot
            .files
            .iter()
            .find(|file| file.path == "README.md")
            .expect("unstaged file");
        let staged = snapshot
            .files
            .iter()
            .find(|file| file.path == "staged.txt")
            .expect("staged file");
        let partial = snapshot
            .files
            .iter()
            .find(|file| file.path == "partial.txt")
            .expect("partial file");

        assert_eq!((readme.staged, readme.unstaged), (false, true));
        assert_eq!((staged.staged, staged.unstaged), (true, false));
        assert_eq!((partial.staged, partial.unstaged), (true, true));
        assert_eq!(snapshot.summary.staged_count, 2);
        assert_eq!(snapshot.summary.unstaged_count, 2);
    }

    #[test]
    fn repository_snapshot_cache_refreshes_after_worktree_change_event() {
        let temp = TestDir::new("snapshot-cache");
        create_source_repo(&temp.path);

        let clean_snapshot = get_repository_snapshot(&temp.path).expect("clean snapshot");
        assert_eq!(clean_snapshot.summary.total_count, 0);

        fs::write(temp.path.join("new-file.txt"), "new\n").expect("write untracked");
        note_repository_change(&temp.path, RepoStateReason::Worktree);

        let changed_snapshot = get_repository_snapshot(&temp.path).expect("changed snapshot");
        assert_eq!(changed_snapshot.summary.total_count, 1);
        assert_eq!(changed_snapshot.summary.untracked_count, 1);
        assert!(changed_snapshot
            .files
            .iter()
            .any(|file| file.path == "new-file.txt" && file.status == "??"));
    }
}
