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
            "--format=%(refname:short)|%(upstream:short)|%(upstream:track)|%(HEAD)",
        ],
    )?;

    let branches: Vec<Branch> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.is_empty() {
                return None;
            }

            let name = parts[0];
            let is_current = parts.get(3).map_or(false, |h| *h == "*");
            let is_remote = name.starts_with("remotes/");

            let short_name = if is_remote {
                name.trim_start_matches("remotes/")
                    .splitn(2, '/')
                    .nth(1)
                    .unwrap_or(name)
                    .to_string()
            } else {
                name.to_string()
            };

            let upstream = parts
                .get(1)
                .filter(|u| !u.is_empty())
                .map(|u| u.to_string());

            let (ahead, behind) = parts
                .get(2)
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
                name: name.to_string(),
                short_name,
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

pub fn checkout_branch(repo_path: &Path, name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["checkout", name])?;
    Ok(())
}

pub fn create_branch(repo_path: &Path, name: &str, checkout: bool) -> Result<(), AppError> {
    GitCli::run(repo_path, &["branch", name])?;
    if checkout {
        GitCli::run(repo_path, &["checkout", name])?;
    }
    Ok(())
}

pub fn delete_branch(repo_path: &Path, name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["branch", "-d", name])?;
    Ok(())
}
