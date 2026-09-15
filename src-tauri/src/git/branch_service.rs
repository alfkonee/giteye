use crate::errors::AppError;
use crate::git::cli::{has_worktree_changes, required_git_arg, GitCli};
use crate::models::{
    unix_seconds_to_iso, Branch, LocalBranchPruneCandidate, LocalBranchPruneFailure,
    LocalBranchPruneResult,
};
use std::collections::HashSet;
use std::path::Path;

pub fn list_branches(repo_path: &Path) -> Result<Vec<Branch>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "branch",
            "--all",
            "--format=%(refname)|%(refname:short)|%(upstream:short)|%(upstream:track)|%(HEAD)|%(committerdate:iso-strict)|%(authorname)|%(contents:subject)",
        ],
    )?;

    let logs_dir = branch_reflogs_dir(repo_path);

    let branches: Vec<Branch> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(8, '|').collect();
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

            let last_commit_date = parts
                .get(5)
                .filter(|d| !d.is_empty())
                .map(|d| d.to_string());
            let last_commit_author = parts
                .get(6)
                .filter(|a| !a.is_empty())
                .map(|a| a.to_string());
            let last_commit_subject = parts
                .get(7)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());

            // Only local branches have a meaningful creation date; it is taken
            // from the oldest entry in the branch's reflog file.
            let created_at = if is_remote {
                None
            } else {
                logs_dir
                    .as_deref()
                    .and_then(|dir| branch_created_at(dir, short_ref))
            };

            Some(Branch {
                name: ref_name.to_string(),
                short_name: short_ref.to_string(),
                is_current,
                is_remote,
                upstream,
                ahead,
                behind,
                last_commit_date,
                last_commit_author,
                last_commit_subject,
                created_at,
            })
        })
        .collect();

    Ok(branches)
}

/// Resolves the directory holding reflog files (`git rev-parse --git-path logs`).
fn branch_reflogs_dir(repo_path: &Path) -> Option<String> {
    let path = GitCli::run(repo_path, &["rev-parse", "--git-path", "logs"]).ok()?;
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    let resolved = Path::new(trimmed);
    Some(
        if resolved.is_absolute() {
            resolved.to_path_buf()
        } else {
            repo_path.join(resolved)
        }
        .to_string_lossy()
        .to_string(),
    )
}

/// Oldest reflog entry timestamp for a branch, formatted as ISO-8601.
fn branch_created_at(logs_dir: &str, short_name: &str) -> Option<String> {
    let file = std::fs::read(format!("{logs_dir}/refs/heads/{short_name}")).ok()?;
    let first_line = String::from_utf8(file).ok()?.lines().next()?.to_string();
    // Reflog line: "<old-sha> <new-sha> <ident> <unix-time> <tz>\t<message>"
    let left = first_line.split('\t').next()?;
    let tokens: Vec<&str> = left.split_whitespace().collect();
    if tokens.len() < 2 {
        return None;
    }
    let seconds: i64 = tokens[tokens.len() - 2].parse().ok()?;
    unix_seconds_to_iso(seconds)
}

pub fn get_current_branch(repo_path: &Path) -> Result<String, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())
}

pub fn checkout_branch(repo_path: &Path, name: &str, strategy: &str) -> Result<(), AppError> {
    if !matches!(strategy, "move" | "stash" | "discard") {
        return Err(AppError::GitError(format!(
            "Unsupported checkout strategy: {strategy}"
        )));
    }
    let target = checkout_target(repo_path, name)?;
    if get_current_branch(repo_path)? == target.local_name {
        return Ok(());
    }
    preflight_checkout(repo_path, &target)?;
    if strategy == "move" {
        return switch_branch(repo_path, &target);
    }

    preflight_checkout_changes(repo_path, &target)?;
    if !has_worktree_changes(repo_path)? {
        return switch_branch(repo_path, &target);
    }
    let original_head = GitCli::run(repo_path, &["rev-parse", "HEAD"])?;
    let original_branch = GitCli::run(repo_path, &["symbolic-ref", "-q", "HEAD"]).ok();
    let previous_stash = current_stash(repo_path);
    let message = format!("GitEye: before switching to {}", target.local_name);
    // A recoverable snapshot, not reset --hard / clean / switch --force. In
    // particular, never recurse into submodules, even if the user enabled it.
    let saved = GitCli::run(
        repo_path,
        &[
            "-c",
            "submodule.recurse=false",
            "stash",
            "push",
            "--include-untracked",
            "-m",
            &message,
        ],
    );
    let backup = current_stash(repo_path).filter(|oid| Some(oid) != previous_stash.as_ref());
    if let Err(error) = saved {
        return Err(checkout_failure(
            repo_path,
            error,
            backup.as_deref(),
            &original_head,
            original_branch.as_deref(),
        ));
    }
    let Some(backup) = backup else {
        return Err(AppError::GitError(
            "Git did not create a working-copy snapshot. Checkout was cancelled without discarding changes.".to_string(),
        ));
    };
    if let Err(error) = switch_branch(repo_path, &target) {
        return Err(checkout_failure(
            repo_path,
            error,
            Some(&backup),
            &original_head,
            original_branch.as_deref(),
        ));
    }
    if strategy == "discard" {
        // Do not drop someone else's stash if an external Git process changed
        // the stack. Retaining our snapshot is safer than deleting the wrong one.
        if current_stash(repo_path).as_deref() != Some(backup.as_str()) {
            return Err(AppError::GitError(format!(
                "Branch switched, but the stash stack changed. The recovery snapshot {backup} was not deleted."
            )));
        }
        GitCli::run(repo_path, &["stash", "drop", "stash@{0}"]).map_err(|error| {
            AppError::GitError(format!(
                "Branch switched, but the recovery snapshot {backup} could not be deleted: {error}"
            ))
        })?;
    }
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

pub fn rename_branch(repo_path: &Path, old_name: &str, new_name: &str) -> Result<(), AppError> {
    let old_name = required_git_arg(old_name, "current branch name")?;
    let new_name = required_git_arg(new_name, "new branch name")?;
    GitCli::run(repo_path, &["branch", "-m", old_name, new_name])?;
    Ok(())
}

pub fn set_branch_upstream(
    repo_path: &Path,
    name: &str,
    upstream: Option<&str>,
) -> Result<(), AppError> {
    let name = required_git_arg(name, "branch name")?;
    if let Some(upstream) = upstream.map(str::trim).filter(|value| !value.is_empty()) {
        if upstream.starts_with('-') {
            return Err(AppError::GitError(
                "branch upstream must not start with '-'".to_string(),
            ));
        }
        let upstream_arg = format!("--set-upstream-to={upstream}");
        GitCli::run(repo_path, &["branch", &upstream_arg, name])?;
    } else {
        GitCli::run(repo_path, &["branch", "--unset-upstream", name])?;
    }
    Ok(())
}

pub fn fast_forward_branch(repo_path: &Path, name: &str, upstream: &str) -> Result<(), AppError> {
    if upstream.is_empty() {
        return Err(AppError::GitError(format!(
            "Branch {name} does not have a tracked upstream"
        )));
    }

    GitCli::run(repo_path, &["merge-base", "--is-ancestor", name, upstream])?;

    if get_current_branch(repo_path)? == name {
        GitCli::run(repo_path, &["merge", "--ff-only", upstream])?;
    } else {
        GitCli::run(repo_path, &["branch", "-f", name, upstream])?;
    }

    Ok(())
}

#[allow(dead_code)]
pub fn merge_branch(repo_path: &Path, source: &str) -> Result<(), AppError> {
    merge_with_options(repo_path, source, false, false, None)
}

#[allow(dead_code)]
pub fn merge_with_options(
    repo_path: &Path,
    source: &str,
    no_ff: bool,
    squash: bool,
    strategy_option: Option<&str>,
) -> Result<(), AppError> {
    let source = required_git_arg(source, "merge source")?;
    if no_ff && squash {
        return Err(AppError::GitError(
            "Cannot combine --no-ff and --squash merge options".to_string(),
        ));
    }

    let current = get_current_branch(repo_path)?;
    if current == source {
        return Err(AppError::GitError(format!(
            "Cannot merge branch {source} into itself"
        )));
    }

    if has_worktree_changes(repo_path)? {
        return Err(AppError::GitError(
            "Working tree must be clean before merging branches".to_string(),
        ));
    }

    let mut args = vec!["merge".to_string()];
    if no_ff {
        args.push("--no-ff".to_string());
    }
    if squash {
        args.push("--squash".to_string());
    } else {
        args.push("--no-edit".to_string());
    }
    if let Some(option) = strategy_option
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let option = validate_merge_strategy_option(option)?;
        args.push("-X".to_string());
        args.push(option.to_string());
    }
    args.push(source.to_string());

    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    GitCli::run(repo_path, &argv)?;
    Ok(())
}

pub fn delete_branch(repo_path: &Path, name: &str, force: bool) -> Result<(), AppError> {
    let flag = if force { "-D" } else { "-d" };
    GitCli::run(repo_path, &["branch", flag, name])?;
    Ok(())
}

/// Local branches that are candidates for pruning: fully merged into HEAD
/// and/or tracking an upstream that no longer exists. The current branch is
/// never a candidate.
pub fn local_prune_candidates(
    repo_path: &Path,
) -> Result<Vec<LocalBranchPruneCandidate>, AppError> {
    let format = "%(HEAD)|%(refname:short)|%(upstream:track)";
    let merged_output = GitCli::run(
        repo_path,
        &["branch", "--merged", "HEAD", "--format", format],
    )?;
    let all_output = GitCli::run(repo_path, &["branch", "--format", format])?;

    let parse = |line: &str| -> Option<(bool, String, bool)> {
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() < 2 {
            return None;
        }
        let is_current = parts[0] == "*";
        let name = parts[1].trim().to_string();
        if name.is_empty() {
            return None;
        }
        let track = parts.get(2).copied().unwrap_or("").trim().to_string();
        Some((is_current, name, track.to_lowercase().contains("gone")))
    };

    let mut candidates: Vec<LocalBranchPruneCandidate> = Vec::new();
    for line in merged_output.lines() {
        if let Some((is_current, name, gone)) = parse(line) {
            if is_current {
                continue;
            }
            candidates.push(LocalBranchPruneCandidate {
                branch: name,
                fully_merged: true,
                upstream_gone: gone,
            });
        }
    }

    for line in all_output.lines() {
        if let Some((is_current, name, gone)) = parse(line) {
            if is_current || !gone || candidates.iter().any(|c| c.branch == name) {
                continue;
            }
            candidates.push(LocalBranchPruneCandidate {
                branch: name,
                fully_merged: false,
                upstream_gone: true,
            });
        }
    }

    candidates.sort_by(|a, b| a.branch.cmp(&b.branch));
    Ok(candidates)
}

/// Deletes local branches with `-d` by default or `-D` after an explicit force
/// request. Individual failures are reported without stopping the whole batch.
pub fn prune_local_branches(
    repo_path: &Path,
    branches: &[String],
    force: bool,
) -> Result<LocalBranchPruneResult, AppError> {
    let mut result = LocalBranchPruneResult {
        deleted: Vec::new(),
        failed: Vec::new(),
    };

    for branch in branches {
        let name = required_git_arg(branch, "branch name")?;
        let flag = if force { "-D" } else { "-d" };
        match GitCli::run(repo_path, &["branch", flag, name]) {
            Ok(_) => result.deleted.push(name.to_string()),
            Err(error) => result.failed.push(LocalBranchPruneFailure {
                branch: name.to_string(),
                reason: match error {
                    AppError::GitError(message) => message,
                    other => other.to_string(),
                },
            }),
        }
    }

    Ok(result)
}

fn validate_merge_strategy_option(option: &str) -> Result<&str, AppError> {
    let option = option.trim();
    let is_safe = matches!(
        option,
        "ours"
            | "theirs"
            | "ignore-space-change"
            | "ignore-all-space"
            | "ignore-space-at-eol"
            | "ignore-cr-at-eol"
            | "renormalize"
            | "no-renormalize"
            | "patience"
            | "diff-algorithm=patience"
            | "diff-algorithm=minimal"
            | "diff-algorithm=histogram"
            | "diff-algorithm=myers"
    );

    if is_safe {
        Ok(option)
    } else {
        Err(AppError::GitError(format!(
            "Unsupported merge strategy option: {option}"
        )))
    }
}

struct CheckoutTarget {
    local_name: String,
    /// Present only when a new tracking branch must be created.
    remote_ref: Option<String>,
}

fn checkout_target(repo_path: &Path, name: &str) -> Result<CheckoutTarget, AppError> {
    let name = required_git_arg(name, "branch name")?;
    let local_name = name.strip_prefix("refs/heads/").unwrap_or(name);
    if !name.starts_with("refs/remotes/") && local_branch_exists(repo_path, local_name) {
        return Ok(CheckoutTarget {
            local_name: local_name.to_string(),
            remote_ref: None,
        });
    }
    let remote_name = name.strip_prefix("refs/remotes/").unwrap_or(name);
    if !name.starts_with("refs/heads/") && remote_branch_exists(repo_path, remote_name) {
        let local_name = remote_name
            .split_once('/')
            .map(|(_, branch)| branch)
            .filter(|branch| !branch.is_empty() && *branch != "HEAD")
            .ok_or_else(|| AppError::GitError("Remote ref does not name a branch".to_string()))?;
        GitCli::run(repo_path, &["check-ref-format", "--branch", local_name])?;
        return Ok(CheckoutTarget {
            local_name: local_name.to_string(),
            remote_ref: if local_branch_exists(repo_path, local_name) {
                None
            } else {
                Some(format!("refs/remotes/{remote_name}"))
            },
        });
    }
    Err(AppError::GitError(format!("Branch does not exist: {name}")))
}

fn preflight_checkout(repo_path: &Path, target: &CheckoutTarget) -> Result<(), AppError> {
    let local_ref = format!("refs/heads/{}", target.local_name);
    GitCli::run(repo_path, &["check-ref-format", &local_ref])?;
    let destination = target.remote_ref.as_deref().unwrap_or(&local_ref);
    GitCli::run(
        repo_path,
        &[
            "rev-parse",
            "--verify",
            &format!("{destination}^{{commit}}"),
        ],
    )?;
    let worktrees = GitCli::run(repo_path, &["worktree", "list", "--porcelain", "-z"])?;
    if worktrees
        .split('\0')
        .any(|field| field.strip_prefix("branch ") == Some(local_ref.as_str()))
    {
        return Err(AppError::GitError(format!(
            "Branch {} is checked out in another worktree",
            target.local_name
        )));
    }
    // A stash during an in-progress operation could mutate its index or lose
    // state. Refuse before creating a snapshot or touching the working copy.
    for marker in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
        "BISECT_LOG",
    ] {
        let path = GitCli::run(repo_path, &["rev-parse", "--git-path", marker])?;
        if repo_path.join(path.trim()).exists() {
            return Err(AppError::GitError(
                "Finish or abort the current Git operation before switching branches".to_string(),
            ));
        }
    }
    Ok(())
}

fn preflight_checkout_changes(repo_path: &Path, target: &CheckoutTarget) -> Result<(), AppError> {
    let status = GitCli::run(
        repo_path,
        &["status", "--porcelain=v2", "--ignore-submodules=none", "-z"],
    )?;
    let mut entries = status.split('\0');
    while let Some(entry) = entries.next() {
        if entry.starts_with("u ") {
            return Err(AppError::GitError(
                "Resolve unmerged files before stashing or discarding changes".to_string(),
            ));
        }
        if entry.starts_with("1 ") || entry.starts_with("2 ") {
            if let Some(submodule) = entry.split_whitespace().nth(2) {
                if submodule.starts_with('S') {
                    return Err(AppError::GitError("Submodule checkout or working-copy changes must be handled inside each submodule before stashing or discarding.".to_string()));
                }
            }
        }
        if entry.starts_with("2 ") {
            entries.next(); // The next NUL-delimited field is the rename's old path.
        }
    }
    let untracked = GitCli::run(
        repo_path,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )?;
    let ignored = GitCli::run(
        repo_path,
        &[
            "ls-files",
            "--others",
            "--ignored",
            "--exclude-standard",
            "--directory",
            "-z",
        ],
    )?;
    let indexed = GitCli::run(repo_path, &["ls-files", "-z"])?;
    if untracked.contains('\u{fffd}')
        || ignored.contains('\u{fffd}')
        || indexed.contains('\u{fffd}')
    {
        return Err(AppError::GitError("Cannot safely inspect non-UTF-8 paths. Move changes instead of stashing or discarding.".to_string()));
    }
    let untracked_paths = untracked
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(|path| repo_path.join(path.trim_end_matches('/')));
    // Include parents of indexed files: a user may have initialized a nested
    // repository inside a directory whose files are tracked by the outer repo.
    // Gitlinks themselves are omitted; clean submodules need not block checkout.
    let indexed_parents = indexed
        .split('\0')
        .filter(|path| !path.is_empty())
        .filter_map(|path| Path::new(path).parent())
        .map(|path| repo_path.join(path));
    let mut inspected = HashSet::new();
    for full_path in untracked_paths.chain(indexed_parents) {
        for ancestor in full_path
            .ancestors()
            .take_while(|ancestor| *ancestor != repo_path)
        {
            if inspected.contains(ancestor) {
                break;
            }
            inspected.insert(ancestor.to_path_buf());
            if ancestor.join(".git").exists()
                || (ancestor.join("HEAD").is_file()
                    && ancestor.join("objects").is_dir()
                    && ancestor.join("refs").is_dir())
            {
                return Err(AppError::GitError(format!(
                    "Nested repository at {}. Handle it separately before stashing or discarding changes.",
                    ancestor.display()
                )));
            }
        }
    }
    // `stash push` internally restores HEAD. A staged deletion/type change
    // might otherwise let that restore remove ignored data. Protect both
    // HEAD's restoration paths and the destination's checkout paths.
    let local_ref = format!("refs/heads/{}", target.local_name);
    let ignored_paths: HashSet<&Path> = ignored
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(Path::new)
        .collect();
    for tree in ["HEAD", target.remote_ref.as_deref().unwrap_or(&local_ref)] {
        let tracked = GitCli::run(repo_path, &["ls-tree", "-r", "--name-only", "-z", tree])?;
        let tracked_paths: HashSet<&Path> = tracked
            .split('\0')
            .filter(|path| !path.is_empty())
            .map(Path::new)
            .collect();
        if tracked.contains('\u{fffd}') {
            return Err(AppError::GitError(
                "Cannot safely inspect non-UTF-8 checkout paths. Move changes instead.".to_string(),
            ));
        }
        if ignored_paths.iter().any(|path| {
            path.ancestors()
                .any(|ancestor| tracked_paths.contains(ancestor))
        }) || tracked_paths.iter().any(|path| {
            path.ancestors()
                .any(|ancestor| ignored_paths.contains(ancestor))
        }) {
            return Err(AppError::GitError(
                "Ignored paths would be overwritten. Move them aside before switching; they have not been discarded.".to_string(),
            ));
        }
    }
    Ok(())
}

fn current_stash(repo_path: &Path) -> Option<String> {
    GitCli::run(repo_path, &["rev-parse", "--verify", "refs/stash"])
        .ok()
        .map(|oid| oid.trim().to_string())
}

fn checkout_failure(
    repo_path: &Path,
    error: AppError,
    backup: Option<&str>,
    original_head: &str,
    original_branch: Option<&str>,
) -> AppError {
    let Some(backup) = backup else {
        return error;
    };
    let head_unchanged = GitCli::run(repo_path, &["rev-parse", "HEAD"])
        .is_ok_and(|head| head == original_head)
        && GitCli::run(repo_path, &["symbolic-ref", "-q", "HEAD"])
            .ok()
            .as_deref()
            == original_branch;
    if head_unchanged {
        match GitCli::run(repo_path, &["-c", "submodule.recurse=false", "stash", "apply", "--index", backup]) {
            Ok(_) => return AppError::GitError(format!(
                "{error}\nYour changes were restored, including staging. Recovery snapshot {backup} was also kept in the stash list."
            )),
            Err(restore_error) => return AppError::GitError(format!(
                "{error}\nAutomatic restoration failed: {restore_error}\nYour changes remain in recovery snapshot {backup}; restore it with git stash apply --index {backup}."
            )),
        }
    }
    AppError::GitError(format!(
        "{error}\nHEAD changed before Git reported failure. Your changes remain in recovery snapshot {backup}; restore it with git stash apply --index {backup} on the original branch."
    ))
}

fn switch_branch(repo_path: &Path, target: &CheckoutTarget) -> Result<(), AppError> {
    let mut args = vec![
        "switch",
        "--no-guess",
        "--no-overwrite-ignore",
        "--no-recurse-submodules",
    ];
    if let Some(remote_ref) = target.remote_ref.as_deref() {
        args.extend([
            "--create",
            target.local_name.as_str(),
            "--track",
            remote_ref,
        ]);
    } else {
        args.push(&target.local_name);
    }
    GitCli::run(repo_path, &args)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
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
            let path = std::env::temp_dir().join(format!("giteye-branch-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create test dir");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn git(cwd: &Path, args: &[&str]) -> String {
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
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn create_source_repo(path: &Path) {
        fs::create_dir_all(path).expect("create source dir");
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
        git(path, &["config", "core.autocrlf", "false"]);
        git(path, &["config", "core.eol", "lf"]);
        fs::write(path.join("README.md"), "# source\n").expect("write source file");
        git(path, &["add", "README.md"]);
        git(path, &["commit", "-m", "Initial commit"]);
    }

    fn dirty_worktree(path: &Path) {
        fs::write(path.join("README.md"), "staged edit\n").expect("write staged edit");
        git(path, &["add", "README.md"]);
        fs::write(path.join("README.md"), "staged edit\nunstaged edit\n")
            .expect("write unstaged edit");
        fs::write(path.join("untracked.txt"), "untracked contents\n")
            .expect("write untracked file");
    }

    fn worktree_snapshot(path: &Path) -> (String, String, String, String, String) {
        (
            git(path, &["status", "--porcelain", "--untracked-files=all"]),
            git(path, &["diff", "--binary"]),
            git(path, &["diff", "--cached", "--binary"]),
            fs::read_to_string(path.join("README.md")).expect("read working copy"),
            fs::read_to_string(path.join("untracked.txt")).expect("read untracked file"),
        )
    }

    #[test]
    fn checkout_invalid_destinations_and_strategy_leave_all_changes_untouched() {
        let temp = TestDir::new("checkout-invalid");
        create_source_repo(&temp.path);
        git(&temp.path, &["tag", "release"]);
        dirty_worktree(&temp.path);
        let before = worktree_snapshot(&temp.path);
        for name in ["missing", "HEAD", "refs/tags/release", "--detach", "main~0"] {
            for strategy in ["stash", "discard"] {
                assert!(checkout_branch(&temp.path, name, strategy).is_err());
                assert_eq!(worktree_snapshot(&temp.path), before);
                assert_eq!(current_stash(&temp.path), None);
                assert_eq!(get_current_branch(&temp.path).unwrap(), "main");
            }
        }
        assert!(checkout_branch(&temp.path, "main", "unknown").is_err());
        assert_eq!(worktree_snapshot(&temp.path), before);
        checkout_branch(&temp.path, "main", "discard").expect("current branch is a no-op");
        assert_eq!(worktree_snapshot(&temp.path), before);
    }

    #[test]
    fn checkout_move_keeps_staged_unstaged_and_untracked_changes() {
        let temp = TestDir::new("checkout-move");
        create_source_repo(&temp.path);
        git(&temp.path, &["branch", "feature"]);
        dirty_worktree(&temp.path);
        let before = worktree_snapshot(&temp.path);
        checkout_branch(&temp.path, "refs/heads/feature", "move").expect("move checkout");
        assert_eq!(get_current_branch(&temp.path).unwrap(), "feature");
        assert_eq!(worktree_snapshot(&temp.path), before);
        assert_eq!(current_stash(&temp.path), None);
    }

    #[test]
    fn checkout_stash_retains_staging_and_untracked_contents() {
        let temp = TestDir::new("checkout-stash");
        create_source_repo(&temp.path);
        git(&temp.path, &["branch", "feature"]);
        dirty_worktree(&temp.path);
        let before = worktree_snapshot(&temp.path);
        checkout_branch(&temp.path, "feature", "stash").expect("stash checkout");
        assert_eq!(get_current_branch(&temp.path).unwrap(), "feature");
        assert_eq!(git(&temp.path, &["status", "--porcelain"]), "");
        git(&temp.path, &["stash", "apply", "--index"]);
        assert_eq!(worktree_snapshot(&temp.path), before);
    }

    #[test]
    fn checkout_discard_clears_changes_preserves_ignored_and_existing_stashes() {
        let temp = TestDir::new("checkout-discard");
        create_source_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "cache/\n").unwrap();
        git(&temp.path, &["add", ".gitignore"]);
        git(&temp.path, &["commit", "-m", "Ignore cache"]);
        git(&temp.path, &["branch", "feature"]);
        fs::write(temp.path.join("README.md"), "previous stash\n").unwrap();
        git(&temp.path, &["stash", "push", "-m", "keep this stash"]);
        let previous_stash = current_stash(&temp.path);
        fs::create_dir(temp.path.join("cache")).unwrap();
        fs::write(temp.path.join("cache/important.txt"), "keep me\n").unwrap();
        dirty_worktree(&temp.path);
        checkout_branch(&temp.path, "feature", "discard").expect("discard checkout");
        assert_eq!(get_current_branch(&temp.path).unwrap(), "feature");
        assert_eq!(git(&temp.path, &["status", "--porcelain"]), "");
        assert_eq!(
            fs::read_to_string(temp.path.join("README.md")).unwrap(),
            "# source\n"
        );
        assert!(!temp.path.join("untracked.txt").exists());
        assert_eq!(
            fs::read_to_string(temp.path.join("cache/important.txt")).unwrap(),
            "keep me\n"
        );
        assert_eq!(current_stash(&temp.path), previous_stash);
    }

    #[test]
    fn checkout_remote_creation_honors_each_working_copy_strategy() {
        for strategy in ["move", "stash", "discard"] {
            let temp = TestDir::new("checkout-remote");
            create_source_repo(&temp.path);
            git(&temp.path, &["remote", "add", "origin", "."]);
            git(
                &temp.path,
                &["update-ref", "refs/remotes/origin/feature/x", "HEAD"],
            );
            dirty_worktree(&temp.path);
            let before = worktree_snapshot(&temp.path);
            checkout_branch(&temp.path, "refs/remotes/origin/feature/x", strategy)
                .expect("tracking checkout");
            assert_eq!(get_current_branch(&temp.path).unwrap(), "feature/x");
            assert_eq!(
                git(&temp.path, &["rev-parse", "--abbrev-ref", "@{upstream}"]),
                "origin/feature/x"
            );
            if strategy == "move" {
                assert_eq!(worktree_snapshot(&temp.path), before);
            } else {
                assert_eq!(git(&temp.path, &["status", "--porcelain"]), "");
                if strategy == "stash" {
                    git(&temp.path, &["stash", "apply", "--index"]);
                    assert_eq!(worktree_snapshot(&temp.path), before);
                } else {
                    assert_eq!(current_stash(&temp.path), None);
                }
            }
        }
    }

    #[test]
    fn checkout_occupied_worktree_fails_before_stashing_or_discarding() {
        let temp = TestDir::new("checkout-occupied");
        let repo = temp.path.join("repo");
        let other = temp.path.join("other");
        create_source_repo(&repo);
        git(
            &repo,
            &["worktree", "add", "-b", "occupied", other.to_str().unwrap()],
        );
        dirty_worktree(&repo);
        let before = worktree_snapshot(&repo);
        for strategy in ["stash", "discard"] {
            assert!(checkout_branch(&repo, "occupied", strategy).is_err());
            assert_eq!(worktree_snapshot(&repo), before);
            assert_eq!(current_stash(&repo), None);
        }
    }

    #[test]
    fn checkout_refuses_nested_repositories_without_touching_either_worktree() {
        for bare in [false, true] {
            let temp = TestDir::new("checkout-nested");
            create_source_repo(&temp.path);
            git(&temp.path, &["branch", "feature"]);
            let nested = temp.path.join("nested");
            if bare {
                git(&temp.path, &["init", "--bare", nested.to_str().unwrap()]);
            } else {
                create_source_repo(&nested);
                fs::write(nested.join("README.md"), "nested work\n").unwrap();
            }
            dirty_worktree(&temp.path);
            let before = worktree_snapshot(&temp.path);
            assert!(checkout_branch(&temp.path, "feature", "discard").is_err());
            assert_eq!(get_current_branch(&temp.path).unwrap(), "main");
            assert_eq!(worktree_snapshot(&temp.path), before);
            assert_eq!(current_stash(&temp.path), None);
            if bare {
                assert!(nested.join("HEAD").is_file());
            } else {
                assert_eq!(
                    fs::read_to_string(nested.join("README.md")).unwrap(),
                    "nested work\n"
                );
            }
        }
    }

    #[test]
    fn checkout_refuses_dirty_submodules_even_with_recursive_git_config() {
        let temp = TestDir::new("checkout-submodule");
        let repo = temp.path.join("repo");
        let source = temp.path.join("source");
        create_source_repo(&repo);
        create_source_repo(&source);
        git(
            &repo,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                source.to_str().unwrap(),
                "child",
            ],
        );
        git(&repo, &["commit", "-m", "Add submodule"]);
        git(&repo, &["branch", "feature"]);
        git(&repo, &["config", "submodule.recurse", "true"]);
        fs::write(repo.join("child/README.md"), "submodule work\n").unwrap();
        dirty_worktree(&repo);
        let before = worktree_snapshot(&repo);
        for strategy in ["stash", "discard"] {
            assert!(checkout_branch(&repo, "feature", strategy).is_err());
            assert_eq!(worktree_snapshot(&repo), before);
            assert_eq!(
                fs::read_to_string(repo.join("child/README.md")).unwrap(),
                "submodule work\n"
            );
            assert_eq!(current_stash(&repo), None);
        }
    }

    #[test]
    fn checkout_protects_ignored_data_from_stash_internal_head_restore() {
        let temp = TestDir::new("checkout-ignored-type-change");
        create_source_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "README.md/\n").unwrap();
        git(&temp.path, &["add", ".gitignore"]);
        git(
            &temp.path,
            &["commit", "-m", "Ignore replacement directory"],
        );
        git(&temp.path, &["branch", "feature"]);
        git(&temp.path, &["rm", "README.md"]);
        fs::create_dir(temp.path.join("README.md")).unwrap();
        fs::write(temp.path.join("README.md/precious"), "ignored data\n").unwrap();
        let before = git(&temp.path, &["diff", "--cached"]);
        assert!(checkout_branch(&temp.path, "feature", "discard").is_err());
        assert_eq!(git(&temp.path, &["diff", "--cached"]), before);
        assert_eq!(
            fs::read_to_string(temp.path.join("README.md/precious")).unwrap(),
            "ignored data\n"
        );
        assert_eq!(current_stash(&temp.path), None);
    }

    #[test]
    fn checkout_protects_ignored_empty_nested_repository_obstructing_head() {
        let temp = TestDir::new("checkout-ignored-nested");
        create_source_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "README.md/\n").unwrap();
        git(&temp.path, &["add", ".gitignore"]);
        git(
            &temp.path,
            &["commit", "-m", "Ignore replacement directory"],
        );
        git(&temp.path, &["branch", "feature"]);
        git(&temp.path, &["rm", "README.md"]);
        let nested = temp.path.join("README.md");
        git(&temp.path, &["init", nested.to_str().unwrap()]);
        let nested_head = fs::read(nested.join(".git/HEAD")).unwrap();
        assert!(checkout_branch(&temp.path, "feature", "discard").is_err());
        assert_eq!(fs::read(nested.join(".git/HEAD")).unwrap(), nested_head);
        assert_eq!(current_stash(&temp.path), None);
        assert_eq!(
            git(&temp.path, &["diff", "--cached", "--name-status"]),
            "D\tREADME.md"
        );
    }

    #[test]
    fn checkout_move_conflict_preserves_all_local_work() {
        let temp = TestDir::new("checkout-move-conflict");
        create_source_repo(&temp.path);
        git(&temp.path, &["switch", "-c", "feature"]);
        fs::write(temp.path.join("README.md"), "destination contents\n").unwrap();
        git(&temp.path, &["commit", "-am", "Change destination"]);
        git(&temp.path, &["switch", "main"]);
        dirty_worktree(&temp.path);
        let before = worktree_snapshot(&temp.path);
        assert!(checkout_branch(&temp.path, "feature", "move").is_err());
        assert_eq!(get_current_branch(&temp.path).unwrap(), "main");
        assert_eq!(worktree_snapshot(&temp.path), before);
    }

    #[test]
    fn checkout_refuses_nested_repo_inside_outer_tracked_directory() {
        let temp = TestDir::new("checkout-nested-tracked");
        create_source_repo(&temp.path);
        fs::create_dir(temp.path.join("nested")).unwrap();
        fs::write(temp.path.join("nested/tracked.txt"), "outer tracked\n").unwrap();
        git(&temp.path, &["add", "nested/tracked.txt"]);
        git(&temp.path, &["commit", "-m", "Track nested file"]);
        git(&temp.path, &["branch", "feature"]);
        git(&temp.path.join("nested"), &["init"]);
        fs::write(temp.path.join("nested/tracked.txt"), "nested work\n").unwrap();
        assert!(checkout_branch(&temp.path, "feature", "discard").is_err());
        assert_eq!(
            fs::read_to_string(temp.path.join("nested/tracked.txt")).unwrap(),
            "nested work\n"
        );
        assert!(temp.path.join("nested/.git").is_dir());
        assert_eq!(current_stash(&temp.path), None);
    }

    #[cfg(unix)]
    #[test]
    fn checkout_hook_failure_keeps_recovery_snapshot_when_head_has_changed() {
        use std::os::unix::fs::PermissionsExt;

        let temp = TestDir::new("checkout-hook-failure");
        create_source_repo(&temp.path);
        git(&temp.path, &["branch", "feature"]);
        let hooks = temp.path.join(".git/hooks");
        fs::create_dir_all(&hooks).unwrap();
        let hook = hooks.join("post-checkout");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        git(
            &temp.path,
            &["config", "core.hooksPath", hooks.to_str().unwrap()],
        );
        dirty_worktree(&temp.path);
        let before = worktree_snapshot(&temp.path);
        let error = checkout_branch(&temp.path, "feature", "discard").expect_err("hook fails");
        assert_eq!(get_current_branch(&temp.path).unwrap(), "feature");
        let backup = current_stash(&temp.path).expect("recovery snapshot retained");
        assert!(error.to_string().contains(&backup));
        assert_eq!(git(&temp.path, &["status", "--porcelain"]), "");
        git(&temp.path, &["stash", "apply", "--index", &backup]);
        assert_eq!(worktree_snapshot(&temp.path), before);
    }

    #[test]
    fn merge_branch_merges_source_into_current_branch() {
        let temp = TestDir::new("merge-branch");
        create_source_repo(&temp.path);

        git(&temp.path, &["switch", "-c", "feature"]);
        fs::write(temp.path.join("feature.txt"), "feature\n").expect("write feature file");
        git(&temp.path, &["add", "feature.txt"]);
        git(&temp.path, &["commit", "-m", "Feature"]);

        git(&temp.path, &["switch", "main"]);
        fs::write(temp.path.join("main.txt"), "main\n").expect("write main file");
        git(&temp.path, &["add", "main.txt"]);
        git(&temp.path, &["commit", "-m", "Main"]);

        merge_branch(&temp.path, "feature").expect("merge feature");

        assert!(temp.path.join("feature.txt").exists());
        assert_eq!(
            git(&temp.path, &["rev-parse", "--abbrev-ref", "HEAD"]),
            "main"
        );
    }

    #[test]
    fn merge_branch_rejects_dirty_worktree() {
        let temp = TestDir::new("merge-dirty");
        create_source_repo(&temp.path);
        git(&temp.path, &["switch", "-c", "feature"]);
        fs::write(temp.path.join("feature.txt"), "feature\n").expect("write feature file");
        git(&temp.path, &["add", "feature.txt"]);
        git(&temp.path, &["commit", "-m", "Feature"]);
        git(&temp.path, &["switch", "main"]);
        fs::write(temp.path.join("dirty.txt"), "dirty\n").expect("write dirty file");

        let error = merge_branch(&temp.path, "feature").expect_err("dirty worktree rejected");

        assert!(format!("{error}").contains("Working tree must be clean"));
    }

    #[test]
    fn merge_with_options_creates_no_ff_merge_commit() {
        let temp = TestDir::new("merge-no-ff");
        create_source_repo(&temp.path);

        git(&temp.path, &["switch", "-c", "feature"]);
        fs::write(temp.path.join("feature.txt"), "feature\n").expect("write feature file");
        git(&temp.path, &["add", "feature.txt"]);
        git(&temp.path, &["commit", "-m", "Feature"]);

        git(&temp.path, &["switch", "main"]);
        merge_with_options(&temp.path, "feature", true, false, None).expect("merge feature");

        let parents = git(&temp.path, &["rev-list", "--parents", "-n", "1", "HEAD"]);
        assert_eq!(parents.split_whitespace().count(), 3);
    }

    #[test]
    fn merge_with_options_rejects_unsafe_strategy_options() {
        let error = validate_merge_strategy_option("--upload-pack=/tmp/nope")
            .expect_err("unsafe option rejected");
        assert!(format!("{error}").contains("Unsupported merge strategy option"));
        assert_eq!(validate_merge_strategy_option("theirs").unwrap(), "theirs");
    }

    #[test]
    fn fast_forward_current_branch_to_upstream() {
        let temp = TestDir::new("fast-forward");
        let seed = temp.path.join("seed");
        let remote = temp.path.join("remote.git");
        let work = temp.path.join("work");
        create_source_repo(&seed);

        git(
            &seed,
            &[
                "clone",
                "--bare",
                ".",
                remote.to_str().expect("remote path"),
            ],
        );
        git(
            &temp.path,
            &[
                "clone",
                remote.to_str().expect("remote path"),
                work.to_str().expect("work path"),
            ],
        );
        git(&work, &["config", "user.name", "GitEye Test"]);
        git(&work, &["config", "user.email", "test@giteye.local"]);

        git(
            &seed,
            &[
                "remote",
                "add",
                "origin",
                remote.to_str().expect("remote path"),
            ],
        );
        fs::write(seed.join("README.md"), "# source\nremote\n").expect("write remote change");
        git(&seed, &["add", "README.md"]);
        git(&seed, &["commit", "-m", "Remote update"]);
        git(&seed, &["push", "origin", "main"]);
        git(&work, &["fetch", "origin"]);

        let upstream = git(&work, &["rev-parse", "origin/main"]);
        assert_ne!(git(&work, &["rev-parse", "HEAD"]), upstream);

        fast_forward_branch(&work, "main", "origin/main").expect("fast-forward branch");

        assert_eq!(git(&work, &["rev-parse", "HEAD"]), upstream);
    }

    #[test]
    fn renames_branch_and_updates_upstream() {
        let temp = TestDir::new("rename-upstream");
        let seed = temp.path.join("seed");
        let remote = temp.path.join("remote.git");
        let work = temp.path.join("work");
        create_source_repo(&seed);
        git(
            &seed,
            &[
                "clone",
                "--bare",
                ".",
                remote.to_str().expect("remote path"),
            ],
        );
        git(
            &temp.path,
            &[
                "clone",
                remote.to_str().expect("remote path"),
                work.to_str().expect("work path"),
            ],
        );

        rename_branch(&work, "main", "trunk").expect("rename branch");
        set_branch_upstream(&work, "trunk", Some("origin/main")).expect("set upstream");

        assert_eq!(git(&work, &["rev-parse", "--abbrev-ref", "HEAD"]), "trunk");
        assert_eq!(
            git(&work, &["rev-parse", "--abbrev-ref", "trunk@{upstream}"]),
            "origin/main"
        );

        set_branch_upstream(&work, "trunk", None).expect("unset upstream");
        assert!(GitCli::run(&work, &["rev-parse", "--abbrev-ref", "trunk@{upstream}"]).is_err());
    }

    #[test]
    fn force_prune_deletes_an_unmerged_local_branch() {
        let temp = TestDir::new("force-prune");
        create_source_repo(&temp.path);
        git(&temp.path, &["switch", "-c", "unmerged"]);
        fs::write(temp.path.join("unmerged.txt"), "unmerged\n").expect("write branch file");
        git(&temp.path, &["add", "unmerged.txt"]);
        git(&temp.path, &["commit", "-m", "Unmerged work"]);
        git(&temp.path, &["switch", "main"]);
        let branches = vec!["unmerged".to_string()];

        let safe = prune_local_branches(&temp.path, &branches, false).expect("safe prune result");
        assert!(safe.deleted.is_empty());
        assert_eq!(safe.failed.len(), 1);
        assert!(GitCli::run(&temp.path, &["rev-parse", "unmerged"]).is_ok());

        let forced =
            prune_local_branches(&temp.path, &branches, true).expect("forced prune result");
        assert_eq!(forced.deleted, branches);
        assert!(forced.failed.is_empty());
        assert!(GitCli::run(&temp.path, &["rev-parse", "unmerged"]).is_err());
    }
}
