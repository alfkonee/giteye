use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::DiffResult;
use std::path::Path;

fn count_diff_stats(diff_text: &str) -> (u32, u32) {
    let additions = diff_text
        .lines()
        .filter(|l| l.starts_with('+') && !l.starts_with("+++"))
        .count() as u32;
    let deletions = diff_text
        .lines()
        .filter(|l| l.starts_with('-') && !l.starts_with("---"))
        .count() as u32;
    (additions, deletions)
}

pub fn get_file_diff(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<DiffResult, AppError> {
    let diff_text = if staged {
        GitCli::run(repo_path, &["diff", "--cached", "--", file_path])?
    } else {
        GitCli::run(repo_path, &["diff", "--", file_path])?
    };

    let is_binary = diff_text.contains("Binary files");
    let (additions, deletions) = count_diff_stats(&diff_text);

    Ok(DiffResult {
        file_path: file_path.to_string(),
        old_file_path: None,
        diff_text,
        additions,
        deletions,
        is_binary,
    })
}

pub fn get_commit_diff(repo_path: &Path, hash: &str) -> Result<DiffResult, AppError> {
    let diff_text = GitCli::run(repo_path, &["show", "--format=", hash])?;

    let is_binary = diff_text.contains("Binary files");
    let (additions, deletions) = count_diff_stats(&diff_text);

    Ok(DiffResult {
        file_path: hash.to_string(),
        old_file_path: None,
        diff_text,
        additions,
        deletions,
        is_binary,
    })
}
