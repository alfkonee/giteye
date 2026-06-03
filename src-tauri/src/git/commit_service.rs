use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::{CommitDetails, CommitSummary};
use std::path::Path;

pub fn get_commit_history(
    repo_path: &Path,
    limit: Option<u32>,
) -> Result<Vec<CommitSummary>, AppError> {
    let limit_str = limit
        .map(|l| l.to_string())
        .unwrap_or_else(|| "50".to_string());

    let output = GitCli::run(
        repo_path,
        &[
            "log",
            "--max-count",
            &limit_str,
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D",
        ],
    )?;

    let commits: Vec<CommitSummary> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\0').collect();
            if parts.len() < 7 {
                return None;
            }

            let refs_str = parts[6];
            let refs: Vec<String> = if refs_str.is_empty() {
                vec![]
            } else {
                refs_str
                    .split(',')
                    .map(|r| r.trim())
                    .filter(|r| !r.is_empty() && !r.starts_with("tag: "))
                    .map(|r| r.to_string())
                    .collect()
            };

            Some(CommitSummary {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author_name: parts[3].to_string(),
                author_email: parts[4].to_string(),
                timestamp: parts[5].to_string(),
                refs,
            })
        })
        .collect();

    Ok(commits)
}

pub fn get_commit_details(repo_path: &Path, hash: &str) -> Result<CommitDetails, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "show",
            "--format=%H%x00%s%x00%b%x00%an%x00%ae%x00%cn%x00%ce%x00%aI%x00%P",
            "--name-only",
            "--no-merge",
            hash,
        ],
    )?;

    let mut lines = output.lines();
    let header = lines.next().unwrap_or("");
    let parts: Vec<&str> = header.split('\0').collect();

    if parts.len() < 9 {
        return Err(AppError::CommitNotFound(hash.to_string()));
    }

    let parents: Vec<String> = parts[8].split_whitespace().map(|p| p.to_string()).collect();

    let changed_files: Vec<String> = lines
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    Ok(CommitDetails {
        hash: parts[0].to_string(),
        message: parts[1].to_string(),
        body: if parts[2].is_empty() {
            None
        } else {
            Some(parts[2].to_string())
        },
        author_name: parts[3].to_string(),
        author_email: parts[4].to_string(),
        committer_name: parts[5].to_string(),
        committer_email: parts[6].to_string(),
        timestamp: parts[7].to_string(),
        parents,
        changed_files,
    })
}
