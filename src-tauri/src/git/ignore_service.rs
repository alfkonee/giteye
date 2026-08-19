use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::{IgnoreRuleRequest, IgnoreRuleResult, IgnoreScope};
use std::fs;
use std::path::{Path, PathBuf};

/// Appends ignore patterns to the repository `.gitignore` or to `.git/info/exclude`.
///
/// Patterns already present in the target file are reported as skipped instead of
/// being written twice.
pub fn add_ignore_rules(
    repo_path: &Path,
    request: &IgnoreRuleRequest,
) -> Result<IgnoreRuleResult, AppError> {
    let patterns = normalize_patterns(&request.patterns)?;
    let target = ignore_file_path(repo_path, request.scope)?;

    let existing = match fs::read_to_string(&target) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(AppError::IoError(error.to_string())),
    };

    let mut known: Vec<String> = existing
        .lines()
        .map(|line| line.trim_end_matches('\r').to_string())
        .filter(|line| !line.trim().is_empty())
        .collect();

    let mut added = Vec::new();
    let mut skipped = Vec::new();
    for pattern in patterns {
        if known.iter().any(|line| line == &pattern) {
            skipped.push(pattern);
        } else {
            known.push(pattern.clone());
            added.push(pattern);
        }
    }

    let display = display_path(repo_path, &target);
    if added.is_empty() {
        return Ok(IgnoreRuleResult {
            file: display,
            added,
            skipped,
        });
    }

    let newline = if existing.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut content = existing;
    if !content.is_empty() && !content.ends_with('\n') {
        content.push_str(newline);
    }
    for pattern in &added {
        content.push_str(pattern);
        content.push_str(newline);
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| AppError::IoError(error.to_string()))?;
    }
    fs::write(&target, content).map_err(|error| AppError::IoError(error.to_string()))?;

    Ok(IgnoreRuleResult {
        file: display,
        added,
        skipped,
    })
}

fn normalize_patterns(patterns: &[String]) -> Result<Vec<String>, AppError> {
    let mut normalized = Vec::new();
    for pattern in patterns {
        // Only strip line terminators: trailing spaces can be meaningful when escaped.
        let pattern = pattern.trim_matches(|c| c == '\n' || c == '\r');
        if pattern.trim().is_empty() {
            return Err(AppError::GitError(
                "Ignore pattern cannot be empty".to_string(),
            ));
        }
        if pattern.contains('\n') || pattern.contains('\r') {
            return Err(AppError::GitError(
                "Ignore pattern cannot span multiple lines".to_string(),
            ));
        }
        normalized.push(pattern.to_string());
    }

    if normalized.is_empty() {
        return Err(AppError::GitError(
            "At least one ignore pattern is required".to_string(),
        ));
    }

    Ok(normalized)
}

fn ignore_file_path(repo_path: &Path, scope: IgnoreScope) -> Result<PathBuf, AppError> {
    match scope {
        IgnoreScope::Repository => Ok(repository_root(repo_path)?.join(".gitignore")),
        // Worktrees and submodules keep their real Git directory elsewhere, so ask Git for it.
        IgnoreScope::Local => {
            let git_dir = GitCli::run(repo_path, &["rev-parse", "--absolute-git-dir"])?;
            let git_dir = git_dir.trim();
            if git_dir.is_empty() {
                return Err(AppError::RepositoryNotFound(
                    repo_path.to_string_lossy().to_string(),
                ));
            }
            Ok(Path::new(git_dir).join("info").join("exclude"))
        }
    }
}

fn repository_root(repo_path: &Path) -> Result<PathBuf, AppError> {
    let toplevel = GitCli::run(repo_path, &["rev-parse", "--show-toplevel"])?;
    let toplevel = toplevel.trim();
    if toplevel.is_empty() {
        return Err(AppError::RepositoryNotFound(
            repo_path.to_string_lossy().to_string(),
        ));
    }
    Ok(PathBuf::from(toplevel))
}

fn display_path(repo_path: &Path, target: &Path) -> String {
    let root = repository_root(repo_path).unwrap_or_else(|_| repo_path.to_path_buf());
    target
        .strip_prefix(&root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
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
            let path = std::env::temp_dir().join(format!("giteye-ignore-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create temp dir");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn init_repo(path: &Path) {
        let output = Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(path)
            .output()
            .expect("run git init");
        assert!(output.status.success(), "git init failed");
    }

    fn request(patterns: &[&str], scope: IgnoreScope) -> IgnoreRuleRequest {
        IgnoreRuleRequest {
            patterns: patterns.iter().map(|p| p.to_string()).collect(),
            scope,
        }
    }

    #[test]
    fn appends_patterns_to_repository_gitignore() {
        let temp = TestDir::new("append");
        init_repo(&temp.path);

        let result = add_ignore_rules(
            &temp.path,
            &request(&["/build/", "*.log"], IgnoreScope::Repository),
        )
        .expect("add ignore rules");

        assert_eq!(result.file, ".gitignore");
        assert_eq!(result.added, vec!["/build/", "*.log"]);
        assert!(result.skipped.is_empty());
        assert_eq!(
            fs::read_to_string(temp.path.join(".gitignore")).expect("read gitignore"),
            "/build/\n*.log\n"
        );
    }

    #[test]
    fn separates_appended_patterns_from_unterminated_last_line() {
        let temp = TestDir::new("no-trailing-newline");
        init_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "node_modules/").expect("seed gitignore");

        add_ignore_rules(&temp.path, &request(&["*.log"], IgnoreScope::Repository))
            .expect("add ignore rules");

        assert_eq!(
            fs::read_to_string(temp.path.join(".gitignore")).expect("read gitignore"),
            "node_modules/\n*.log\n"
        );
    }

    #[test]
    fn skips_patterns_already_present() {
        let temp = TestDir::new("dedupe");
        init_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "*.log\n").expect("seed gitignore");

        let result = add_ignore_rules(
            &temp.path,
            &request(&["*.log", "/dist/", "/dist/"], IgnoreScope::Repository),
        )
        .expect("add ignore rules");

        assert_eq!(result.added, vec!["/dist/"]);
        assert_eq!(result.skipped, vec!["*.log", "/dist/"]);
        assert_eq!(
            fs::read_to_string(temp.path.join(".gitignore")).expect("read gitignore"),
            "*.log\n/dist/\n"
        );
    }

    #[test]
    fn writes_local_patterns_to_info_exclude() {
        let temp = TestDir::new("local");
        init_repo(&temp.path);

        let result = add_ignore_rules(&temp.path, &request(&["/scratch/"], IgnoreScope::Local))
            .expect("add ignore rules");

        assert_eq!(result.file, ".git/info/exclude");
        assert!(fs::read_to_string(temp.path.join(".git/info/exclude"))
            .expect("read exclude")
            .contains("/scratch/"));
        assert!(!temp.path.join(".gitignore").exists());
    }

    #[test]
    fn ignored_path_is_reported_by_git() {
        let temp = TestDir::new("effective");
        init_repo(&temp.path);
        fs::create_dir_all(temp.path.join("build")).expect("create dir");
        fs::write(temp.path.join("build/out.bin"), "binary").expect("write file");

        add_ignore_rules(&temp.path, &request(&["/build/"], IgnoreScope::Repository))
            .expect("add ignore rules");

        let (status, _) = GitCli::run_allowing_statuses(
            &temp.path,
            &["check-ignore", "-q", "--", "build/out.bin"],
            &[0, 1],
        )
        .expect("run check-ignore");
        assert_eq!(status, 0, "pattern should make the path ignored");
    }

    #[test]
    fn preserves_crlf_line_endings() {
        let temp = TestDir::new("crlf");
        init_repo(&temp.path);
        fs::write(temp.path.join(".gitignore"), "node_modules/\r\n").expect("seed gitignore");

        add_ignore_rules(&temp.path, &request(&["*.log"], IgnoreScope::Repository))
            .expect("add ignore rules");

        assert_eq!(
            fs::read_to_string(temp.path.join(".gitignore")).expect("read gitignore"),
            "node_modules/\r\n*.log\r\n"
        );
    }

    #[test]
    fn rejects_blank_and_multiline_patterns() {
        let temp = TestDir::new("invalid");
        init_repo(&temp.path);

        assert!(add_ignore_rules(&temp.path, &request(&["   "], IgnoreScope::Repository)).is_err());
        assert!(
            add_ignore_rules(&temp.path, &request(&["a\nb"], IgnoreScope::Repository)).is_err()
        );
        assert!(add_ignore_rules(&temp.path, &request(&[], IgnoreScope::Repository)).is_err());
        assert!(!temp.path.join(".gitignore").exists());
    }
}
