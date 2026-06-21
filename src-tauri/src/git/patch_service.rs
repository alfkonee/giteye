use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::{PatchApplyOperation, PatchApplyRequest};
use std::path::Path;

pub fn apply_patch(repo_path: &Path, request: PatchApplyRequest) -> Result<(), AppError> {
    match request.operation {
        PatchApplyOperation::Stage => {
            stage_hunk(repo_path, &request.file_path, &request.hunk_patch)
        }
        PatchApplyOperation::Unstage => {
            unstage_hunk(repo_path, &request.file_path, &request.hunk_patch)
        }
        PatchApplyOperation::Discard => discard_hunk(
            repo_path,
            &request.file_path,
            request.staged.unwrap_or(false),
            &request.hunk_patch,
        ),
    }
}

pub fn stage_hunk(repo_path: &Path, file_path: &str, hunk_patch: &str) -> Result<(), AppError> {
    apply_checked(
        repo_path,
        file_path,
        hunk_patch,
        &["apply", "--cached", "--recount"],
    )
}

pub fn unstage_hunk(repo_path: &Path, file_path: &str, hunk_patch: &str) -> Result<(), AppError> {
    apply_checked(
        repo_path,
        file_path,
        hunk_patch,
        &["apply", "--cached", "--reverse", "--recount"],
    )
}

pub fn discard_hunk(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
    hunk_patch: &str,
) -> Result<(), AppError> {
    if staged {
        apply_checked(
            repo_path,
            file_path,
            hunk_patch,
            &["apply", "--reverse", "--index", "--recount"],
        )
    } else {
        apply_checked(
            repo_path,
            file_path,
            hunk_patch,
            &["apply", "--reverse", "--recount"],
        )
    }
}

pub fn discard_file(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
    untracked: bool,
) -> Result<(), AppError> {
    if untracked {
        GitCli::run(repo_path, &["clean", "-f", "--", file_path])?;
        return Ok(());
    }

    if staged {
        GitCli::run(
            repo_path,
            &[
                "restore",
                "--staged",
                "--worktree",
                "--source=HEAD",
                "--",
                file_path,
            ],
        )?;
    } else {
        GitCli::run(repo_path, &["restore", "--worktree", "--", file_path])?;
    }

    Ok(())
}

fn apply_checked(
    repo_path: &Path,
    file_path: &str,
    hunk_patch: &str,
    apply_args: &[&str],
) -> Result<(), AppError> {
    validate_patch_targets_file(file_path, hunk_patch)?;

    let mut check_args = apply_args.to_vec();
    check_args.push("--check");
    GitCli::run_with_input(repo_path, &check_args, hunk_patch)?;
    GitCli::run_with_input(repo_path, apply_args, hunk_patch)?;
    Ok(())
}

fn validate_patch_targets_file(file_path: &str, hunk_patch: &str) -> Result<(), AppError> {
    if hunk_patch.trim().is_empty() {
        return Err(AppError::GitError("Patch text is empty".to_string()));
    }

    let mut allowed_paths = vec![file_path.to_string()];
    for line in hunk_patch.lines() {
        if let Some((old_path, new_path)) = diff_git_paths(line) {
            if new_path == file_path && !allowed_paths.contains(&old_path) {
                allowed_paths.push(old_path);
            }
        }
    }

    let mut saw_file_header = false;
    for line in hunk_patch.lines() {
        let candidate = if let Some(rest) = line.strip_prefix("--- ") {
            patch_path_from_header(rest)
        } else if let Some(rest) = line.strip_prefix("+++ ") {
            patch_path_from_header(rest)
        } else {
            None
        };

        let Some(path) = candidate else {
            continue;
        };

        saw_file_header = true;
        if !allowed_paths.contains(&path) {
            return Err(AppError::GitError(format!(
                "Patch targets '{path}' but command was for '{file_path}'"
            )));
        }
    }

    if !saw_file_header {
        return Err(AppError::GitError(
            "Patch text must include file headers".to_string(),
        ));
    }

    Ok(())
}

fn diff_git_paths(line: &str) -> Option<(String, String)> {
    let rest = line.strip_prefix("diff --git ")?;
    let (old_raw, rest) = next_diff_path(rest)?;
    let (new_raw, _) = next_diff_path(rest.trim_start())?;
    let old_path = strip_diff_prefix(&old_raw).to_string();
    let new_path = strip_diff_prefix(&new_raw).to_string();
    Some((old_path, new_path))
}

fn next_diff_path(input: &str) -> Option<(String, &str)> {
    let trimmed = input.trim_start();
    if trimmed.starts_with('"') {
        let mut value = String::new();
        let mut chars = trimmed.char_indices();
        chars.next()?;
        while let Some((idx, ch)) = chars.next() {
            match ch {
                '"' => return Some((value, &trimmed[idx + 1..])),
                '\\' => {
                    let (_, escaped) = chars.next()?;
                    match escaped {
                        'n' => value.push('\n'),
                        't' => value.push('\t'),
                        'r' => value.push('\r'),
                        '"' => value.push('"'),
                        '\\' => value.push('\\'),
                        other => value.push(other),
                    }
                }
                other => value.push(other),
            }
        }
        return None;
    }

    let end = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
    Some((trimmed[..end].to_string(), &trimmed[end..]))
}

fn patch_path_from_header(rest: &str) -> Option<String> {
    let trimmed = rest.trim_start();
    if trimmed.starts_with("/dev/null") {
        return None;
    }

    let raw_path = if trimmed.starts_with('"') {
        quoted_path_token(trimmed)?
    } else {
        trimmed.split_whitespace().next()?.to_string()
    };

    Some(strip_diff_prefix(&raw_path).to_string())
}

fn quoted_path_token(input: &str) -> Option<String> {
    let mut value = String::new();
    let mut chars = input.chars();
    if chars.next()? != '"' {
        return None;
    }

    while let Some(ch) = chars.next() {
        match ch {
            '"' => return Some(value),
            '\\' => {
                let escaped = chars.next()?;
                match escaped {
                    'n' => value.push('\n'),
                    't' => value.push('\t'),
                    'r' => value.push('\r'),
                    '"' => value.push('"'),
                    '\\' => value.push('\\'),
                    other => value.push(other),
                }
            }
            other => value.push(other),
        }
    }

    None
}

fn strip_diff_prefix(path: &str) -> &str {
    path.strip_prefix("a/")
        .or_else(|| path.strip_prefix("b/"))
        .unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn validates_patch_file_headers() {
        let patch = "diff --git a/src/main.rs b/src/main.rs\n--- a/src/main.rs\n+++ b/src/main.rs\n@@ -1 +1 @@\n-old\n+new\n";

        assert!(validate_patch_targets_file("src/main.rs", patch).is_ok());
    }

    #[test]
    fn validates_rename_patch_against_new_path() {
        let patch = "diff --git a/src/old.rs b/src/new.rs\nsimilarity index 70%\nrename from src/old.rs\nrename to src/new.rs\n--- a/src/old.rs\n+++ b/src/new.rs\n@@ -1 +1 @@\n-old\n+new\n";

        assert!(validate_patch_targets_file("src/new.rs", patch).is_ok());
    }

    #[test]
    fn validates_quoted_rename_patch_against_new_path() {
        let patch = "diff --git \"a/src/old name.rs\" \"b/src/new name.rs\"\nrename from src/old name.rs\nrename to src/new name.rs\n--- \"a/src/old name.rs\"\n+++ \"b/src/new name.rs\"\n@@ -1 +1 @@\n-old\n+new\n";

        assert!(validate_patch_targets_file("src/new name.rs", patch).is_ok());
    }

    #[test]
    fn rejects_patch_for_different_file() {
        let patch = "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1 +1 @@\n-old\n+new\n";

        let error = validate_patch_targets_file("src/main.rs", patch).unwrap_err();

        assert!(error.to_string().contains("src/lib.rs"));
    }

    #[test]
    fn applies_stage_unstage_and_discard_hunks() {
        let repo = TestRepo::new();
        repo.write("file.txt", "one\ntwo\nthree\n");
        repo.git(&["init"]);
        repo.git(&["config", "user.email", "test@example.com"]);
        repo.git(&["config", "user.name", "Test User"]);
        repo.git(&["add", "file.txt"]);
        repo.git(&["commit", "-m", "initial"]);

        repo.write("file.txt", "one\nTWO\nthree\n");
        let unstaged_patch = repo.git_output(&["diff", "--", "file.txt"]);
        stage_hunk(&repo.path, "file.txt", &unstaged_patch).unwrap();
        assert!(repo.git_output(&["diff", "--", "file.txt"]).is_empty());
        assert!(repo
            .git_output(&["diff", "--cached", "--", "file.txt"])
            .contains("+TWO"));

        let staged_patch = repo.git_output(&["diff", "--cached", "--", "file.txt"]);
        unstage_hunk(&repo.path, "file.txt", &staged_patch).unwrap();
        assert!(repo
            .git_output(&["diff", "--cached", "--", "file.txt"])
            .is_empty());
        assert!(repo
            .git_output(&["diff", "--", "file.txt"])
            .contains("+TWO"));

        let unstaged_patch = repo.git_output(&["diff", "--", "file.txt"]);
        discard_hunk(&repo.path, "file.txt", false, &unstaged_patch).unwrap();
        assert_eq!(repo.read("file.txt"), "one\ntwo\nthree\n");
        assert!(repo.git_output(&["status", "--porcelain"]).is_empty());

        repo.write("file.txt", "one\nTWO\nthree\n");
        repo.git(&["add", "file.txt"]);
        let staged_patch = repo.git_output(&["diff", "--cached", "--", "file.txt"]);
        discard_hunk(&repo.path, "file.txt", true, &staged_patch).unwrap();
        assert_eq!(repo.read("file.txt"), "one\ntwo\nthree\n");
        assert!(repo.git_output(&["status", "--porcelain"]).is_empty());
    }

    struct TestRepo {
        path: PathBuf,
    }

    impl TestRepo {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-patch-service-{nonce}"));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn write(&self, relative: &str, contents: &str) {
            fs::write(self.path.join(relative), contents).unwrap();
        }

        fn read(&self, relative: &str) -> String {
            fs::read_to_string(self.path.join(relative)).unwrap()
        }

        fn git(&self, args: &[&str]) {
            let output = Command::new("git")
                .args(args)
                .current_dir(&self.path)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&output.stderr)
            );
        }

        fn git_output(&self, args: &[&str]) -> String {
            let output = Command::new("git")
                .args(args)
                .current_dir(&self.path)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8_lossy(&output.stdout).to_string()
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
