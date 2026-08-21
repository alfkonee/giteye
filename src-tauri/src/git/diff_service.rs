use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::DiffResult;
use std::io::Read;
use std::path::{Component, Path};
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

/// Hard cap on a single diff payload. Beyond this the diff is truncated and
/// flagged so the frontend can render a notice instead of an unbounded string.
const MAX_DIFF_BYTES: usize = 4 * 1024 * 1024;
const MAX_DIFF_STDERR_BYTES: usize = 256 * 1024;
const DIFF_TIMEOUT: Duration = Duration::from_secs(30);

struct BoundedDiff {
    text: String,
    truncated: bool,
}

#[derive(Debug)]
struct BoundedBytes {
    bytes: Vec<u8>,
    truncated: bool,
}

fn spawn_bounded_reader<R: Read + Send + 'static>(
    mut pipe: R,
    max_bytes: usize,
    limit_reached: Arc<AtomicBool>,
) -> JoinHandle<std::io::Result<BoundedBytes>> {
    thread::spawn(move || {
        let mut bytes = Vec::with_capacity(max_bytes.min(64 * 1024));
        let mut truncated = false;
        let mut chunk = [0u8; 16 * 1024];
        loop {
            let read = pipe.read(&mut chunk)?;
            if read == 0 {
                break;
            }
            let remaining = max_bytes.saturating_sub(bytes.len());
            let kept = remaining.min(read);
            bytes.extend_from_slice(&chunk[..kept]);
            if kept < read {
                truncated = true;
                limit_reached.store(true, Ordering::Release);
            }
        }
        Ok(BoundedBytes { bytes, truncated })
    })
}

fn join_bounded_reader(
    reader: JoinHandle<std::io::Result<BoundedBytes>>,
    stream: &str,
) -> Result<BoundedBytes, AppError> {
    reader
        .join()
        .map_err(|_| AppError::IoError(format!("git diff {stream} reader panicked")))?
        .map_err(|error| AppError::IoError(format!("failed to read git diff {stream}: {error}")))
}

/// Appends as much of `text` as fits without splitting a UTF-8 code point.
/// Returns whether all input bytes fit.
fn push_utf8_with_cap(output: &mut String, text: &str, max_bytes: usize) -> bool {
    let remaining = max_bytes.saturating_sub(output.len());
    if text.len() <= remaining {
        output.push_str(text);
        return true;
    }

    let mut end = remaining;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    output.push_str(&text[..end]);
    false
}

/// Converts bytes like `String::from_utf8_lossy`, but never allocates or returns
/// more than `max_bytes`. Invalid sequences become U+FFFD only while it fits.
fn bounded_lossy_utf8(bytes: &[u8], max_bytes: usize) -> (String, bool) {
    let mut output = String::with_capacity(bytes.len().min(max_bytes));
    let mut remaining = bytes;

    while !remaining.is_empty() {
        match std::str::from_utf8(remaining) {
            Ok(valid) => {
                let truncated = !push_utf8_with_cap(&mut output, valid, max_bytes);
                return (output, truncated);
            }
            Err(error) => {
                let valid_up_to = error.valid_up_to();
                let valid = std::str::from_utf8(&remaining[..valid_up_to])
                    .expect("UTF-8 error valid prefix must be UTF-8");
                if !push_utf8_with_cap(&mut output, valid, max_bytes)
                    || !push_utf8_with_cap(&mut output, "\u{FFFD}", max_bytes)
                {
                    return (output, true);
                }

                match error.error_len() {
                    Some(invalid_len) => remaining = &remaining[valid_up_to + invalid_len..],
                    None => return (output, false),
                }
            }
        }
    }

    (output, false)
}

/// Runs a git diff command with bounded, concurrently drained output.
///
/// Both pipes are capped in memory while still being drained to prevent child
/// backpressure. The parent polls a hard deadline and terminates as soon as
/// stdout crosses the payload cap, so a custom diff driver cannot run forever.
fn run_bounded_diff(
    repo_path: &Path,
    args: &[&str],
    allowed_exit_codes: &[i32],
) -> Result<BoundedDiff, AppError> {
    let mut child = GitCli::command()
        .args(args)
        .current_dir(repo_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(error.to_string())
            }
        })?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::IoError("git diff stdout unavailable".to_string()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::IoError("git diff stderr unavailable".to_string()))?;
    let stdout_limit_reached = Arc::new(AtomicBool::new(false));
    let stderr_limit_reached = Arc::new(AtomicBool::new(false));
    let stdout_reader =
        spawn_bounded_reader(stdout, MAX_DIFF_BYTES, Arc::clone(&stdout_limit_reached));
    let stderr_reader = spawn_bounded_reader(
        stderr,
        MAX_DIFF_STDERR_BYTES,
        Arc::clone(&stderr_limit_reached),
    );

    let deadline = Instant::now() + DIFF_TIMEOUT;
    let mut killed_for_stdout_limit = false;
    let mut timed_out = false;
    let status = loop {
        if stdout_limit_reached.load(Ordering::Acquire) {
            killed_for_stdout_limit = true;
            let _ = child.kill();
            break child
                .wait()
                .map_err(|error| AppError::IoError(error.to_string()))?;
        }
        if Instant::now() >= deadline {
            timed_out = true;
            let _ = child.kill();
            break child
                .wait()
                .map_err(|error| AppError::IoError(error.to_string()))?;
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(AppError::IoError(error.to_string()));
            }
        }
    };

    let stdout = join_bounded_reader(stdout_reader, "stdout")?;
    let stderr = join_bounded_reader(stderr_reader, "stderr")?;
    if timed_out {
        return Err(AppError::GitError(format!(
            "git diff timed out after {}s",
            DIFF_TIMEOUT.as_secs()
        )));
    }

    let truncated = killed_for_stdout_limit || stdout.truncated;
    let status_code = status.code().unwrap_or(-1);
    if !truncated && !allowed_exit_codes.contains(&status_code) {
        let mut stderr_text = String::from_utf8_lossy(&stderr.bytes).trim().to_string();
        if stderr.truncated || stderr_limit_reached.load(Ordering::Acquire) {
            stderr_text.push_str("\n[stderr truncated]");
        }
        return Err(AppError::GitError(stderr_text));
    }

    let (text, conversion_truncated) = bounded_lossy_utf8(&stdout.bytes, MAX_DIFF_BYTES);
    Ok(BoundedDiff {
        text,
        truncated: truncated || conversion_truncated,
    })
}

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

fn validate_repo_relative_file_path(file_path: &str) -> Result<(), AppError> {
    if file_path.is_empty() {
        return Err(AppError::InvalidPath(
            "file path cannot be empty".to_string(),
        ));
    }

    let path = Path::new(file_path);
    if path.is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "file path must be relative to the repository: {file_path}"
        )));
    }

    for component in path.components() {
        match component {
            Component::ParentDir => {
                return Err(AppError::InvalidPath(format!(
                    "file path cannot escape the repository: {file_path}"
                )));
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::InvalidPath(format!(
                    "file path must be relative to the repository: {file_path}"
                )));
            }
            Component::CurDir | Component::Normal(_) => {}
        }
    }

    Ok(())
}

fn ensure_existing_path_inside_repo(repo_path: &Path, file_path: &str) -> Result<(), AppError> {
    validate_repo_relative_file_path(file_path)?;

    let repo_root = repo_path
        .canonicalize()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    let candidate = repo_path
        .join(file_path)
        .canonicalize()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;

    if !candidate.starts_with(&repo_root) {
        return Err(AppError::InvalidPath(format!(
            "file path cannot escape the repository: {file_path}"
        )));
    }

    Ok(())
}

pub fn get_file_diff(
    repo_path: &Path,
    file_path: &str,
    staged: bool,
) -> Result<DiffResult, AppError> {
    validate_repo_relative_file_path(file_path)?;

    let (diff_text, truncated) = if staged {
        let bounded = run_bounded_diff(repo_path, &["diff", "--cached", "--", file_path], &[0])?;
        (bounded.text, bounded.truncated)
    } else {
        let tracked = run_bounded_diff(repo_path, &["diff", "--", file_path], &[0])?;
        if tracked.text.is_empty() && !tracked.truncated && is_untracked(repo_path, file_path)? {
            ensure_existing_path_inside_repo(repo_path, file_path)?;
            let bounded = run_bounded_diff(
                repo_path,
                &["diff", "--no-index", "--", "/dev/null", file_path],
                &[0, 1],
            )?;
            (bounded.text, bounded.truncated)
        } else {
            (tracked.text, tracked.truncated)
        }
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
        truncated,
    })
}

fn is_untracked(repo_path: &Path, file_path: &str) -> Result<bool, AppError> {
    let output = GitCli::command()
        .args(["ls-files", "--error-unmatch", "--", file_path])
        .current_dir(repo_path)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                AppError::GitNotFound
            } else {
                AppError::IoError(error.to_string())
            }
        })?;

    Ok(!output.status.success())
}

pub fn get_commit_diff(repo_path: &Path, hash: &str) -> Result<DiffResult, AppError> {
    let bounded = run_bounded_diff(repo_path, &["show", "--format=", hash], &[0])?;

    let is_binary = bounded.text.contains("Binary files");
    let (additions, deletions) = count_diff_stats(&bounded.text);

    Ok(DiffResult {
        file_path: hash.to_string(),
        old_file_path: None,
        diff_text: bounded.text,
        additions,
        deletions,
        is_binary,
        truncated: bounded.truncated,
    })
}

pub fn list_commit_range_files(
    repo_path: &Path,
    base_hash: &str,
    target_hash: &str,
) -> Result<Vec<String>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "diff",
            "--find-renames",
            "--name-only",
            "--no-ext-diff",
            base_hash,
            target_hash,
        ],
    )?;

    Ok(output
        .lines()
        .filter(|path| !path.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

fn old_file_path_for_range(
    repo_path: &Path,
    base_hash: &str,
    target_hash: &str,
    file_path: &str,
) -> Result<Option<String>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "diff",
            "--name-status",
            "--find-renames",
            "-z",
            "--no-ext-diff",
            base_hash,
            target_hash,
        ],
    )?;
    let mut fields = output.split('\0');

    while let Some(status) = fields.next() {
        if status.is_empty() {
            break;
        }

        let Some(old_path) = fields.next() else {
            break;
        };
        if !status.starts_with('R') {
            continue;
        }

        let Some(new_path) = fields.next() else {
            break;
        };
        if new_path == file_path {
            return Ok(Some(old_path.to_string()));
        }
    }

    Ok(None)
}

pub fn get_commit_range_diff(
    repo_path: &Path,
    base_hash: &str,
    target_hash: &str,
    file_path: &str,
) -> Result<DiffResult, AppError> {
    validate_repo_relative_file_path(file_path)?;
    let old_file_path = old_file_path_for_range(repo_path, base_hash, target_hash, file_path)?;
    let mut args = vec![
        "diff",
        "--no-ext-diff",
        "--find-renames",
        base_hash,
        target_hash,
        "--",
        file_path,
    ];
    if let Some(old_path) = old_file_path.as_deref() {
        args.push(old_path);
    }
    let bounded = run_bounded_diff(repo_path, &args, &[0])?;
    let is_binary = bounded.text.contains("Binary files");
    let (additions, deletions) = count_diff_stats(&bounded.text);

    Ok(DiffResult {
        file_path: file_path.to_string(),
        old_file_path,
        diff_text: bounded.text,
        additions,
        deletions,
        is_binary,
        truncated: bounded.truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};
    #[test]
    fn lossy_utf8_conversion_never_expands_past_diff_cap() {
        // Every invalid byte becomes the three-byte U+FFFD sequence under
        // `from_utf8_lossy`, which used to turn a 4 MiB raw buffer into a 12 MiB
        // Tauri payload.
        let bytes = vec![0xff; MAX_DIFF_BYTES];
        let (text, truncated) = bounded_lossy_utf8(&bytes, MAX_DIFF_BYTES);

        assert!(truncated, "lossy expansion must be reported as truncation");
        assert!(text.len() <= MAX_DIFF_BYTES);
        assert!(text.is_char_boundary(text.len()));
    }

    #[test]
    fn bounded_reader_drains_but_retains_only_the_limit() {
        let limit_reached = Arc::new(AtomicBool::new(false));
        let reader = spawn_bounded_reader(
            std::io::Cursor::new(vec![b'x'; 1024]),
            64,
            Arc::clone(&limit_reached),
        );
        let captured = join_bounded_reader(reader, "test").expect("bounded capture");

        assert_eq!(captured.bytes.len(), 64);
        assert!(captured.truncated);
        assert!(limit_reached.load(Ordering::Acquire));
    }

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-diff-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create test dir");
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

    #[test]
    fn unstaged_untracked_file_diff_shows_file_contents() {
        let temp = TestDir::new("untracked");
        git(&temp.path, &["init", "-b", "main"]);
        fs::write(temp.path.join("new.txt"), "hello\nworld\n").expect("write untracked file");

        let diff = get_file_diff(&temp.path, "new.txt", false).expect("untracked diff");

        assert!(diff.diff_text.contains("diff --git"));
        assert!(diff.diff_text.contains("+++ b/new.txt"));
        assert!(diff.diff_text.contains("+hello"));
        assert_eq!(diff.additions, 2);
        assert_eq!(diff.deletions, 0);
    }

    #[test]
    fn commit_range_diff_lists_and_compares_changed_files() {
        let temp = TestDir::new("commit-range");
        git(&temp.path, &["init", "-b", "main"]);
        git(&temp.path, &["config", "user.name", "GitEye Test"]);
        git(&temp.path, &["config", "user.email", "test@giteye.local"]);
        fs::write(temp.path.join("note.txt"), "before\n").expect("write initial file");
        git(&temp.path, &["add", "note.txt"]);
        git(&temp.path, &["commit", "-m", "initial"]);
        fs::write(temp.path.join("note.txt"), "after\n").expect("write updated file");
        fs::write(temp.path.join("new.txt"), "new file\n").expect("write added file");
        git(&temp.path, &["add", "note.txt", "new.txt"]);
        git(&temp.path, &["commit", "-m", "update"]);

        let files =
            list_commit_range_files(&temp.path, "HEAD~1", "HEAD").expect("list changed files");
        let diff = get_commit_range_diff(&temp.path, "HEAD~1", "HEAD", "note.txt")
            .expect("compare selected file");

        assert_eq!(files, ["new.txt", "note.txt"]);
        assert_eq!(diff.file_path, "note.txt");
        assert!(diff.diff_text.contains("-before"));
        assert!(diff.diff_text.contains("+after"));
        assert!(!diff.diff_text.contains("new file"));
        assert_eq!(diff.additions, 1);
        assert_eq!(diff.deletions, 1);
    }

    #[test]
    fn commit_range_diff_reports_renamed_file_path() {
        let temp = TestDir::new("commit-range-rename");
        git(&temp.path, &["init", "-b", "main"]);
        git(&temp.path, &["config", "user.name", "GitEye Test"]);
        git(&temp.path, &["config", "user.email", "test@giteye.local"]);
        fs::write(temp.path.join("old-name.txt"), "unchanged\n").expect("write initial file");
        git(&temp.path, &["add", "old-name.txt"]);
        git(&temp.path, &["commit", "-m", "initial"]);
        git(&temp.path, &["mv", "old-name.txt", "new-name.txt"]);
        git(&temp.path, &["commit", "-m", "rename"]);

        let diff = get_commit_range_diff(&temp.path, "HEAD~1", "HEAD", "new-name.txt")
            .expect("compare renamed file");

        assert_eq!(diff.file_path, "new-name.txt");
        assert_eq!(diff.old_file_path.as_deref(), Some("old-name.txt"));
        assert!(diff.diff_text.contains("rename from old-name.txt"));
    }

    #[test]
    fn file_diff_rejects_absolute_paths() {
        let temp = TestDir::new("absolute-path");
        let repo = temp.path.join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        git(&repo, &["init", "-b", "main"]);

        let outside = temp.path.join("outside.txt");
        fs::write(&outside, "secret\n").expect("write outside file");

        let error = get_file_diff(&repo, outside.to_str().expect("utf-8 outside path"), false)
            .expect_err("absolute path rejected");

        assert!(matches!(error, AppError::InvalidPath(_)));
    }

    #[test]
    fn file_diff_rejects_parent_traversal_paths() {
        let temp = TestDir::new("parent-traversal");
        let repo = temp.path.join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        git(&repo, &["init", "-b", "main"]);
        fs::write(temp.path.join("outside.txt"), "secret\n").expect("write outside file");

        let error =
            get_file_diff(&repo, "../outside.txt", false).expect_err("parent traversal rejected");

        assert!(matches!(error, AppError::InvalidPath(_)));
    }

    #[cfg(unix)]
    #[test]
    fn file_diff_rejects_untracked_symlink_escape() {
        let temp = TestDir::new("symlink-escape");
        let repo = temp.path.join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        git(&repo, &["init", "-b", "main"]);

        let outside = temp.path.join("outside.txt");
        fs::write(&outside, "secret\n").expect("write outside file");
        std::os::unix::fs::symlink(&outside, repo.join("outside-link.txt"))
            .expect("create symlink");

        let error =
            get_file_diff(&repo, "outside-link.txt", false).expect_err("symlink escape rejected");

        assert!(matches!(error, AppError::InvalidPath(_)));
    }

    #[test]
    fn oversized_untracked_diff_is_truncated_and_bounded() {
        let temp = TestDir::new("oversized");
        git(&temp.path, &["init", "-b", "main"]);
        // One line longer than the cap guarantees the unified diff exceeds it.
        fs::write(temp.path.join("big.txt"), "x".repeat(MAX_DIFF_BYTES + 1024))
            .expect("write oversized file");

        let diff = get_file_diff(&temp.path, "big.txt", false).expect("oversized diff");

        assert!(diff.truncated, "oversized diff must be flagged truncated");
        assert!(
            diff.diff_text.len() <= MAX_DIFF_BYTES,
            "diff payload must be bounded to MAX_DIFF_BYTES ({} <= {})",
            diff.diff_text.len(),
            MAX_DIFF_BYTES
        );
    }

    #[test]
    fn small_diff_is_not_truncated() {
        let temp = TestDir::new("small");
        git(&temp.path, &["init", "-b", "main"]);
        fs::write(temp.path.join("small.txt"), "hello\nworld\n").expect("write small file");

        let diff = get_file_diff(&temp.path, "small.txt", false).expect("small diff");

        assert!(!diff.truncated, "small diff must not be truncated");
        assert!(diff.diff_text.contains("+hello"));
    }

    #[test]
    fn binary_file_diff_reports_binary() {
        let temp = TestDir::new("binary");
        git(&temp.path, &["init", "-b", "main"]);
        git(&temp.path, &["config", "user.name", "GitEye Test"]);
        git(&temp.path, &["config", "user.email", "test@giteye.local"]);
        fs::write(temp.path.join("image.bin"), [0u8, 1, 2, 0, 255]).expect("write binary file");
        git(&temp.path, &["add", "image.bin"]);
        git(&temp.path, &["commit", "-m", "add binary"]);
        fs::write(temp.path.join("image.bin"), [0u8, 9, 0, 254, 0]).expect("rewrite binary file");

        let diff = get_file_diff(&temp.path, "image.bin", false).expect("binary diff");

        assert!(diff.is_binary, "binary file diff must report is_binary");
    }
}
