use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::Branch;
use std::path::Path;

pub fn list_branches(repo_path: &Path) -> Result<Vec<Branch>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "branch",
            "--all",
            "--format=%(refname)|%(refname:short)|%(upstream:short)|%(upstream:track)|%(HEAD)",
        ],
    )?;

    let branches: Vec<Branch> = output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
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

            Some(Branch {
                name: ref_name.to_string(),
                short_name: short_ref.to_string(),
                is_current,
                is_remote,
                upstream,
                ahead,
                behind,
            })
        })
        .collect();

    Ok(branches)
}

pub fn get_current_branch(repo_path: &Path) -> Result<String, AppError> {
    GitCli::run(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())
}

pub fn checkout_branch(repo_path: &Path, name: &str, strategy: &str) -> Result<(), AppError> {
    if strategy == "stash" && has_worktree_changes(repo_path)? {
        let message = format!("GitEye: before switching to {name}");
        GitCli::run(
            repo_path,
            &["stash", "push", "--include-untracked", "-m", &message],
        )?;
    }

    switch_branch(repo_path, name)?;
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

pub fn merge_branch(repo_path: &Path, source: &str) -> Result<(), AppError> {
    merge_with_options(repo_path, source, false, false, None)
}

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

pub fn delete_branch(repo_path: &Path, name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["branch", "-d", name])?;
    Ok(())
}

fn required_git_arg<'a>(value: &'a str, label: &str) -> Result<&'a str, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::GitError(format!("{label} is required")));
    }
    if value.starts_with('-') {
        return Err(AppError::GitError(format!(
            "{label} must not start with '-'"
        )));
    }
    Ok(value)
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

fn has_worktree_changes(repo_path: &Path) -> Result<bool, AppError> {
    GitCli::run(repo_path, &["status", "--porcelain"]).map(|status| !status.trim().is_empty())
}

fn switch_branch(repo_path: &Path, name: &str) -> Result<(), AppError> {
    if remote_branch_exists(repo_path, name) {
        let local_name = name
            .split_once('/')
            .map(|(_, branch_name)| branch_name)
            .unwrap_or(name);

        if local_branch_exists(repo_path, local_name) {
            GitCli::run(repo_path, &["switch", local_name])?;
        } else {
            GitCli::run(repo_path, &["switch", "--track", name])?;
        }
    } else {
        GitCli::run(repo_path, &["switch", name])?;
    }

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
        fs::write(path.join("README.md"), "# source\n").expect("write source file");
        git(path, &["add", "README.md"]);
        git(path, &["commit", "-m", "Initial commit"]);
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
}
