use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::GitStatusFile;
use std::path::Path;

fn parse_status_line(line: &str) -> Option<GitStatusFile> {
    if line.len() < 4 {
        return None;
    }

    let chars: Vec<char> = line.chars().collect();
    let index_status = chars[0];
    let worktree_status = chars[1];

    let staged = index_status != ' ' && index_status != '?';
    let unstaged = worktree_status != ' ';

    let status = format!("{}{}", index_status, worktree_status);

    let remainder = line[3..].trim();

    // Handle renamed files: "R  old -> new"
    if index_status == 'R' || (index_status != '?' && remainder.contains(" -> ")) {
        let parts: Vec<&str> = remainder.splitn(2, " -> ").collect();
        if parts.len() == 2 {
            return Some(GitStatusFile {
                path: parts[1].to_string(),
                status,
                staged,
                unstaged,
                old_path: Some(parts[0].to_string()),
            });
        }
    }

    Some(GitStatusFile {
        path: remainder.to_string(),
        status,
        staged,
        unstaged,
        old_path: None,
    })
}

pub fn get_status(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    let output = GitCli::run(repo_path, &["status", "--porcelain=v1"])?;
    let files: Vec<GitStatusFile> = output.lines().filter_map(parse_status_line).collect();
    Ok(files)
}

pub fn get_staged_files(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    let files = get_status(repo_path)?;
    Ok(files.into_iter().filter(|f| f.staged).collect())
}

pub fn get_unstaged_files(repo_path: &Path) -> Result<Vec<GitStatusFile>, AppError> {
    let files = get_status(repo_path)?;
    Ok(files.into_iter().filter(|f| f.unstaged).collect())
}
