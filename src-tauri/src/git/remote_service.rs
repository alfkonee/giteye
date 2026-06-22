use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::Remote;
use std::collections::HashMap;
use std::path::Path;

pub fn list_remotes(repo_path: &Path) -> Result<Vec<Remote>, AppError> {
    let output = GitCli::run(repo_path, &["remote", "-v"])?;

    let mut remotes_map: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        let name = parts[0].to_string();
        let url = parts[1].to_string();
        let kind = parts.get(2).copied().unwrap_or("");

        let entry = remotes_map.entry(name.clone()).or_insert((None, None));
        match kind {
            "(fetch)" => entry.0 = Some(url),
            "(push)" => entry.1 = Some(url),
            _ => {}
        }
    }

    let remotes: Vec<Remote> = remotes_map
        .into_iter()
        .map(|(name, (fetch_url, push_url))| Remote {
            name: name.clone(),
            url: fetch_url.clone().unwrap_or_default(),
            fetch_url,
            push_url,
        })
        .collect();

    Ok(remotes)
}

pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<(), AppError> {
    let name = required_git_arg(name, "remote name")?;
    let url = required_git_arg(url, "remote URL")?;
    GitCli::run(repo_path, &["remote", "add", name, url])?;
    Ok(())
}

pub fn update_remote(
    repo_path: &Path,
    name: &str,
    fetch_url: &str,
    push_url: Option<&str>,
) -> Result<(), AppError> {
    let name = required_git_arg(name, "remote name")?;
    let fetch_url = required_git_arg(fetch_url, "remote fetch URL")?;
    GitCli::run(repo_path, &["remote", "set-url", name, fetch_url])?;

    match push_url.map(str::trim) {
        Some(push_url) if !push_url.is_empty() => {
            if push_url.starts_with('-') {
                return Err(AppError::GitError(
                    "remote push URL must not start with '-'".to_string(),
                ));
            }
            GitCli::run(repo_path, &["remote", "set-url", "--push", name, push_url])?;
        }
        _ => clear_remote_push_url(repo_path, name)?,
    }

    Ok(())
}

pub fn delete_remote(repo_path: &Path, name: &str) -> Result<(), AppError> {
    let name = required_git_arg(name, "remote name")?;
    GitCli::run(repo_path, &["remote", "remove", name])?;
    Ok(())
}

pub fn prune_remote(repo_path: &Path, name: &str) -> Result<(), AppError> {
    let name = required_git_arg(name, "remote name")?;
    GitCli::run(repo_path, &["remote", "prune", name])?;
    Ok(())
}

pub fn prune_remote_dry_run(repo_path: &Path, name: &str) -> Result<Vec<String>, AppError> {
    let name = required_git_arg(name, "remote name")?;
    let output = GitCli::run(repo_path, &["remote", "prune", "--dry-run", name])?;
    let lines = non_empty_lines(&output);
    if lines.is_empty() {
        Ok(vec![format!(
            "No stale remote-tracking branches found for {name}"
        )])
    } else {
        Ok(lines)
    }
}

pub fn push_branch(
    repo_path: &Path,
    remote: &str,
    local_branch: &str,
    remote_branch: Option<&str>,
    set_upstream: bool,
    force_with_lease: bool,
) -> Result<(), AppError> {
    let args = push_branch_args(
        repo_path,
        remote,
        local_branch,
        remote_branch,
        set_upstream,
        force_with_lease,
        false,
    )?;
    run_git(repo_path, &args)?;
    Ok(())
}

pub fn push_branch_dry_run(
    repo_path: &Path,
    remote: &str,
    local_branch: &str,
    remote_branch: Option<&str>,
    set_upstream: bool,
    force_with_lease: bool,
) -> Result<Vec<String>, AppError> {
    let args = push_branch_args(
        repo_path,
        remote,
        local_branch,
        remote_branch,
        set_upstream,
        force_with_lease,
        true,
    )?;
    let output = run_git(repo_path, &args)?;
    let lines = non_empty_lines(&output);
    if lines.is_empty() {
        Ok(vec![format!(
            "No remote updates would be pushed to {remote}"
        )])
    } else {
        Ok(lines)
    }
}

pub fn delete_remote_branch(repo_path: &Path, remote: &str, branch: &str) -> Result<(), AppError> {
    let args = delete_remote_branch_args(repo_path, remote, branch, false)?;
    run_git(repo_path, &args)?;
    Ok(())
}

pub fn delete_remote_branch_dry_run(
    repo_path: &Path,
    remote: &str,
    branch: &str,
) -> Result<Vec<String>, AppError> {
    let args = delete_remote_branch_args(repo_path, remote, branch, true)?;
    let output = run_git(repo_path, &args)?;
    let lines = non_empty_lines(&output);
    if lines.is_empty() {
        Ok(vec![format!(
            "Remote branch {remote}/{branch} would not change"
        )])
    } else {
        Ok(lines)
    }
}

fn push_branch_args(
    repo_path: &Path,
    remote: &str,
    local_branch: &str,
    remote_branch: Option<&str>,
    set_upstream: bool,
    force_with_lease: bool,
    dry_run: bool,
) -> Result<Vec<String>, AppError> {
    let remote = required_git_arg(remote, "remote name")?;
    let local_branch = required_ref_name(local_branch, "local branch name")?;
    let remote_branch = match remote_branch
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => required_ref_name(value, "remote branch name")?,
        None => local_branch,
    };
    validate_ref(repo_path, "local branch name", "refs/heads", local_branch)?;
    validate_ref(repo_path, "remote branch name", "refs/heads", remote_branch)?;

    let refspec = format!("{local_branch}:{remote_branch}");
    let mut args = vec!["push".to_string()];
    if dry_run {
        args.push("--dry-run".to_string());
        args.push("--porcelain".to_string());
    }
    if set_upstream {
        args.push("--set-upstream".to_string());
    }
    if force_with_lease {
        args.push("--force-with-lease".to_string());
    }
    args.push(remote.to_string());
    args.push(refspec);
    Ok(args)
}

fn delete_remote_branch_args(
    repo_path: &Path,
    remote: &str,
    branch: &str,
    dry_run: bool,
) -> Result<Vec<String>, AppError> {
    let remote = required_git_arg(remote, "remote name")?;
    let branch = required_ref_name(branch, "remote branch name")?;
    validate_ref(repo_path, "remote branch name", "refs/heads", branch)?;

    let mut args = vec!["push".to_string()];
    if dry_run {
        args.push("--dry-run".to_string());
        args.push("--porcelain".to_string());
    }
    args.push(remote.to_string());
    args.push("--delete".to_string());
    args.push(branch.to_string());
    Ok(args)
}

fn clear_remote_push_url(repo_path: &Path, name: &str) -> Result<(), AppError> {
    let key = format!("remote.{name}.pushurl");
    if GitCli::run(repo_path, &["config", "--get-all", &key]).is_ok() {
        GitCli::run(repo_path, &["config", "--unset-all", &key])?;
    }
    Ok(())
}

fn validate_ref(
    repo_path: &Path,
    label: &str,
    namespace: &str,
    name: &str,
) -> Result<(), AppError> {
    let ref_name = format!("{namespace}/{name}");
    GitCli::run(repo_path, &["check-ref-format", &ref_name])
        .map_err(|_| AppError::GitError(format!("{label} is not a valid Git ref name: {name}")))?;
    Ok(())
}

fn required_ref_name<'a>(value: &'a str, label: &str) -> Result<&'a str, AppError> {
    let value = required_git_arg(value, label)?;
    if value.contains(' ') {
        return Err(AppError::GitError(format!(
            "{label} must not contain spaces"
        )));
    }
    Ok(value)
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

fn run_git(repo_path: &Path, args: &[String]) -> Result<String, AppError> {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    GitCli::run(repo_path, &refs)
}

fn non_empty_lines(output: &str) -> Vec<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
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
            let path = std::env::temp_dir().join(format!("giteye-remote-{name}-{nonce}"));
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
        git(path, &["commit", "--allow-empty", "-m", "Initial commit"]);
    }

    #[test]
    fn manages_remote_urls_and_clears_explicit_push_url() {
        let temp = TestDir::new("urls");
        let source = temp.path.join("source");
        let remote = temp.path.join("origin.git");
        let work = temp.path.join("work");
        let backup = temp.path.join("backup.git");
        create_source_repo(&source);
        git(
            &source,
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
        git(
            &source,
            &[
                "clone",
                "--bare",
                ".",
                backup.to_str().expect("backup path"),
            ],
        );

        add_remote(&work, "backup", backup.to_str().expect("backup path")).expect("add remote");
        update_remote(
            &work,
            "backup",
            backup.to_str().expect("backup path"),
            Some(remote.to_str().expect("remote path")),
        )
        .expect("set push URL");
        assert_eq!(
            git(&work, &["config", "--get", "remote.backup.pushurl"]),
            remote.to_str().expect("remote path")
        );

        update_remote(&work, "backup", backup.to_str().expect("backup path"), None)
            .expect("clear push URL");
        assert!(GitCli::run(&work, &["config", "--get", "remote.backup.pushurl"]).is_err());

        prune_remote(&work, "backup").expect("prune remote");
        delete_remote(&work, "backup").expect("delete remote");
        assert!(list_remotes(&work)
            .expect("list remotes")
            .iter()
            .all(|remote| remote.name != "backup"));
    }

    #[test]
    fn pushes_with_force_with_lease_and_deletes_remote_branch() {
        let temp = TestDir::new("push-branch");
        let source = temp.path.join("source");
        let remote = temp.path.join("origin.git");
        let work = temp.path.join("work");
        create_source_repo(&source);
        git(
            &source,
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
        git(&work, &["switch", "-c", "feature"]);
        git(&work, &["commit", "--allow-empty", "-m", "Feature"]);

        let push_preview = push_branch_dry_run(&work, "origin", "feature", None, true, true)
            .expect("preview push branch");
        assert!(push_preview.iter().any(|line| line.contains("feature")));
        assert!(GitCli::run(&remote, &["rev-parse", "--verify", "refs/heads/feature"]).is_err());

        push_branch(&work, "origin", "feature", None, true, true).expect("push branch");
        assert_eq!(
            git(&remote, &["rev-parse", "--verify", "refs/heads/feature"]),
            git(&work, &["rev-parse", "feature"])
        );

        let delete_preview =
            delete_remote_branch_dry_run(&work, "origin", "feature").expect("preview delete");
        assert!(delete_preview.iter().any(|line| line.contains("feature")));
        assert!(GitCli::run(&remote, &["rev-parse", "--verify", "refs/heads/feature"]).is_ok());

        delete_remote_branch(&work, "origin", "feature").expect("delete branch");
        assert!(GitCli::run(&remote, &["rev-parse", "--verify", "refs/heads/feature"]).is_err());
    }

    #[test]
    fn remote_prune_dry_run_reports_stale_refs_without_pruning() {
        let temp = TestDir::new("prune-dry-run");
        let source = temp.path.join("source");
        let remote = temp.path.join("origin.git");
        let work = temp.path.join("work");
        create_source_repo(&source);
        git(
            &source,
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

        git(&source, &["switch", "-c", "stale"]);
        git(&source, &["commit", "--allow-empty", "-m", "Stale branch"]);
        git(
            &source,
            &["push", remote.to_str().expect("remote path"), "stale"],
        );
        git(&work, &["fetch", "origin"]);
        assert!(GitCli::run(
            &work,
            &["rev-parse", "--verify", "refs/remotes/origin/stale"]
        )
        .is_ok());

        git(&remote, &["update-ref", "-d", "refs/heads/stale"]);
        let lines = prune_remote_dry_run(&work, "origin").expect("dry-run remote prune");

        assert!(lines.iter().any(|line| line.contains("origin/stale")));
        assert!(GitCli::run(
            &work,
            &["rev-parse", "--verify", "refs/remotes/origin/stale"]
        )
        .is_ok());
    }
}
