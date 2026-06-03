use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::worktree::Worktree;
use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Default)]
struct WorktreeRecord {
    path: String,
    branch: Option<String>,
    head: Option<String>,
    is_bare: bool,
    is_detached: bool,
    is_locked: bool,
    lock_reason: Option<String>,
    prunable: bool,
}

pub fn list_worktrees(repo_path: &Path) -> Result<Vec<Worktree>, AppError> {
    let output = GitCli::run(repo_path, &["worktree", "list", "--porcelain"])?;
    let current_path = current_worktree_path(repo_path);

    Ok(parse_worktree_records(&output)
        .into_iter()
        .map(|record| build_worktree(record, current_path.as_deref()))
        .collect())
}

pub fn create_worktree(
    repo_path: &Path,
    path: &Path,
    branch: Option<&str>,
    create_branch: bool,
) -> Result<(), AppError> {
    let path_arg = path
        .to_str()
        .ok_or_else(|| AppError::InvalidPath(path.to_string_lossy().to_string()))?;

    let mut args = Vec::with_capacity(5);
    args.push("worktree");
    args.push("add");

    if create_branch {
        if let Some(branch_name) = branch.filter(|b| !b.trim().is_empty()) {
            args.push("-b");
            args.push(branch_name);
        }
    }

    args.push(path_arg);

    if !create_branch {
        if let Some(branch_name) = branch.filter(|b| !b.trim().is_empty()) {
            args.push(branch_name);
        }
    }

    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn remove_worktree(repo_path: &Path, path: &Path, force: bool) -> Result<(), AppError> {
    let path_arg = path
        .to_str()
        .ok_or_else(|| AppError::InvalidPath(path.to_string_lossy().to_string()))?;

    if force {
        GitCli::run(repo_path, &["worktree", "remove", "--force", path_arg])?;
    } else {
        GitCli::run(repo_path, &["worktree", "remove", path_arg])?;
    }

    Ok(())
}

pub fn prune_worktrees(repo_path: &Path) -> Result<(), AppError> {
    GitCli::run(repo_path, &["worktree", "prune"])?;
    Ok(())
}

fn parse_worktree_records(output: &str) -> Vec<WorktreeRecord> {
    let mut records = Vec::new();
    let mut current = WorktreeRecord::default();
    let mut has_record = false;

    for line in output.lines() {
        if line.is_empty() {
            if has_record {
                records.push(current);
                current = WorktreeRecord::default();
                has_record = false;
            }
            continue;
        }

        has_record = true;

        if let Some(path) = line.strip_prefix("worktree ") {
            current.path = path.to_string();
        } else if let Some(head) = line.strip_prefix("HEAD ") {
            current.head = Some(head.to_string());
        } else if let Some(branch) = line.strip_prefix("branch ") {
            current.branch = Some(short_branch_name(branch));
        } else if line == "bare" {
            current.is_bare = true;
        } else if line == "detached" {
            current.is_detached = true;
        } else if let Some(reason) = line.strip_prefix("locked") {
            current.is_locked = true;
            let reason = reason.trim_start();
            if !reason.is_empty() {
                current.lock_reason = Some(reason.to_string());
            }
        } else if line.starts_with("prunable") {
            current.prunable = true;
        }
    }

    if has_record {
        records.push(current);
    }

    records
}

fn build_worktree(record: WorktreeRecord, current_path: Option<&Path>) -> Worktree {
    let worktree_path = Path::new(&record.path);
    let is_current = current_path.map_or(false, |current| same_path(current, worktree_path));
    let updated_at = updated_at(worktree_path);

    if record.is_bare {
        return Worktree {
            path: record.path,
            branch: record.branch,
            head: record.head,
            is_current,
            is_bare: record.is_bare,
            is_detached: record.is_detached,
            is_locked: record.is_locked,
            lock_reason: record.lock_reason,
            prunable: record.prunable,
            status: "Bare".to_string(),
            modified_files: 0,
            staged_files: 0,
            ahead: 0,
            behind: 0,
            updated_at,
        };
    }

    let (status, modified_files, staged_files, ahead, behind) = if record.is_locked {
        ("Unavailable".to_string(), 0, 0, 0, 0)
    } else {
        let (status, modified_files, staged_files) = match status_counts(worktree_path) {
            Ok((modified, staged)) => {
                let status = if modified == 0 && staged == 0 {
                    "Clean"
                } else {
                    "Modified"
                };
                (status.to_string(), modified, staged)
            }
            Err(_) => ("Unavailable".to_string(), 0, 0),
        };

        let (ahead, behind) = if status == "Unavailable" {
            (0, 0)
        } else {
            ahead_behind(worktree_path).unwrap_or((0, 0))
        };

        (status, modified_files, staged_files, ahead, behind)
    };

    Worktree {
        path: record.path,
        branch: record.branch,
        head: record.head,
        is_current,
        is_bare: record.is_bare,
        is_detached: record.is_detached,
        is_locked: record.is_locked,
        lock_reason: record.lock_reason,
        prunable: record.prunable,
        status,
        modified_files,
        staged_files,
        ahead,
        behind,
        updated_at,
    }
}

fn status_counts(path: &Path) -> Result<(u32, u32), AppError> {
    let output = GitCli::run(path, &["status", "--porcelain=v1"])?;
    let mut modified = 0;
    let mut staged = 0;

    for line in output.lines() {
        let bytes = line.as_bytes();
        if bytes.len() < 2 {
            continue;
        }

        let index = bytes[0];
        let worktree = bytes[1];

        if index != b' ' && index != b'?' {
            staged += 1;
        }

        if worktree != b' ' || index == b'?' {
            modified += 1;
        }
    }

    Ok((modified, staged))
}

fn ahead_behind(path: &Path) -> Result<(u32, u32), AppError> {
    GitCli::run(
        path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )?;
    let output = GitCli::run(
        path,
        &["rev-list", "--left-right", "--count", "HEAD...@{u}"],
    )?;
    let mut parts = output.split_whitespace();
    let ahead = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    let behind = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    Ok((ahead, behind))
}

fn current_worktree_path(repo_path: &Path) -> Option<PathBuf> {
    let output = GitCli::run(repo_path, &["rev-parse", "--show-toplevel"]).ok()?;
    canonical_or_original(Path::new(output.trim()))
}

fn same_path(a: &Path, b: &Path) -> bool {
    let a = canonical_or_original(a);
    let b = canonical_or_original(b);
    match (a, b) {
        (Some(left), Some(right)) => left == right,
        _ => false,
    }
}

fn canonical_or_original(path: &Path) -> Option<PathBuf> {
    fs::canonicalize(path)
        .ok()
        .or_else(|| Some(path.to_path_buf()))
}

fn updated_at(path: &Path) -> Option<String> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    let date_time: DateTime<Utc> = modified.into();
    Some(date_time.to_rfc3339())
}

fn short_branch_name(branch: &str) -> String {
    branch
        .strip_prefix("refs/heads/")
        .or_else(|| branch.strip_prefix("refs/remotes/"))
        .unwrap_or(branch)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::parse_worktree_records;

    #[test]
    fn parses_porcelain_worktrees() {
        let records = parse_worktree_records(
            "worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo-linked\nHEAD def456\ndetached\nlocked maintenance\nprunable stale\n",
        );

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].path, "/repo");
        assert_eq!(records[0].branch.as_deref(), Some("main"));
        assert!(!records[0].is_detached);
        assert!(records[1].is_detached);
        assert!(records[1].is_locked);
        assert_eq!(records[1].lock_reason.as_deref(), Some("maintenance"));
        assert!(records[1].prunable);
    }
}
