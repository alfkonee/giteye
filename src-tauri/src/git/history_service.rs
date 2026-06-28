use crate::errors::AppError;
use crate::git::cli::{required_git_arg, GitCli};
use crate::models::{
    AmendPreview, CommitSummary, ReflogEntry, ResetMode, ResetPreview, ResetPreviewFile,
};
use std::path::Path;

pub fn cherry_pick_commit(repo_path: &Path, commit_hash: &str) -> Result<(), AppError> {
    let commit_hash = required_git_arg(commit_hash, "commit hash")?;
    ensure_clean_worktree(repo_path, "cherry-picking")?;
    GitCli::run(repo_path, &["cherry-pick", commit_hash])?;
    Ok(())
}

pub fn revert_commit(repo_path: &Path, commit_hash: &str) -> Result<(), AppError> {
    let commit_hash = required_git_arg(commit_hash, "commit hash")?;
    ensure_clean_worktree(repo_path, "reverting")?;
    GitCli::run(repo_path, &["revert", "--no-edit", commit_hash])?;
    Ok(())
}

pub fn preview_reset_to_commit(
    repo_path: &Path,
    commit_hash: &str,
) -> Result<ResetPreview, AppError> {
    let commit_hash = required_git_arg(commit_hash, "commit hash")?;
    let target_commit = get_commit_summary(repo_path, commit_hash)?;
    let changed_files = get_changed_files_between(repo_path, "HEAD", commit_hash)?;

    Ok(ResetPreview {
        target_commit,
        changed_files,
    })
}

pub fn reset_to_commit(
    repo_path: &Path,
    commit_hash: &str,
    mode: ResetMode,
    confirm_discard_changes: bool,
) -> Result<(), AppError> {
    let commit_hash = required_git_arg(commit_hash, "commit hash")?;
    verify_commit(repo_path, commit_hash)?;

    if matches!(mode, ResetMode::Hard) && !confirm_discard_changes {
        return Err(AppError::GitError(
            "Hard reset requires explicit discard confirmation".to_string(),
        ));
    }

    GitCli::run(repo_path, &["reset", mode.as_git_flag(), commit_hash])?;
    Ok(())
}

pub fn preview_amend(repo_path: &Path, message: Option<&str>) -> Result<AmendPreview, AppError> {
    let head = get_commit_summary(repo_path, "HEAD")?;
    let effective_message = match message.map(str::trim).filter(|message| !message.is_empty()) {
        Some(message) => message.to_string(),
        None => get_head_commit_message(repo_path)?,
    };
    let staged_files = get_staged_files(repo_path)?;

    Ok(AmendPreview {
        head,
        message: effective_message,
        staged_files,
    })
}

pub fn amend_commit(repo_path: &Path, message: Option<&str>) -> Result<(), AppError> {
    GitCli::run(repo_path, &["rev-parse", "--verify", "HEAD"])?;

    match message.map(str::trim).filter(|message| !message.is_empty()) {
        Some(message) => {
            GitCli::run(repo_path, &["commit", "--amend", "-m", message])?;
        }
        None => {
            GitCli::run(repo_path, &["commit", "--amend", "--no-edit"])?;
        }
    }

    Ok(())
}

pub fn list_reflog_entries(
    repo_path: &Path,
    limit: Option<u32>,
) -> Result<Vec<ReflogEntry>, AppError> {
    if GitCli::run(repo_path, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }

    let limit_str = limit.unwrap_or(50).to_string();
    let output = GitCli::run(
        repo_path,
        &[
            "reflog",
            "show",
            "--format=%H%x00%h%x00%gd%x00%gs%x00%an%x00%cI",
            "--max-count",
            &limit_str,
        ],
    )?;

    Ok(output
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(parse_reflog_entry)
        .collect())
}

pub fn checkout_reflog_entry(repo_path: &Path, selector: &str) -> Result<(), AppError> {
    let selector = required_git_arg(selector, "reflog selector")?;
    let commit = resolve_commit(repo_path, selector)?;
    ensure_clean_worktree(repo_path, "checking out a reflog entry")?;
    GitCli::run(repo_path, &["switch", "--detach", &commit])?;
    Ok(())
}

pub fn create_branch_from_reflog_entry(
    repo_path: &Path,
    branch_name: &str,
    selector: &str,
    checkout: bool,
) -> Result<(), AppError> {
    let branch_name = required_git_arg(branch_name, "branch name")?;
    let selector = required_git_arg(selector, "reflog selector")?;
    validate_branch_name(repo_path, branch_name)?;
    let commit = resolve_commit(repo_path, selector)?;
    if checkout {
        ensure_clean_worktree(repo_path, "checking out recovered branch")?;
    }

    GitCli::run(repo_path, &["branch", branch_name, &commit])?;
    if checkout {
        GitCli::run(repo_path, &["switch", branch_name])?;
    }
    Ok(())
}

fn get_commit_summary(repo_path: &Path, commit_hash: &str) -> Result<CommitSummary, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "show",
            "-s",
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D%x00%P",
            commit_hash,
        ],
    )?;

    let line = output.trim_end_matches('\n');
    let parts: Vec<&str> = line.split('\0').collect();
    if parts.len() < 8 {
        return Err(AppError::CommitNotFound(commit_hash.to_string()));
    }

    Ok(CommitSummary {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        message: parts[2].to_string(),
        author_name: parts[3].to_string(),
        author_email: parts[4].to_string(),
        timestamp: parts[5].to_string(),
        refs: parse_refs(parts[6]),
        parents: parts[7]
            .split_whitespace()
            .map(|parent| parent.to_string())
            .collect(),
    })
}

fn get_head_commit_message(repo_path: &Path) -> Result<String, AppError> {
    let message = GitCli::run(repo_path, &["log", "-1", "--format=%B", "HEAD"])?;
    Ok(message.trim_end_matches('\n').to_string())
}

fn get_changed_files_between(
    repo_path: &Path,
    base: &str,
    target: &str,
) -> Result<Vec<ResetPreviewFile>, AppError> {
    let output = GitCli::run(repo_path, &["diff", "--name-status", base, target])?;
    Ok(output.lines().filter_map(parse_name_status_line).collect())
}

fn get_staged_files(repo_path: &Path) -> Result<Vec<ResetPreviewFile>, AppError> {
    let output = GitCli::run(repo_path, &["diff", "--cached", "--name-status", "HEAD"])?;
    Ok(output.lines().filter_map(parse_name_status_line).collect())
}

fn parse_name_status_line(line: &str) -> Option<ResetPreviewFile> {
    let mut parts = line.split('\t');
    let status = parts.next()?.to_string();
    let path = parts.next_back()?.to_string();
    Some(ResetPreviewFile { status, path })
}

fn parse_refs(refs: &str) -> Vec<String> {
    refs.split(',')
        .map(str::trim)
        .filter(|reference| !reference.is_empty() && !reference.starts_with("tag: "))
        .map(|reference| reference.to_string())
        .collect()
}

fn parse_reflog_entry(line: &str) -> Option<ReflogEntry> {
    let parts: Vec<&str> = line.split('\0').collect();
    if parts.len() < 6 {
        return None;
    }

    Some(ReflogEntry {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        selector: parts[2].to_string(),
        message: parts[3].to_string(),
        author_name: parts[4].to_string(),
        timestamp: parts[5].to_string(),
    })
}

fn verify_commit(repo_path: &Path, rev: &str) -> Result<(), AppError> {
    resolve_commit(repo_path, rev).map(|_| ())
}

fn resolve_commit(repo_path: &Path, rev: &str) -> Result<String, AppError> {
    let rev = required_git_arg(rev, "revision")?;
    let commit_rev = format!("{rev}^{{commit}}");
    let output = GitCli::run(repo_path, &["rev-parse", "--verify", &commit_rev])?;
    Ok(output.trim().to_string())
}

fn validate_branch_name(repo_path: &Path, branch_name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["check-ref-format", "--branch", branch_name])?;
    Ok(())
}

fn ensure_clean_worktree(repo_path: &Path, operation: &str) -> Result<(), AppError> {
    let status = GitCli::run(repo_path, &["status", "--porcelain"])?;
    if status.trim().is_empty() {
        Ok(())
    } else {
        Err(AppError::GitError(format!(
            "Working tree must be clean before {operation}"
        )))
    }
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
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-history-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create temp dir");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn git(cwd: &Path, args: &[&str]) {
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
    }

    fn git_output(cwd: &Path, args: &[&str]) -> String {
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

    fn init_repo(path: &Path) {
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
    }

    fn commit_file(path: &Path, file: &str, contents: &str, message: &str) -> String {
        fs::write(path.join(file), contents).expect("write file");
        git(path, &["add", file]);
        git(path, &["commit", "-m", message]);
        git_output(path, &["rev-parse", "HEAD"])
    }

    #[test]
    fn reset_preview_summarizes_target_and_changed_files() {
        let temp = TestDir::new("preview");
        init_repo(&temp.path);
        let first = commit_file(&temp.path, "README.md", "one\n", "First");
        commit_file(&temp.path, "README.md", "two\n", "Second");

        let preview = preview_reset_to_commit(&temp.path, &first).expect("preview");

        assert_eq!(preview.target_commit.message, "First");
        assert_eq!(preview.changed_files.len(), 1);
        assert_eq!(preview.changed_files[0].path, "README.md");
    }

    #[test]
    fn hard_reset_requires_explicit_confirmation() {
        let temp = TestDir::new("hard-reset-confirm");
        init_repo(&temp.path);
        let first = commit_file(&temp.path, "README.md", "one\n", "First");
        commit_file(&temp.path, "README.md", "two\n", "Second");

        let error =
            reset_to_commit(&temp.path, &first, ResetMode::Hard, false).expect_err("confirm");

        assert!(error.to_string().contains("explicit discard confirmation"));
    }

    #[test]
    fn reset_modes_apply_expected_index_and_worktree_state() {
        let soft = TestDir::new("reset-soft");
        init_repo(&soft.path);
        let soft_first = commit_file(&soft.path, "README.md", "one\n", "First");
        commit_file(&soft.path, "README.md", "two\n", "Second");
        reset_to_commit(&soft.path, &soft_first, ResetMode::Soft, false).expect("soft reset");
        assert_eq!(git_output(&soft.path, &["rev-parse", "HEAD"]), soft_first);
        assert_eq!(
            git_output(&soft.path, &["diff", "--cached", "--name-only"]),
            "README.md"
        );
        assert_eq!(git_output(&soft.path, &["diff", "--name-only"]), "");

        let mixed = TestDir::new("reset-mixed");
        init_repo(&mixed.path);
        let mixed_first = commit_file(&mixed.path, "README.md", "one\n", "First");
        commit_file(&mixed.path, "README.md", "two\n", "Second");
        reset_to_commit(&mixed.path, &mixed_first, ResetMode::Mixed, false).expect("mixed reset");
        assert_eq!(git_output(&mixed.path, &["rev-parse", "HEAD"]), mixed_first);
        assert_eq!(
            git_output(&mixed.path, &["diff", "--cached", "--name-only"]),
            ""
        );
        assert_eq!(
            git_output(&mixed.path, &["diff", "--name-only"]),
            "README.md"
        );

        let hard = TestDir::new("reset-hard");
        init_repo(&hard.path);
        let hard_first = commit_file(&hard.path, "README.md", "one\n", "First");
        commit_file(&hard.path, "README.md", "two\n", "Second");
        reset_to_commit(&hard.path, &hard_first, ResetMode::Hard, true).expect("hard reset");
        assert_eq!(git_output(&hard.path, &["rev-parse", "HEAD"]), hard_first);
        assert_eq!(
            fs::read_to_string(hard.path.join("README.md")).expect("read hard"),
            "one\n"
        );
        assert_eq!(git_output(&hard.path, &["status", "--porcelain"]), "");
    }

    #[test]
    fn preview_amend_reports_head_message_and_staged_files_without_mutating() {
        let temp = TestDir::new("preview-amend");
        init_repo(&temp.path);
        let initial = commit_file(&temp.path, "README.md", "one\n", "Initial");
        fs::write(temp.path.join("README.md"), "amended\n").expect("write amended");
        fs::write(temp.path.join("added.txt"), "added\n").expect("write added");
        fs::write(temp.path.join("unstaged.txt"), "unstaged\n").expect("write unstaged");
        git(&temp.path, &["add", "README.md", "added.txt"]);

        let preview = preview_amend(&temp.path, Some("Amended message")).expect("preview amend");

        assert_eq!(preview.head.hash, initial);
        assert_eq!(preview.head.message, "Initial");
        assert_eq!(preview.message, "Amended message");
        assert!(preview
            .staged_files
            .iter()
            .any(|file| file.status == "M" && file.path == "README.md"));
        assert!(preview
            .staged_files
            .iter()
            .any(|file| file.status == "A" && file.path == "added.txt"));
        assert!(preview
            .staged_files
            .iter()
            .all(|file| file.path != "unstaged.txt"));
        assert_eq!(git_output(&temp.path, &["rev-parse", "HEAD"]), initial);
        assert_eq!(
            git_output(&temp.path, &["log", "-1", "--format=%s"]),
            "Initial"
        );
    }

    #[test]
    fn amend_commit_uses_staged_changes_and_message() {
        let temp = TestDir::new("amend");
        init_repo(&temp.path);
        commit_file(&temp.path, "README.md", "one\n", "Initial");
        fs::write(temp.path.join("README.md"), "amended\n").expect("write amended");
        git(&temp.path, &["add", "README.md"]);

        amend_commit(&temp.path, Some("Amended message")).expect("amend");

        assert_eq!(
            git_output(&temp.path, &["log", "-1", "--format=%s"]),
            "Amended message"
        );
        assert_eq!(
            fs::read_to_string(temp.path.join("README.md")).expect("read"),
            "amended\n"
        );
    }

    #[test]
    fn cherry_pick_commit_applies_commit_on_clean_worktree() {
        let temp = TestDir::new("cherry-pick");
        init_repo(&temp.path);
        commit_file(&temp.path, "README.md", "base\n", "Base");
        git(&temp.path, &["switch", "-c", "feature"]);
        let feature_commit = commit_file(&temp.path, "feature.txt", "feature\n", "Feature");
        git(&temp.path, &["switch", "main"]);

        cherry_pick_commit(&temp.path, &feature_commit).expect("cherry-pick");

        assert_eq!(
            fs::read_to_string(temp.path.join("feature.txt")).expect("read feature"),
            "feature\n"
        );
        assert_eq!(
            git_output(&temp.path, &["log", "-1", "--format=%s"]),
            "Feature"
        );
    }

    #[test]
    fn revert_commit_creates_inverse_commit() {
        let temp = TestDir::new("revert");
        init_repo(&temp.path);
        commit_file(&temp.path, "README.md", "base\n", "Base");
        let feature_commit = commit_file(&temp.path, "feature.txt", "feature\n", "Feature");

        revert_commit(&temp.path, &feature_commit).expect("revert");

        assert!(!temp.path.join("feature.txt").exists());
        assert_eq!(
            git_output(&temp.path, &["log", "-1", "--format=%s"]),
            "Revert \"Feature\""
        );
    }

    #[test]
    fn reflog_entries_can_create_recovery_branch() {
        let temp = TestDir::new("reflog-branch");
        init_repo(&temp.path);
        commit_file(&temp.path, "README.md", "one\n", "First");
        let second = commit_file(&temp.path, "README.md", "two\n", "Second");
        git(&temp.path, &["reset", "--hard", "HEAD~1"]);

        let entries = list_reflog_entries(&temp.path, Some(5)).expect("reflog");
        assert!(entries.iter().any(|entry| entry.hash == second));
        let second_entry = entries
            .iter()
            .find(|entry| entry.hash == second)
            .expect("second reflog entry");

        create_branch_from_reflog_entry(
            &temp.path,
            "recover-second",
            &second_entry.selector,
            false,
        )
        .expect("recover branch");

        assert_eq!(
            git_output(&temp.path, &["rev-parse", "recover-second"]),
            second
        );
    }

    #[test]
    fn checkout_reflog_entry_detaches_at_resolved_commit() {
        let temp = TestDir::new("reflog-checkout");
        init_repo(&temp.path);
        commit_file(&temp.path, "README.md", "one\n", "First");
        let second = commit_file(&temp.path, "README.md", "two\n", "Second");
        git(&temp.path, &["reset", "--hard", "HEAD~1"]);
        let entries = list_reflog_entries(&temp.path, Some(5)).expect("reflog");
        let second_entry = entries
            .iter()
            .find(|entry| entry.hash == second)
            .expect("second reflog entry");

        checkout_reflog_entry(&temp.path, &second_entry.selector).expect("checkout reflog");

        assert_eq!(git_output(&temp.path, &["rev-parse", "HEAD"]), second);
        assert_eq!(git_output(&temp.path, &["branch", "--show-current"]), "");
    }
}
