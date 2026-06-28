use crate::errors::AppError;
use crate::git::cli::{required_git_arg, GitCli};
use crate::models::rebase::{
    ConflictContent, ConflictFile, GitOperationSummary, OperationConflict, RebasePreviewItem,
    RebaseState, RebaseTodoItem, RerereStatus,
};
use std::fs;
use std::path::{Component, Path, PathBuf};

struct RebasePaths {
    dir: PathBuf,
    display_dir: String,
}

pub fn get_rebase_state(repo_path: &Path) -> Result<RebaseState, AppError> {
    let rebase_paths = find_rebase_dir(repo_path)?;

    let Some(rebase_paths) = rebase_paths else {
        return Ok(RebaseState {
            in_progress: false,
            rebase_dir: None,
            head_name: None,
            onto: None,
            orig_head: None,
            current_step: None,
            total_steps: None,
            todo: Vec::new(),
            done: Vec::new(),
            conflicts: Vec::new(),
        });
    };

    Ok(RebaseState {
        in_progress: true,
        rebase_dir: Some(rebase_paths.display_dir),
        head_name: read_optional_file(&rebase_paths.dir.join("head-name"))?,
        onto: read_optional_file(&rebase_paths.dir.join("onto"))?,
        orig_head: read_optional_file(&rebase_paths.dir.join("orig-head"))?,
        current_step: read_first_optional_u32(&rebase_paths.dir, &["msgnum", "next"])?,
        total_steps: read_first_optional_u32(&rebase_paths.dir, &["end", "last"])?,
        todo: parse_todo_file(&rebase_paths.dir.join("git-rebase-todo"), false)?,
        done: parse_todo_file(&rebase_paths.dir.join("done"), true)?,
        conflicts: get_conflicted_files(repo_path)?,
    })
}

pub fn get_conflict_content(
    repo_path: &Path,
    file_path: &str,
) -> Result<ConflictContent, AppError> {
    validate_repo_relative_path(file_path)?;

    Ok(ConflictContent {
        file_path: file_path.to_string(),
        base: read_index_stage(repo_path, 1, file_path)?,
        ours: read_index_stage(repo_path, 2, file_path)?,
        theirs: read_index_stage(repo_path, 3, file_path)?,
        result: read_worktree_file(repo_path, file_path)?,
    })
}

pub fn mark_file_resolved(repo_path: &Path, file_path: &str) -> Result<(), AppError> {
    validate_repo_relative_path(file_path)?;
    GitCli::run(repo_path, &["add", "--", file_path])?;
    Ok(())
}

pub fn checkout_conflict_side(
    repo_path: &Path,
    file_path: &str,
    side: &str,
) -> Result<(), AppError> {
    validate_repo_relative_path(file_path)?;
    let checkout_flag = match side {
        "ours" => "--ours",
        "theirs" => "--theirs",
        _ => {
            return Err(AppError::GitError(format!(
                "Unsupported conflict side: {side}"
            )));
        }
    };

    GitCli::run(repo_path, &["checkout", checkout_flag, "--", file_path])?;
    GitCli::run(repo_path, &["add", "--", file_path])?;
    Ok(())
}

pub fn update_rebase_todo(repo_path: &Path, items: Vec<RebaseTodoItem>) -> Result<(), AppError> {
    let rebase_paths = find_rebase_dir(repo_path)?.ok_or_else(|| {
        AppError::GitError("No rebase in progress; git-rebase-todo is unavailable".to_string())
    })?;

    let mut todo = String::new();
    for item in items {
        append_todo_item(&mut todo, &item)?;
    }

    fs::write(rebase_paths.dir.join("git-rebase-todo"), todo)
        .map_err(|e| AppError::IoError(e.to_string()))
}

pub fn preview_rebase(
    repo_path: &Path,
    upstream: &str,
    onto: Option<&str>,
    branch: Option<&str>,
) -> Result<Vec<RebasePreviewItem>, AppError> {
    let upstream = required_git_arg(upstream, "rebase upstream")?;
    verify_commit(repo_path, upstream)?;

    if let Some(onto) = onto.map(str::trim).filter(|value| !value.is_empty()) {
        verify_commit(repo_path, required_git_arg(onto, "rebase onto target")?)?;
    }

    let branch = match branch.map(str::trim).filter(|value| !value.is_empty()) {
        Some(branch) => required_git_arg(branch, "rebase branch")?,
        None => "HEAD",
    };
    verify_commit(repo_path, branch)?;

    let range = format!("{upstream}..{branch}");
    let output = GitCli::run(
        repo_path,
        &[
            "log",
            "--reverse",
            "--no-merges",
            "--format=%H%x00%s",
            &range,
        ],
    )?;

    Ok(output
        .lines()
        .filter_map(parse_rebase_preview_line)
        .collect())
}

pub fn get_rerere_config(repo_path: &Path) -> Result<bool, AppError> {
    get_rerere_enabled(repo_path)
}

pub fn get_rerere_status(repo_path: &Path) -> Result<RerereStatus, AppError> {
    let paths = GitCli::run(repo_path, &["rerere", "status"])?
        .lines()
        .filter_map(|line| {
            let path = line.trim();
            (!path.is_empty()).then(|| path.to_string())
        })
        .collect();

    Ok(RerereStatus {
        enabled: get_rerere_enabled(repo_path)?,
        paths,
    })
}

pub fn set_rerere_enabled(repo_path: &Path, enabled: bool) -> Result<RerereStatus, AppError> {
    GitCli::run(
        repo_path,
        &[
            "config",
            "--local",
            "rerere.enabled",
            if enabled { "true" } else { "false" },
        ],
    )?;
    get_rerere_status(repo_path)
}

pub fn get_operation_summary(repo_path: &Path) -> Result<GitOperationSummary, AppError> {
    let rebase = get_rebase_state(repo_path)?;
    let merge_head = read_git_state_file(repo_path, "MERGE_HEAD")?;
    let cherry_pick_head = read_git_state_file(repo_path, "CHERRY_PICK_HEAD")?;
    let revert_head = read_git_state_file(repo_path, "REVERT_HEAD")?;
    let conflicts = get_operation_conflicts(repo_path)?;

    let in_rebase = rebase.in_progress;
    let in_merge = merge_head.is_some();
    let in_cherry_pick = cherry_pick_head.is_some();
    let in_revert = revert_head.is_some();
    let operation = if in_rebase {
        Some("rebase".to_string())
    } else if in_merge {
        Some("merge".to_string())
    } else if in_cherry_pick {
        Some("cherryPick".to_string())
    } else if in_revert {
        Some("revert".to_string())
    } else if !conflicts.is_empty() {
        Some("conflict".to_string())
    } else {
        None
    };

    Ok(GitOperationSummary {
        operation,
        in_rebase,
        in_merge,
        in_cherry_pick,
        in_revert,
        rebase,
        merge_head,
        cherry_pick_head,
        revert_head,
        conflicts,
    })
}

fn get_rerere_enabled(repo_path: &Path) -> Result<bool, AppError> {
    let (status, output) = GitCli::run_allowing_statuses(
        repo_path,
        &["config", "--bool", "--get", "rerere.enabled"],
        &[1],
    )?;
    if status == 1 {
        return Ok(false);
    }

    Ok(matches!(output.trim(), "true" | "yes" | "on" | "1"))
}

fn verify_commit(repo_path: &Path, rev: &str) -> Result<(), AppError> {
    let commit_rev = format!("{rev}^{{commit}}");
    GitCli::run(repo_path, &["rev-parse", "--verify", &commit_rev])?;
    Ok(())
}

fn parse_rebase_preview_line(line: &str) -> Option<RebasePreviewItem> {
    let (commit, message) = line.split_once('\0')?;
    Some(RebasePreviewItem {
        action: "pick".to_string(),
        commit: commit.to_string(),
        message: message.to_string(),
    })
}

fn read_git_state_file(repo_path: &Path, name: &str) -> Result<Option<String>, AppError> {
    let path_output = GitCli::run(repo_path, &["rev-parse", "--git-path", name])?;
    let path = path_from_git_output(repo_path, path_output.trim());
    read_optional_file(&path)
}

fn get_operation_conflicts(repo_path: &Path) -> Result<Vec<OperationConflict>, AppError> {
    let output = GitCli::run(repo_path, &["status", "--porcelain=v2", "-z"])?;
    Ok(output
        .split('\0')
        .filter_map(parse_operation_conflict_entry)
        .collect())
}

fn parse_operation_conflict_entry(entry: &str) -> Option<OperationConflict> {
    if !entry.starts_with("u ") {
        return None;
    }

    let parts: Vec<&str> = entry.splitn(11, ' ').collect();
    if parts.len() < 11 {
        return None;
    }

    let status = parts[1].to_string();
    Some(OperationConflict {
        path: parts[10].to_string(),
        conflict_type: conflict_type_for_status(&status).to_string(),
        status,
    })
}

fn conflict_type_for_status(status: &str) -> &'static str {
    match status {
        "DD" => "bothDeleted",
        "AU" => "addedByUs",
        "UD" => "deletedByThem",
        "UA" => "addedByThem",
        "DU" => "deletedByUs",
        "AA" => "bothAdded",
        "UU" => "bothModified",
        _ => "unmerged",
    }
}

fn find_rebase_dir(repo_path: &Path) -> Result<Option<RebasePaths>, AppError> {
    let git_dir_output = GitCli::run(repo_path, &["rev-parse", "--git-dir"])?;
    let git_dir_text = git_dir_output.trim();
    if git_dir_text.is_empty() {
        return Ok(None);
    }

    let git_dir = path_from_git_output(repo_path, git_dir_text);
    for name in ["rebase-merge", "rebase-apply"] {
        let candidate = git_dir.join(name);
        if candidate.is_dir() {
            return Ok(Some(RebasePaths {
                display_dir: candidate.to_string_lossy().to_string(),
                dir: candidate,
            }));
        }
    }

    Ok(None)
}

fn path_from_git_output(repo_path: &Path, path_text: &str) -> PathBuf {
    let path = Path::new(path_text);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        repo_path.join(path)
    }
}

fn read_optional_file(path: &Path) -> Result<Option<String>, AppError> {
    match fs::read_to_string(path) {
        Ok(value) => {
            let trimmed = value
                .trim_end_matches(|c| c == '\r' || c == '\n')
                .to_string();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::IoError(e.to_string())),
    }
}

fn read_optional_u32(path: &Path) -> Result<Option<u32>, AppError> {
    let Some(value) = read_optional_file(path)? else {
        return Ok(None);
    };

    Ok(value.trim().parse::<u32>().ok())
}

fn read_first_optional_u32(dir: &Path, names: &[&str]) -> Result<Option<u32>, AppError> {
    for name in names {
        if let Some(value) = read_optional_u32(&dir.join(name))? {
            return Ok(Some(value));
        }
    }

    Ok(None)
}

fn parse_todo_file(path: &Path, completed: bool) -> Result<Vec<RebaseTodoItem>, AppError> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(AppError::IoError(e.to_string())),
    };

    Ok(content
        .lines()
        .filter_map(|line| parse_todo_line(line, completed))
        .collect())
}

fn parse_todo_line(line: &str, completed: bool) -> Option<RebaseTodoItem> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }

    let action_end = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
    let action = &trimmed[..action_end];
    let after_action = trimmed[action_end..].trim_start();
    let commit_end = after_action
        .find(char::is_whitespace)
        .unwrap_or(after_action.len());
    let commit = &after_action[..commit_end];
    let message = after_action[commit_end..].trim_start();

    Some(RebaseTodoItem {
        action: action.to_string(),
        commit: commit.to_string(),
        message: message.to_string(),
        raw: line.to_string(),
        completed,
    })
}

fn get_conflicted_files(repo_path: &Path) -> Result<Vec<ConflictFile>, AppError> {
    let output = GitCli::run(repo_path, &["diff", "--name-only", "--diff-filter=U", "-z"])?;
    Ok(output
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(|path| ConflictFile {
            path: path.to_string(),
        })
        .collect())
}

fn read_index_stage(repo_path: &Path, stage: u8, file_path: &str) -> Result<String, AppError> {
    let revision = format!(":{}:{}", stage, file_path);
    match GitCli::run(repo_path, &["show", revision.as_str()]) {
        Ok(content) => Ok(content),
        Err(AppError::GitError(_)) => Ok(String::new()),
        Err(e) => Err(e),
    }
}

fn read_worktree_file(repo_path: &Path, file_path: &str) -> Result<String, AppError> {
    let root_output = GitCli::run(repo_path, &["rev-parse", "--show-toplevel"])?;
    let root = path_from_git_output(repo_path, root_output.trim());
    let path = root.join(file_path);

    match fs::read(path) {
        Ok(content) => Ok(String::from_utf8_lossy(&content).to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(AppError::IoError(e.to_string())),
    }
}

fn validate_repo_relative_path(file_path: &str) -> Result<(), AppError> {
    let path = Path::new(file_path);
    if file_path.is_empty()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(AppError::InvalidPath(file_path.to_string()));
    }

    Ok(())
}

fn append_todo_item(todo: &mut String, item: &RebaseTodoItem) -> Result<(), AppError> {
    validate_todo_field(&item.action)?;
    validate_todo_field(&item.commit)?;

    let action = item.action.trim();
    let commit = item.commit.trim();
    if action.is_empty() {
        return Err(AppError::SerializationError(
            "Rebase todo items require an action".to_string(),
        ));
    }

    todo.push_str(action);
    if !commit.is_empty() {
        todo.push(' ');
        todo.push_str(commit);
    }

    let message = item.message.replace(|c| c == '\r' || c == '\n', " ");
    if !message.is_empty() {
        todo.push(' ');
        todo.push_str(&message);
    }

    todo.push('\n');
    Ok(())
}

fn validate_todo_field(value: &str) -> Result<(), AppError> {
    if value.contains(|c| c == '\r' || c == '\n') {
        Err(AppError::SerializationError(
            "Rebase todo fields cannot contain newlines".to_string(),
        ))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        append_todo_item, checkout_conflict_side, get_rerere_config, get_rerere_status,
        parse_operation_conflict_entry, parse_todo_line, preview_rebase, required_git_arg,
        set_rerere_enabled, validate_repo_relative_path, GitCli,
    };
    use crate::models::rebase::RebaseTodoItem;
    use std::fs;
    use std::path::{Path, PathBuf};
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
            let path = std::env::temp_dir().join(format!("giteye-rebase-{name}-{nonce}"));
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
        GitCli::run(cwd, args).expect("run git").trim().to_string()
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
        git(path, &["rev-parse", "HEAD"])
    }

    #[test]
    fn parses_rebase_todo_lines() {
        let item = parse_todo_line("pick abc123 Add checkout validation", false).unwrap();
        assert_eq!(item.action, "pick");
        assert_eq!(item.commit, "abc123");
        assert_eq!(item.message, "Add checkout validation");
        assert!(!item.completed);

        assert!(parse_todo_line("# pick ignored comment", false).is_none());
        assert!(parse_todo_line("", false).is_none());
    }

    #[test]
    fn serializes_safe_rebase_todo_items() {
        let mut output = String::new();

        append_todo_item(
            &mut output,
            &RebaseTodoItem {
                action: "squash".to_string(),
                commit: "def456".to_string(),
                message: "Combine fixes".to_string(),
                raw: String::new(),
                completed: false,
            },
        )
        .unwrap();

        assert_eq!(output, "squash def456 Combine fixes\n");
    }

    #[test]
    fn rejects_unknown_conflict_side() {
        let err =
            checkout_conflict_side(std::path::Path::new("."), "src/app.rs", "both").unwrap_err();
        assert!(err.to_string().contains("Unsupported conflict side"));
    }

    #[test]
    fn rejects_unsafe_conflict_paths() {
        assert!(validate_repo_relative_path("src/app.rs").is_ok());
        assert!(validate_repo_relative_path("../outside").is_err());
        assert!(validate_repo_relative_path("/absolute").is_err());
        assert!(validate_repo_relative_path("").is_err());
    }

    #[test]
    fn parses_operation_conflict_status_map() {
        let entry = "u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc file.txt";
        let conflict = parse_operation_conflict_entry(entry).expect("parse conflict");

        assert_eq!(conflict.path, "file.txt");
        assert_eq!(conflict.status, "UU");
        assert_eq!(conflict.conflict_type, "bothModified");
        assert!(
            parse_operation_conflict_entry("1 .M N... 100644 100644 100644 abc abc file.txt")
                .is_none()
        );
    }

    #[test]
    fn preview_rebase_lists_commits_to_replay_without_mutating() {
        let temp = TestDir::new("preview");
        init_repo(&temp.path);
        let base = commit_file(&temp.path, "README.md", "base\n", "Base");
        git(&temp.path, &["switch", "-c", "feature"]);
        let first = commit_file(&temp.path, "one.txt", "one\n", "Feature one");
        let second = commit_file(&temp.path, "two.txt", "two\n", "Feature two");
        git(&temp.path, &["switch", "main"]);

        let preview =
            preview_rebase(&temp.path, "main", Some(&base), Some("feature")).expect("preview");

        assert_eq!(preview.len(), 2);
        assert_eq!(preview[0].action, "pick");
        assert_eq!(preview[0].commit, first);
        assert_eq!(preview[0].message, "Feature one");
        assert_eq!(preview[1].commit, second);
        assert_eq!(preview[1].message, "Feature two");
        assert_eq!(git(&temp.path, &["branch", "--show-current"]), "main");
    }

    #[test]
    fn rejects_unsafe_rebase_refs() {
        assert_eq!(
            required_git_arg("origin/main", "upstream").unwrap(),
            "origin/main"
        );
        assert!(required_git_arg("--exec=rm", "upstream").is_err());
        assert!(required_git_arg("  ", "upstream").is_err());
    }

    #[test]
    fn reads_and_sets_rerere_config() {
        let temp = TestDir::new("rerere-config");
        GitCli::run(&temp.path, &["init", "-b", "main"]).expect("init repo");

        assert!(!get_rerere_config(&temp.path).expect("read default rerere config"));

        set_rerere_enabled(&temp.path, true).expect("enable rerere");
        assert!(get_rerere_config(&temp.path).expect("read enabled rerere config"));

        let status = get_rerere_status(&temp.path).expect("read rerere status");
        assert!(status.enabled);
        assert!(status.paths.is_empty());

        set_rerere_enabled(&temp.path, false).expect("disable rerere");
        assert!(!get_rerere_config(&temp.path).expect("read disabled rerere config"));
    }
}
