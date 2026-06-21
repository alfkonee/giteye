use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::submodule::{Submodule, SubmoduleForeachStatus, SubmoduleStatus};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

#[derive(Clone, Debug, Default)]
struct SubmoduleConfig {
    name: String,
    path: String,
    url: Option<String>,
    branch: Option<String>,
}

#[derive(Clone, Debug)]
struct SubmoduleStatusLine {
    marker: char,
    commit: Option<String>,
    path: String,
}

pub fn list_submodules(repo_path: &Path) -> Result<Vec<Submodule>, AppError> {
    let gitmodules_path = repo_path.join(".gitmodules");
    if !gitmodules_path.is_file() {
        return Ok(Vec::new());
    }

    let configs = read_gitmodules(repo_path)?;
    if configs.is_empty() {
        return Ok(Vec::new());
    }

    let status_lines = read_submodule_status(repo_path)?;
    let status_by_path: HashMap<&str, &SubmoduleStatusLine> = status_lines
        .iter()
        .map(|status| (status.path.as_str(), status))
        .collect();

    configs
        .into_iter()
        .map(|config| {
            let status_line = status_by_path.get(config.path.as_str()).copied();
            let pinned_commit = pinned_commit(repo_path, &config.path)?
                .or_else(|| status_line.and_then(|status| status.commit.clone()));
            let is_initialized = status_line
                .map(|status| status.marker != '-')
                .unwrap_or_else(|| repo_path.join(&config.path).join(".git").exists());
            let current_commit = if is_initialized {
                current_commit(repo_path, &config.path)?
            } else {
                None
            };
            let (behind, ahead) = if is_initialized {
                ahead_behind(repo_path, &config.path)?
            } else {
                (0, 0)
            };
            let nested_prefix = format!("{}/", config.path);
            let is_recursive = status_lines
                .iter()
                .any(|status| status.path.starts_with(&nested_prefix));
            let (parent_has_changes, parent_has_conflict) =
                parent_status_for_path(repo_path, &config.path)?;
            let has_changes = parent_has_changes
                || if is_initialized {
                    submodule_has_changes(repo_path, &config.path)?
                } else {
                    false
                };
            let status = classify_status(
                status_line.map(|status| status.marker),
                pinned_commit.as_deref(),
                current_commit.as_deref(),
                behind,
                has_changes,
                parent_has_conflict,
            );

            Ok(Submodule {
                path: config.path,
                name: config.name,
                url: config.url,
                branch: config.branch,
                pinned_commit,
                current_commit,
                status,
                is_initialized,
                is_recursive,
                behind,
                ahead,
                has_changes,
            })
        })
        .collect()
}

pub fn submodule_count_and_behind(repo_path: &Path) -> Result<(u32, u32), AppError> {
    let gitmodules_path = repo_path.join(".gitmodules");
    if !gitmodules_path.is_file() {
        return Ok((0, 0));
    }

    let configs = read_gitmodules(repo_path)?;
    let status_lines = read_submodule_status(repo_path).unwrap_or_default();
    let behind_count = status_lines
        .iter()
        .filter(|line| matches!(line.marker, '+' | 'U'))
        .count() as u32;

    Ok((configs.len() as u32, behind_count))
}

pub fn update_submodule(repo_path: &Path, path: &str, recursive: bool) -> Result<(), AppError> {
    validate_relative_path(path)?;
    let mut args = vec!["submodule", "update", "--init"];
    if recursive {
        args.push("--recursive");
    }
    args.push("--");
    args.push(path);
    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn sync_submodules(repo_path: &Path, recursive: bool) -> Result<(), AppError> {
    let mut args = vec!["submodule", "sync"];
    if recursive {
        args.push("--recursive");
    }
    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn submodule_init_update(
    repo_path: &Path,
    path: Option<&str>,
    recursive: bool,
    remote: bool,
) -> Result<(), AppError> {
    if let Some(path) = path {
        validate_relative_path(path)?;
    }

    let mut args = vec!["submodule", "update", "--init"];
    if recursive {
        args.push("--recursive");
    }
    if remote {
        args.push("--remote");
    }
    if let Some(path) = path {
        args.push("--");
        args.push(path);
    }

    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn submodule_set_branch(repo_path: &Path, path: &str, branch: &str) -> Result<(), AppError> {
    validate_relative_path(path)?;
    let branch = validate_git_arg("branch", branch)?;
    GitCli::run(
        repo_path,
        &["submodule", "set-branch", "--branch", &branch, "--", path],
    )?;
    GitCli::run(repo_path, &["submodule", "sync", "--", path])?;
    Ok(())
}

pub fn submodule_foreach_status(
    repo_path: &Path,
    recursive: bool,
) -> Result<Vec<SubmoduleForeachStatus>, AppError> {
    let status_lines = read_submodule_status_for(repo_path, recursive)?;

    status_lines
        .into_iter()
        .map(|line| {
            validate_relative_path(&line.path)?;
            let initialized = line.marker != '-';
            let head = if initialized {
                current_commit(repo_path, &line.path)?
            } else {
                None
            };
            let branch = if initialized {
                current_branch(repo_path, &line.path)?
            } else {
                None
            };
            let detached = initialized && branch.is_none() && head.is_some();
            let (modified_files, staged_files) = if initialized {
                submodule_status_counts(repo_path, &line.path)?
            } else {
                (0, 0)
            };
            let (behind, ahead) = if initialized {
                ahead_behind(repo_path, &line.path)?
            } else {
                (0, 0)
            };
            let status = match line.marker {
                'U' => "Conflict",
                '-' => "Uninitialized",
                '+' => "Modified",
                _ if modified_files > 0 || staged_files > 0 => "Modified",
                _ => "Clean",
            }
            .to_string();

            Ok(SubmoduleForeachStatus {
                path: line.path,
                branch,
                head,
                status,
                modified_files,
                staged_files,
                ahead,
                behind,
                detached,
                initialized,
            })
        })
        .collect()
}

pub fn open_submodule(repo_path: &Path, path: &str) -> Result<String, AppError> {
    let submodule_path = checked_submodule_path(repo_path, path)?;
    Ok(submodule_path.to_string_lossy().to_string())
}

pub fn bump_submodule(repo_path: &Path, path: &str) -> Result<(), AppError> {
    validate_relative_path(path)?;
    GitCli::run(repo_path, &["add", "--", path])?;
    Ok(())
}

fn read_gitmodules(repo_path: &Path) -> Result<Vec<SubmoduleConfig>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "config",
            "-f",
            ".gitmodules",
            "--get-regexp",
            r#"^submodule\..*\.(path|url|branch)$"#,
        ],
    )?;
    let mut by_name: HashMap<String, SubmoduleConfig> = HashMap::new();

    for line in output.lines() {
        let Some((key, value)) = line.split_once(' ') else {
            continue;
        };
        let Some(rest) = key.strip_prefix("submodule.") else {
            continue;
        };
        let Some((name, field)) = rest.rsplit_once('.') else {
            continue;
        };
        let entry = by_name
            .entry(name.to_string())
            .or_insert_with(|| SubmoduleConfig {
                name: name.to_string(),
                ..SubmoduleConfig::default()
            });
        match field {
            "path" => entry.path = value.to_string(),
            "url" => entry.url = Some(value.to_string()),
            "branch" => entry.branch = Some(value.to_string()),
            _ => {}
        }
    }

    let mut configs: Vec<SubmoduleConfig> = by_name
        .into_values()
        .filter(|config| !config.path.is_empty())
        .collect();
    configs.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(configs)
}

fn read_submodule_status(repo_path: &Path) -> Result<Vec<SubmoduleStatusLine>, AppError> {
    read_submodule_status_for(repo_path, true)
}

fn read_submodule_status_for(
    repo_path: &Path,
    recursive: bool,
) -> Result<Vec<SubmoduleStatusLine>, AppError> {
    let mut args = vec!["submodule", "status"];
    if recursive {
        args.push("--recursive");
    }
    match GitCli::run(repo_path, &args) {
        Ok(output) => Ok(output.lines().filter_map(parse_status_line).collect()),
        Err(AppError::GitError(message)) if message.contains("no submodule mapping found") => {
            Ok(Vec::new())
        }
        Err(error) => Err(error),
    }
}

fn parse_status_line(line: &str) -> Option<SubmoduleStatusLine> {
    let mut chars = line.chars();
    let marker = chars.next()?;
    let rest = chars.as_str().trim_start();
    let mut parts = rest.split_whitespace();
    let commit = parts
        .next()
        .map(|commit| commit.trim_start_matches('-').to_string());
    let path = parts.next()?.to_string();
    Some(SubmoduleStatusLine {
        marker,
        commit,
        path,
    })
}

fn pinned_commit(repo_path: &Path, path: &str) -> Result<Option<String>, AppError> {
    let output = GitCli::run(repo_path, &["ls-tree", "HEAD", "--", path])?;
    Ok(output
        .split_whitespace()
        .nth(2)
        .filter(|commit| !commit.is_empty())
        .map(ToString::to_string))
}

fn current_commit(repo_path: &Path, path: &str) -> Result<Option<String>, AppError> {
    match GitCli::run(repo_path, &["-C", path, "rev-parse", "HEAD"]) {
        Ok(output) => Ok(Some(output.trim().to_string()).filter(|commit| !commit.is_empty())),
        Err(AppError::GitError(_)) => Ok(None),
        Err(error) => Err(error),
    }
}

fn current_branch(repo_path: &Path, path: &str) -> Result<Option<String>, AppError> {
    match GitCli::run(
        repo_path,
        &["-C", path, "rev-parse", "--abbrev-ref", "HEAD"],
    ) {
        Ok(output) => {
            let branch = output.trim();
            Ok((!branch.is_empty() && branch != "HEAD").then(|| branch.to_string()))
        }
        Err(AppError::GitError(_)) => Ok(None),
        Err(error) => Err(error),
    }
}

fn ahead_behind(repo_path: &Path, path: &str) -> Result<(u32, u32), AppError> {
    match GitCli::run(
        repo_path,
        &[
            "-C",
            path,
            "rev-list",
            "--left-right",
            "--count",
            "HEAD...@{upstream}",
        ],
    ) {
        Ok(output) => {
            let mut parts = output.split_whitespace();
            let ahead = parts
                .next()
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(0);
            let behind = parts
                .next()
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(0);
            Ok((behind, ahead))
        }
        Err(AppError::GitError(_)) => Ok((0, 0)),
        Err(error) => Err(error),
    }
}

fn submodule_has_changes(repo_path: &Path, path: &str) -> Result<bool, AppError> {
    match GitCli::run(repo_path, &["-C", path, "status", "--porcelain"]) {
        Ok(output) => Ok(!output.trim().is_empty()),
        Err(AppError::GitError(_)) => Ok(false),
        Err(error) => Err(error),
    }
}

fn submodule_status_counts(repo_path: &Path, path: &str) -> Result<(u32, u32), AppError> {
    match GitCli::run(repo_path, &["-C", path, "status", "--porcelain=v1"]) {
        Ok(output) => {
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
        Err(AppError::GitError(_)) => Ok((0, 0)),
        Err(error) => Err(error),
    }
}

fn parent_status_for_path(repo_path: &Path, path: &str) -> Result<(bool, bool), AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "status",
            "--porcelain",
            "--ignore-submodules=none",
            "--",
            path,
        ],
    )?;
    let has_changes = !output.trim().is_empty();
    let has_conflict = output.lines().any(|line| {
        let status = line.as_bytes();
        status.len() >= 2
            && (status[0] == b'U'
                || status[1] == b'U'
                || (status[0] == b'A' && status[1] == b'A')
                || (status[0] == b'D' && status[1] == b'D'))
    });
    Ok((has_changes, has_conflict))
}

fn classify_status(
    marker: Option<char>,
    pinned_commit: Option<&str>,
    current_commit: Option<&str>,
    behind: u32,
    has_changes: bool,
    parent_has_conflict: bool,
) -> SubmoduleStatus {
    match marker {
        _ if parent_has_conflict => SubmoduleStatus::Conflict,
        Some('U') => SubmoduleStatus::Conflict,
        Some('-') => SubmoduleStatus::Uninitialized,
        _ if has_changes => SubmoduleStatus::Modified,
        Some('+') => SubmoduleStatus::Modified,
        _ if pinned_commit.is_some()
            && current_commit.is_some()
            && pinned_commit != current_commit =>
        {
            SubmoduleStatus::Modified
        }
        _ if behind > 0 => SubmoduleStatus::UpdatesAvailable,
        _ => SubmoduleStatus::UpToDate,
    }
}

fn checked_submodule_path(repo_path: &Path, path: &str) -> Result<PathBuf, AppError> {
    validate_relative_path(path)?;
    let full_path = repo_path.join(path);
    if !full_path.exists() {
        return Err(AppError::InvalidPath(path.to_string()));
    }
    full_path
        .canonicalize()
        .map_err(|error| AppError::IoError(error.to_string()))
}

fn validate_relative_path(path: &str) -> Result<(), AppError> {
    let candidate = Path::new(path);
    if path.is_empty()
        || candidate.is_absolute()
        || candidate.components().any(|component| {
            matches!(
                component,
                Component::ParentDir
                    | Component::RootDir
                    | Component::Prefix(_)
                    | Component::CurDir
            )
        })
    {
        return Err(AppError::InvalidPath(path.to_string()));
    }
    Ok(())
}

fn validate_git_arg(label: &str, value: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.chars().any(|character| character.is_control()) {
        return Err(AppError::GitError(format!("Invalid {label}: {value}")));
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::{classify_status, parse_status_line, validate_git_arg, validate_relative_path};
    use crate::models::submodule::SubmoduleStatus;

    #[test]
    fn parses_submodule_status_lines() {
        let initialized = parse_status_line(" a1b2c3d libs/ui-kit (v1.0.0)").unwrap();
        assert_eq!(initialized.marker, ' ');
        assert_eq!(initialized.commit.as_deref(), Some("a1b2c3d"));
        assert_eq!(initialized.path, "libs/ui-kit");

        let uninitialized = parse_status_line("-d4e5f6a libs/payments").unwrap();
        assert_eq!(uninitialized.marker, '-');
        assert_eq!(uninitialized.commit.as_deref(), Some("d4e5f6a"));
        assert_eq!(uninitialized.path, "libs/payments");
    }

    #[test]
    fn classifies_submodule_states() {
        assert_eq!(
            classify_status(Some('-'), None, None, 0, false, false),
            SubmoduleStatus::Uninitialized
        );
        assert_eq!(
            classify_status(Some('U'), None, None, 0, false, false),
            SubmoduleStatus::Conflict
        );
        assert_eq!(
            classify_status(Some(' '), Some("a"), Some("b"), 0, false, false),
            SubmoduleStatus::Modified
        );
        assert_eq!(
            classify_status(Some(' '), Some("a"), Some("a"), 2, false, false),
            SubmoduleStatus::UpdatesAvailable
        );
        assert_eq!(
            classify_status(Some(' '), Some("a"), Some("a"), 0, false, false),
            SubmoduleStatus::UpToDate
        );
    }

    #[test]
    fn rejects_unsafe_submodule_paths() {
        assert!(validate_relative_path("libs/ui-kit").is_ok());
        assert!(validate_relative_path("../outside").is_err());
        assert!(validate_relative_path("/absolute").is_err());
        assert!(validate_relative_path("./relative").is_err());
    }

    #[test]
    fn rejects_empty_or_control_branch_names() {
        assert_eq!(validate_git_arg("branch", " main ").unwrap(), "main");
        assert!(validate_git_arg("branch", "").is_err());
        assert!(validate_git_arg("branch", "feature\nbad").is_err());
    }
}
