use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::{LfsFile, LfsStatus, LfsTrackPattern};
use std::path::Path;

pub fn get_lfs_status(repo_path: &Path) -> Result<LfsStatus, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--is-inside-work-tree"])?;

    let version = match GitCli::run(repo_path, &["lfs", "version"]) {
        Ok(version) => version.trim().to_string(),
        Err(error) => {
            return Ok(LfsStatus {
                available: false,
                version: None,
                tracked_patterns: Vec::new(),
                files: Vec::new(),
                error: Some(error.to_string()),
            });
        }
    };

    let tracked_patterns = GitCli::run(repo_path, &["lfs", "track", "--list"])
        .map(|output| parse_lfs_track_list(&output))
        .unwrap_or_default();
    let files = GitCli::run(repo_path, &["lfs", "ls-files", "--long", "--size"])
        .map(|output| parse_lfs_file_list(&output))
        .unwrap_or_default();

    Ok(LfsStatus {
        available: true,
        version: Some(version),
        tracked_patterns,
        files,
        error: None,
    })
}

pub fn install_lfs(repo_path: &Path) -> Result<(), AppError> {
    GitCli::run(repo_path, &["lfs", "install", "--local"])?;
    Ok(())
}

pub fn track_lfs_pattern(repo_path: &Path, pattern: &str) -> Result<(), AppError> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return Err(AppError::GitError(
            "Git LFS pattern is required".to_string(),
        ));
    }
    GitCli::run(repo_path, &["lfs", "track", pattern])?;
    Ok(())
}

pub fn untrack_lfs_pattern(repo_path: &Path, pattern: &str) -> Result<(), AppError> {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return Err(AppError::GitError(
            "Git LFS pattern is required".to_string(),
        ));
    }
    GitCli::run(repo_path, &["lfs", "untrack", pattern])?;
    Ok(())
}

fn parse_lfs_track_list(output: &str) -> Vec<LfsTrackPattern> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let (pattern, source) = if let Some((pattern, source)) = line.rsplit_once(" (") {
                (
                    pattern.trim().trim_matches('"'),
                    Some(source.trim_end_matches(')').to_string()),
                )
            } else {
                (line.trim().trim_matches('"'), None)
            };
            if pattern.is_empty() {
                None
            } else {
                Some(LfsTrackPattern {
                    pattern: pattern.to_string(),
                    source,
                })
            }
        })
        .collect()
}

fn parse_lfs_file_list(output: &str) -> Vec<LfsFile> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }

            let mut parts = line.split_whitespace();
            let oid = parts.next()?.to_string();
            let marker_or_path = parts.next()?;
            let mut remainder = if marker_or_path == "*" || marker_or_path == "-" {
                parts.collect::<Vec<_>>().join(" ")
            } else {
                std::iter::once(marker_or_path)
                    .chain(parts)
                    .collect::<Vec<_>>()
                    .join(" ")
            };

            let size = if let Some(start) = remainder.rfind(" (") {
                if remainder.ends_with(')') {
                    let size = remainder[start + 2..remainder.len() - 1].to_string();
                    remainder.truncate(start);
                    Some(size)
                } else {
                    None
                }
            } else {
                None
            };

            let path = remainder.trim().to_string();
            if path.is_empty() {
                None
            } else {
                Some(LfsFile { oid, size, path })
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lfs_track_output() {
        let patterns =
            parse_lfs_track_list("*.psd (.gitattributes)\n\"assets/**\" (.git/info/attributes)\n");

        assert_eq!(patterns.len(), 2);
        assert_eq!(patterns[0].pattern, "*.psd");
        assert_eq!(patterns[0].source.as_deref(), Some(".gitattributes"));
        assert_eq!(patterns[1].pattern, "assets/**");
    }

    #[test]
    fn parses_lfs_file_output() {
        let files = parse_lfs_file_list(
            "0123456789abcdef * media/large.psd (42 MB)\nfedcba9876543210 - archive.bin\n",
        );

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].oid, "0123456789abcdef");
        assert_eq!(files[0].path, "media/large.psd");
        assert_eq!(files[0].size.as_deref(), Some("42 MB"));
        assert_eq!(files[1].path, "archive.bin");
    }
}
