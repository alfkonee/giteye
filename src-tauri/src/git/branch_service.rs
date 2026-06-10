use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::Branch;
use std::path::Path;

pub fn list_branches(repo_path: &Path) -> Result<Vec<Branch>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "branch",
            "--all",
            "--format=%(refname)|%(refname:short)|%(upstream:short)|%(upstream:track)|%(HEAD)",
        ],
    )?;

    let branches: Vec<Branch> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() < 2 {
                return None;
            }

            let ref_name = parts[0];
            let short_ref = parts[1];
            let is_remote = ref_name.starts_with("refs/remotes/");
            if is_remote && short_ref.ends_with("/HEAD") {
                return None;
            }

            let is_current = parts.get(4).map_or(false, |h| *h == "*");

            let upstream = parts
                .get(2)
                .filter(|u| !u.is_empty())
                .map(|u| u.to_string());

            let (ahead, behind) = parts
                .get(3)
                .filter(|t| !t.is_empty())
                .map(|track| {
                    let track = track.trim_matches(|c| c == '[' || c == ']');
                    let mut ahead_val = None;
                    let mut behind_val = None;
                    for part in track.split(',').map(|p| p.trim()) {
                        if let Some(num) = part.strip_prefix("ahead ") {
                            ahead_val = num.parse().ok();
                        } else if let Some(num) = part.strip_prefix("behind ") {
                            behind_val = num.parse().ok();
                        }
                    }
                    (ahead_val, behind_val)
                })
                .unwrap_or((None, None));

            Some(Branch {
                name: ref_name.to_string(),
                short_name: short_ref.to_string(),
                is_current,
                is_remote,
                upstream,
                ahead,
                behind,
            })
        })
        .collect();

    Ok(branches)
}


pub fn get_current_branch(repo_path: &Path) -> Result<String, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())
}

pub fn checkout_branch(repo_path: &Path, name: &str, strategy: &str) -> Result<(), AppError> {
    if strategy == "stash" && has_worktree_changes(repo_path)? {
        let message = format!("GitEye: before switching to {name}");
        GitCli::run(repo_path, &["stash", "push", "--include-untracked", "-m", &message])?;
    }

    switch_branch(repo_path, name)?;
    Ok(())
}

pub fn create_branch(
    repo_path: &Path,
    name: &str,
    checkout: bool,
    start_point: Option<&str>,
) -> Result<(), AppError> {
    if let Some(start_point) = start_point.filter(|value| !value.is_empty()) {
        GitCli::run(repo_path, &["branch", name, start_point])?;
    } else {
        GitCli::run(repo_path, &["branch", name])?;
    }

    if checkout {
        GitCli::run(repo_path, &["switch", name])?;
    }
    Ok(())
}

pub fn delete_branch(repo_path: &Path, name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["branch", "-d", name])?;
    Ok(())
}

fn has_worktree_changes(repo_path: &Path) -> Result<bool, AppError> {
    GitCli::run(repo_path, &["status", "--porcelain"]).map(|status| !status.trim().is_empty())
}

fn switch_branch(repo_path: &Path, name: &str) -> Result<(), AppError> {
    if remote_branch_exists(repo_path, name) {
        let local_name = name
            .split_once('/')
            .map(|(_, branch_name)| branch_name)
            .unwrap_or(name);

        if local_branch_exists(repo_path, local_name) {
            GitCli::run(repo_path, &["switch", local_name])?;
        } else {
            GitCli::run(repo_path, &["switch", "--track", name])?;
        }
    } else {
        GitCli::run(repo_path, &["switch", name])?;
    }

    Ok(())
}

fn local_branch_exists(repo_path: &Path, name: &str) -> bool {
    let ref_name = format!("refs/heads/{name}");
    GitCli::run(repo_path, &["show-ref", "--verify", "--quiet", &ref_name]).is_ok()
}

fn remote_branch_exists(repo_path: &Path, name: &str) -> bool {
    let ref_name = format!("refs/remotes/{name}");
    GitCli::run(repo_path, &["show-ref", "--verify", "--quiet", &ref_name]).is_ok()
}
