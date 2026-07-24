use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::git::job_runner::{redact_git_job_args, redact_git_output};
use crate::models::{
    LfsCommandPreview, LfsFile, LfsLock, LfsLocks, LfsMigrationMode, LfsMigrationRequest,
    LfsPruneRequest, LfsStatus, LfsTrackPattern, LfsTransferOperation, LfsTransferRequest,
};
use chrono::Utc;
use serde_json::Value;
use std::path::{Component, Path};

pub fn get_lfs_status(repo_path: &Path) -> Result<LfsStatus, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--is-inside-work-tree"])?;

    let git_version = GitCli::run(repo_path, &["--version"])
        .ok()
        .map(|value| value.trim().to_string());

    let version = match GitCli::run(repo_path, &["lfs", "version"]) {
        Ok(version) => version.trim().to_string(),
        Err(error) => {
            return Ok(LfsStatus {
                available: false,
                version: None,
                git_version,
                hooks_installed: false,
                endpoint: None,
                local_media_dir: None,
                concurrent_transfers: None,
                tracked_patterns: Vec::new(),
                files: Vec::new(),
                error: Some(error.to_string()),
            });
        }
    };

    let environment = GitCli::run(repo_path, &["lfs", "env"]).unwrap_or_default();
    let endpoint = parse_lfs_env_value(&environment, "Endpoint").map(sanitize_endpoint);
    let local_media_dir = parse_lfs_env_value(&environment, "LocalMediaDir");
    let concurrent_transfers = parse_lfs_env_value(&environment, "ConcurrentTransfers")
        .and_then(|value| value.parse::<u32>().ok());
    let hooks_installed = GitCli::run(
        repo_path,
        &["config", "--local", "--get", "filter.lfs.process"],
    )
    .map(|value| value.contains("git-lfs"))
    .unwrap_or(false);

    let tracked_patterns = GitCli::run(repo_path, &["lfs", "track", "--list"])
        .map(|output| parse_lfs_track_list(&output))
        .unwrap_or_default();
    let files = GitCli::run(repo_path, &["lfs", "ls-files", "--long", "--size"])
        .map(|output| parse_lfs_file_list(&output))
        .unwrap_or_default();

    Ok(LfsStatus {
        available: true,
        version: Some(version),
        git_version,
        hooks_installed,
        endpoint,
        local_media_dir,
        concurrent_transfers,
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
    let pattern = required_positional_value(pattern, "Git LFS pattern")?;
    GitCli::run(repo_path, &["lfs", "track", pattern])?;
    Ok(())
}

pub fn untrack_lfs_pattern(repo_path: &Path, pattern: &str) -> Result<(), AppError> {
    let pattern = required_positional_value(pattern, "Git LFS pattern")?;
    GitCli::run(repo_path, &["lfs", "untrack", pattern])?;
    Ok(())
}

pub fn list_lfs_locks(repo_path: &Path, remote: Option<&str>) -> Result<LfsLocks, AppError> {
    ensure_lfs(repo_path)?;
    let mut args = vec![
        "lfs".to_string(),
        "locks".to_string(),
        "--verify".to_string(),
        "--json".to_string(),
    ];
    if let Some(remote) = optional_value(remote, "LFS remote")? {
        args.push(format!("--remote={remote}"));
    }
    let output = run_owned(repo_path, &args)?;
    parse_lfs_locks(&output)
}

pub fn lock_lfs_file(repo_path: &Path, path: &str, remote: Option<&str>) -> Result<(), AppError> {
    ensure_lfs(repo_path)?;
    validate_repo_relative_path(path)?;
    let mut args = vec!["lfs".to_string(), "lock".to_string(), "--json".to_string()];
    if let Some(remote) = optional_value(remote, "LFS remote")? {
        args.push(format!("--remote={remote}"));
    }
    args.extend(["--".to_string(), path.to_string()]);
    run_owned(repo_path, &args)?;
    Ok(())
}

pub fn unlock_lfs_file(
    repo_path: &Path,
    lock_id: &str,
    remote: Option<&str>,
    force: bool,
) -> Result<(), AppError> {
    ensure_lfs(repo_path)?;
    let lock_id = required_value(lock_id, "LFS lock id")?;
    let mut args = vec![
        "lfs".to_string(),
        "unlock".to_string(),
        "--json".to_string(),
    ];
    if force {
        args.push("--force".to_string());
    }
    if let Some(remote) = optional_value(remote, "LFS remote")? {
        args.push(format!("--remote={remote}"));
    }
    args.push(format!("--id={lock_id}"));
    run_owned(repo_path, &args)?;
    Ok(())
}

pub fn preview_lfs_transfer(
    repo_path: &Path,
    request: &LfsTransferRequest,
) -> Result<LfsCommandPreview, AppError> {
    ensure_lfs(repo_path)?;
    let args = build_transfer_args(request, true)?;
    let lines = run_preview(repo_path, &args)?;
    Ok(LfsCommandPreview {
        command: prefixed_command(&args),
        lines,
        destructive: false,
        description: match request.operation {
            LfsTransferOperation::Pull => {
                "Objects that would be fetched before populating the worktree".to_string()
            }
            LfsTransferOperation::Fetch => {
                "Objects that would be downloaded into the local LFS cache".to_string()
            }
            LfsTransferOperation::Push => {
                "Objects that would be uploaded to the LFS remote".to_string()
            }
        },
    })
}

pub fn build_transfer_args(
    request: &LfsTransferRequest,
    preview: bool,
) -> Result<Vec<String>, AppError> {
    let command = if preview && request.operation == LfsTransferOperation::Pull {
        "fetch"
    } else {
        match request.operation {
            LfsTransferOperation::Fetch => "fetch",
            LfsTransferOperation::Pull => "pull",
            LfsTransferOperation::Push => "push",
        }
    };
    let mut args = vec!["lfs".to_string(), command.to_string()];
    if preview {
        args.push("--dry-run".to_string());
    }
    if request.all {
        if request.operation == LfsTransferOperation::Pull {
            return Err(AppError::GitError(
                "Git LFS pull does not support --all".to_string(),
            ));
        }
        args.push("--all".to_string());
    }
    if request.all && (request.include.is_some() || request.exclude.is_some()) {
        return Err(AppError::GitError(
            "Git LFS fetch --all cannot be combined with include or exclude paths".to_string(),
        ));
    }
    if let Some(include) = optional_value(request.include.as_deref(), "include paths")? {
        if request.operation == LfsTransferOperation::Push {
            return Err(AppError::GitError(
                "Git LFS push does not support include paths".to_string(),
            ));
        }
        args.push(format!("--include={include}"));
    }
    if let Some(exclude) = optional_value(request.exclude.as_deref(), "exclude paths")? {
        if request.operation == LfsTransferOperation::Push {
            return Err(AppError::GitError(
                "Git LFS push does not support exclude paths".to_string(),
            ));
        }
        args.push(format!("--exclude={exclude}"));
    }

    let remote = optional_positional_value(request.remote.as_deref(), "LFS remote")?;
    let reference = optional_positional_value(request.reference.as_deref(), "Git ref")?;
    if request.operation == LfsTransferOperation::Push {
        let remote =
            remote.ok_or_else(|| AppError::GitError("LFS push remote is required".to_string()))?;
        args.push(remote.to_string());
        if request.all {
            if reference.is_some() {
                return Err(AppError::GitError(
                    "Git LFS push --all cannot be combined with a ref".to_string(),
                ));
            }
        } else {
            let reference = reference
                .ok_or_else(|| AppError::GitError("LFS push ref is required".to_string()))?;
            args.push(reference.to_string());
        }
    } else {
        if let Some(remote) = remote {
            args.push(remote.to_string());
        }
        if request.operation == LfsTransferOperation::Pull && reference.is_some() {
            return Err(AppError::GitError(
                "Git LFS pull does not support a ref".to_string(),
            ));
        }
        if command == "fetch" {
            if let Some(reference) = reference {
                args.push(reference.to_string());
            }
        }
    }
    Ok(args)
}

pub fn preview_lfs_prune(
    repo_path: &Path,
    request: &LfsPruneRequest,
) -> Result<LfsCommandPreview, AppError> {
    ensure_lfs(repo_path)?;
    let args = build_prune_args(request, true);
    Ok(LfsCommandPreview {
        command: prefixed_command(&args),
        lines: run_preview(repo_path, &args)?,
        destructive: true,
        description: "Local LFS objects eligible for permanent deletion".to_string(),
    })
}

pub fn build_prune_args(request: &LfsPruneRequest, preview: bool) -> Vec<String> {
    let mut args = vec![
        "lfs".to_string(),
        "prune".to_string(),
        "--verbose".to_string(),
    ];
    if preview {
        args.push("--dry-run".to_string());
    }
    if request.verify_remote {
        args.push("--verify-remote".to_string());
    }
    if request.force {
        args.push("--force".to_string());
    }
    args
}

pub fn preview_lfs_fsck(
    repo_path: &Path,
    revision: Option<&str>,
) -> Result<LfsCommandPreview, AppError> {
    ensure_lfs(repo_path)?;
    let mut args = vec!["lfs".to_string(), "fsck".to_string()];
    if let Some(revision) = optional_positional_value(revision, "fsck revision")? {
        args.push(revision.to_string());
    }
    Ok(LfsCommandPreview {
        command: prefixed_command(&args),
        lines: vec!["Git LFS has no dry-run mode for fsck. The command may move corrupt objects into .git/lfs/bad.".to_string()],
        destructive: true,
        description: "LFS pointer and local object integrity check; no command was run for this preview".to_string(),
    })
}

pub fn build_fsck_args(revision: Option<&str>) -> Result<Vec<String>, AppError> {
    let mut args = vec!["lfs".to_string(), "fsck".to_string()];
    if let Some(revision) = optional_positional_value(revision, "fsck revision")? {
        args.push(revision.to_string());
    }
    Ok(args)
}

pub fn preview_lfs_migration(
    repo_path: &Path,
    request: &LfsMigrationRequest,
) -> Result<LfsCommandPreview, AppError> {
    ensure_lfs(repo_path)?;
    let args = build_migration_info_args(request)?;
    Ok(LfsCommandPreview {
        command: prefixed_command(&args),
        lines: run_preview(repo_path, &args)?,
        destructive: true,
        description: "Read-only history analysis; migration itself rewrites selected commits"
            .to_string(),
    })
}

pub fn build_migration_args(request: &LfsMigrationRequest) -> Result<Vec<String>, AppError> {
    let include = required_value(&request.include, "migration include pattern")?;
    let mut args = vec![
        "lfs".to_string(),
        "migrate".to_string(),
        match request.mode {
            LfsMigrationMode::Import => "import",
            LfsMigrationMode::Export => "export",
        }
        .to_string(),
        format!("--include={include}"),
    ];
    append_migration_selection(&mut args, request)?;
    if request.mode == LfsMigrationMode::Export {
        if let Some(remote) = optional_value(request.remote.as_deref(), "migration remote")? {
            args.push(format!("--remote={remote}"));
        }
    }
    Ok(args)
}

pub fn migration_backup_name() -> String {
    format!(
        "giteye/lfs-migration-backup-{}",
        Utc::now().format("%Y%m%d-%H%M%S-%3f")
    )
}

pub fn create_migration_backup(repo_path: &Path, branch: &str) -> Result<(), AppError> {
    let dirty = GitCli::run(repo_path, &["status", "--porcelain"])?;
    if !dirty.trim().is_empty() {
        return Err(AppError::GitError(
            "Git LFS migration requires a clean working tree; commit or stash changes first"
                .to_string(),
        ));
    }
    GitCli::run(repo_path, &["branch", branch, "HEAD"])?;
    Ok(())
}

fn build_migration_info_args(request: &LfsMigrationRequest) -> Result<Vec<String>, AppError> {
    let mut args = vec!["lfs".to_string(), "migrate".to_string(), "info".to_string()];
    if !request.include.trim().is_empty() {
        args.push(format!(
            "--include={}",
            required_value(&request.include, "migration include pattern")?
        ));
    }
    append_migration_selection(&mut args, request)?;
    Ok(args)
}

fn append_migration_selection(
    args: &mut Vec<String>,
    request: &LfsMigrationRequest,
) -> Result<(), AppError> {
    if request.everything || !request.include_refs.is_empty() {
        return Err(AppError::GitError(
            "GitEye currently limits LFS migration to the checked-out branch so the recovery branch covers every rewritten commit".to_string(),
        ));
    }
    if let Some(exclude) = optional_value(request.exclude.as_deref(), "migration exclude pattern")?
    {
        args.push(format!("--exclude={exclude}"));
    }
    args.push("--skip-fetch".to_string());
    Ok(())
}

fn ensure_lfs(repo_path: &Path) -> Result<(), AppError> {
    GitCli::run(repo_path, &["lfs", "version"])?;
    Ok(())
}

fn run_owned(repo_path: &Path, args: &[String]) -> Result<String, AppError> {
    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    GitCli::run(repo_path, &refs).map_err(redact_app_error)
}

fn redact_app_error(error: AppError) -> AppError {
    match error {
        AppError::GitError(message) => AppError::GitError(redact_git_output(&message)),
        other => other,
    }
}

fn run_preview(repo_path: &Path, args: &[String]) -> Result<Vec<String>, AppError> {
    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    let output = GitCli::run_with_status(repo_path, &refs)?;
    if output.status_code != 0 {
        return Err(AppError::GitError(redact_git_output(output.stderr.trim())));
    }
    Ok(output_lines(&output.stdout, &output.stderr))
}

fn output_lines(stdout: &str, stderr: &str) -> Vec<String> {
    stdout
        .lines()
        .chain(stderr.lines())
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(redact_git_output)
        .collect()
}

fn prefixed_command(args: &[String]) -> Vec<String> {
    std::iter::once("git".to_string())
        .chain(redact_git_job_args(args))
        .collect()
}

fn required_value<'a>(value: &'a str, label: &str) -> Result<&'a str, AppError> {
    let value = value.trim();
    if value.is_empty() || value.chars().any(char::is_control) {
        return Err(AppError::GitError(format!("Valid {label} is required")));
    }
    Ok(value)
}

fn optional_value<'a>(value: Option<&'a str>, label: &str) -> Result<Option<&'a str>, AppError> {
    value.map(|value| required_value(value, label)).transpose()
}

fn optional_positional_value<'a>(
    value: Option<&'a str>,
    label: &str,
) -> Result<Option<&'a str>, AppError> {
    let value = optional_value(value, label)?;
    if value.is_some_and(|value| value.starts_with('-')) {
        return Err(AppError::GitError(format!(
            "{label} must not start with '-'"
        )));
    }
    Ok(value)
}

fn required_positional_value<'a>(value: &'a str, label: &str) -> Result<&'a str, AppError> {
    optional_positional_value(Some(value), label)?
        .ok_or_else(|| AppError::GitError(format!("Valid {label} is required")))
}

fn validate_repo_relative_path(path: &str) -> Result<(), AppError> {
    let path = Path::new(required_value(path, "repository-relative path")?);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(AppError::InvalidPath(path.to_string_lossy().to_string()));
    }
    Ok(())
}

fn parse_lfs_env_value(output: &str, key: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let (candidate, value) = line.split_once('=')?;
        (candidate.trim() == key).then(|| value.trim().to_string())
    })
}

fn sanitize_endpoint(mut endpoint: String) -> String {
    if let Some(index) = endpoint.find(" (auth=") {
        endpoint.truncate(index);
    }
    if let Some(index) = endpoint.find(['?', '#']) {
        endpoint.truncate(index);
    }
    if let Some(scheme_end) = endpoint.find("://") {
        let authority_start = scheme_end + 3;
        let authority_end = endpoint[authority_start..]
            .find('/')
            .map(|index| authority_start + index)
            .unwrap_or(endpoint.len());
        if let Some(at) = endpoint[authority_start..authority_end].rfind('@') {
            endpoint.replace_range(authority_start..authority_start + at + 1, "");
        }
    }
    endpoint
}

fn parse_lfs_locks(output: &str) -> Result<LfsLocks, AppError> {
    let value: Value = serde_json::from_str(output).map_err(|error| {
        AppError::SerializationError(format!("Invalid Git LFS locks JSON: {error}"))
    })?;
    let mut locks = LfsLocks::default();
    if let Some(items) = value.as_array() {
        locks.ours = items
            .iter()
            .filter_map(|item| parse_lfs_lock(item, true))
            .collect();
        return Ok(locks);
    }
    let object = value.as_object().ok_or_else(|| {
        AppError::SerializationError("Invalid Git LFS locks response".to_string())
    })?;
    locks.ours = object
        .get("ours")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| parse_lfs_lock(item, true))
        .collect();
    locks.theirs = object
        .get("theirs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| parse_lfs_lock(item, false))
        .collect();
    Ok(locks)
}

fn parse_lfs_lock(value: &Value, ours: bool) -> Option<LfsLock> {
    Some(LfsLock {
        id: value.get("id")?.as_str()?.to_string(),
        path: value.get("path")?.as_str()?.to_string(),
        owner: value
            .get("owner")
            .and_then(|owner| owner.get("name"))
            .and_then(Value::as_str)
            .map(str::to_string),
        locked_at: value
            .get("locked_at")
            .and_then(Value::as_str)
            .map(str::to_string),
        ours,
    })
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

    #[test]
    fn parses_and_sanitizes_lfs_environment() {
        let output = "Endpoint=https://user:secret@example.com/repo.git/info/lfs?token=secret (auth=basic)\nLocalMediaDir=/repo/.git/lfs/objects\nConcurrentTransfers=8\n";

        assert_eq!(
            parse_lfs_env_value(output, "Endpoint").map(sanitize_endpoint),
            Some("https://example.com/repo.git/info/lfs".to_string())
        );
        assert_eq!(
            parse_lfs_env_value(output, "LocalMediaDir").as_deref(),
            Some("/repo/.git/lfs/objects")
        );
    }

    #[test]
    fn parses_verified_lfs_locks() {
        let locks = parse_lfs_locks(
            r#"{"ours":[{"id":"1","path":"art.psd","owner":{"name":"Ada"},"locked_at":"2026-07-24T10:00:00Z"}],"theirs":[{"id":"2","path":"model.bin","owner":{"name":"Lin"}}]}"#,
        )
        .expect("parse locks");

        assert_eq!(locks.ours.len(), 1);
        assert_eq!(locks.ours[0].path, "art.psd");
        assert!(locks.ours[0].ours);
        assert_eq!(locks.theirs[0].owner.as_deref(), Some("Lin"));
        assert!(!locks.theirs[0].ours);
    }

    #[test]
    fn builds_safe_transfer_arguments() {
        let request = LfsTransferRequest {
            operation: LfsTransferOperation::Fetch,
            remote: Some("origin".to_string()),
            reference: Some("main".to_string()),
            include: Some("assets/**".to_string()),
            exclude: None,
            all: false,
        };

        assert_eq!(
            build_transfer_args(&request, true).expect("build args"),
            vec![
                "lfs",
                "fetch",
                "--dry-run",
                "--include=assets/**",
                "origin",
                "main"
            ]
        );

        let migration = LfsMigrationRequest {
            mode: LfsMigrationMode::Import,
            include: "*.bin".to_string(),
            exclude: None,
            include_refs: Vec::new(),
            everything: false,
            remote: None,
        };
        assert!(build_migration_args(&migration)
            .expect("build migration")
            .contains(&"--skip-fetch".to_string()));
        assert!(build_migration_info_args(&migration)
            .expect("build migration preview")
            .contains(&"--skip-fetch".to_string()));

        assert!(matches!(
            redact_app_error(AppError::GitError(
                "https://user:secret@example.com/repo?token=secret".to_string()
            )),
            AppError::GitError(message) if message == "https://example.com/repo?<redacted>"
        ));
    }

    #[test]
    fn rejects_invalid_transfer_and_migration_options() {
        let push = LfsTransferRequest {
            operation: LfsTransferOperation::Push,
            remote: None,
            reference: Some("main".to_string()),
            include: None,
            exclude: None,
            all: false,
        };
        assert!(build_transfer_args(&push, false).is_err());

        let migration = LfsMigrationRequest {
            mode: LfsMigrationMode::Import,
            include: "\n".to_string(),
            exclude: None,
            include_refs: Vec::new(),
            everything: false,
            remote: None,
        };
        assert!(build_migration_args(&migration).is_err());

        let option_remote = LfsTransferRequest {
            operation: LfsTransferOperation::Push,
            remote: Some("--stdin".to_string()),
            reference: Some("main".to_string()),
            include: None,
            exclude: None,
            all: false,
        };
        assert!(build_transfer_args(&option_remote, false).is_err());

        let incompatible_fetch = LfsTransferRequest {
            operation: LfsTransferOperation::Fetch,
            remote: None,
            reference: None,
            include: Some("assets/**".to_string()),
            exclude: None,
            all: true,
        };
        assert!(build_transfer_args(&incompatible_fetch, false).is_err());

        let pull_ref = LfsTransferRequest {
            operation: LfsTransferOperation::Pull,
            remote: Some("origin".to_string()),
            reference: Some("main".to_string()),
            include: None,
            exclude: None,
            all: false,
        };
        assert!(build_transfer_args(&pull_ref, false).is_err());

        let all_push = LfsTransferRequest {
            operation: LfsTransferOperation::Push,
            remote: Some("origin".to_string()),
            reference: None,
            include: None,
            exclude: None,
            all: true,
        };
        assert_eq!(
            build_transfer_args(&all_push, false).expect("build all push"),
            vec!["lfs", "push", "--all", "origin"]
        );

        let multi_ref_migration = LfsMigrationRequest {
            include: "*.bin".to_string(),
            include_refs: vec!["refs/heads/main".to_string()],
            ..migration
        };
        assert!(build_migration_args(&multi_ref_migration).is_err());
    }
}
