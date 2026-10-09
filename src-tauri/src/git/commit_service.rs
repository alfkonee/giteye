use crate::errors::AppError;
use crate::git::cli::{required_git_arg, GitCli};
use crate::git::history_service;
use crate::git::stash_service;
use crate::models::{CommitDetails, CommitSummary};
use std::path::Path;

pub fn get_commit_history(
    repo_path: &Path,
    limit: Option<u32>,
    rev: Option<&str>,
) -> Result<Vec<CommitSummary>, AppError> {
    match rev {
        Some(rev) => get_ref_commit_history(repo_path, limit, rev),
        None => get_multi_root_commit_history(repo_path, limit),
    }
}

/// History reachable from one revision only: the basis for a ref's own history view.
fn get_ref_commit_history(
    repo_path: &Path,
    limit: Option<u32>,
    rev: &str,
) -> Result<Vec<CommitSummary>, AppError> {
    let commit = history_service::resolve_commit(repo_path, rev)?;
    let limit_str = limit.unwrap_or(50).to_string();
    let output = GitCli::run(
        repo_path,
        &[
            "log",
            "--date-order",
            "--decorate=short",
            "--max-count",
            &limit_str,
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D%x00%P",
            commit.as_str(),
        ],
    )?;
    Ok(parse_commit_log(&output))
}

fn get_multi_root_commit_history(
    repo_path: &Path,
    limit: Option<u32>,
) -> Result<Vec<CommitSummary>, AppError> {
    let limit_str = limit.unwrap_or(50).to_string();
    let mut roots = Vec::new();
    if let Ok(head) = GitCli::run(repo_path, &["rev-parse", "--verify", "HEAD^{commit}"]) {
        roots.push(head.trim().to_string());
    }
    let refs = GitCli::run(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(refname)",
            "refs/heads", "refs/remotes", "refs/tags",
        ],
    )?;
    for line in refs.lines() {
        let mut fields = line.split('\0');
        let oid = fields.next().unwrap_or_default();
        let kind = fields.next().unwrap_or_default();
        let peeled = fields.next().unwrap_or_default();
        let peeled_kind = fields.next().unwrap_or_default();
        let name = fields.next().unwrap_or_default();
        if kind == "commit" {
            roots.push(oid.to_string());
        } else if peeled_kind == "commit" {
            roots.push(peeled.to_string());
        } else if peeled_kind == "tag" {
            // Nested annotated tags need recursive peeling; ordinary tags
            // share the batched ref walk instead of spawning Git per tag.
            if let Ok(commit) = history_service::resolve_commit(repo_path, name) {
                roots.push(commit);
            }
        }
    }
    roots.extend(stash_service::list_stashes(repo_path)?.into_iter().map(|stash| stash.base_commit_hash));
    roots.sort_unstable();
    roots.dedup();
    if roots.is_empty() {
        return Ok(Vec::new());
    }

    let mut args = vec![
        "log", "--date-order", "--decorate=short", "--max-count", &limit_str,
        "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D%x00%P",
    ];
    args.extend(roots.iter().map(String::as_str));
    let output = GitCli::run(repo_path, &args)?;
    Ok(parse_commit_log(&output))
}

fn parse_commit_log(output: &str) -> Vec<CommitSummary> {
    output
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\0').collect();
            if parts.len() < 8 {
                return None;
            }

            let refs_str = parts[6];
            let refs: Vec<String> = if refs_str.is_empty() {
                vec![]
            } else {
                refs_str
                    .split(',')
                    .map(|r| r.trim())
                    .filter(|r| !r.is_empty())
                    .map(|r| r.to_string())
                    .collect()
            };

            let parents: Vec<String> = parts[7]
                .split_whitespace()
                .map(|parent| parent.to_string())
                .collect();

            Some(CommitSummary {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author_name: parts[3].to_string(),
                author_email: parts[4].to_string(),
                timestamp: parts[5].to_string(),
                refs,
                parents,
            })
        })
        .collect()
}

/// Best common ancestor of two revisions, or `None` when they share none.
///
/// Exit code 1 is Git's documented "no merge base found" outcome; any other
/// failure (unknown revision, unborn repository) surfaces as an error.
pub fn merge_base(
    repo_path: &Path,
    from_ref: &str,
    to_ref: &str,
) -> Result<Option<String>, AppError> {
    let from_ref = required_git_arg(from_ref, "reference")?;
    let to_ref = required_git_arg(to_ref, "reference")?;
    let (status_code, stdout) = GitCli::run_allowing_statuses(
        repo_path,
        &["merge-base", from_ref, to_ref],
        &[1],
    )?;
    if status_code != 0 {
        return Ok(None);
    }
    let base = stdout.trim().to_string();
    if base.is_empty() {
        return Ok(None);
    }
    Ok(Some(base))
}

/// Full commit hash for any revision (branch, `origin/…` upstream, tag, hash).
pub fn resolve_revision(repo_path: &Path, rev: &str) -> Result<String, AppError> {
    history_service::resolve_commit(repo_path, rev)
}

/// Subject lines of the commits that `head` introduces over `base`, newest first.
///
/// This is the text the AI PR assistant summarizes into a title and description.
/// When `base` is absent the branch's own recent history is used instead.
pub fn branch_commit_subjects(
    repo_path: &Path,
    head: &str,
    base: Option<&str>,
    limit: usize,
) -> Result<Vec<String>, AppError> {
    let limit_str = limit.to_string();
    let revision = match base {
        Some(base) => format!("{base}..{head}"),
        None => head.to_string(),
    };
    let output = GitCli::run(
        repo_path,
        &[
            "log",
            "--no-merges",
            "--date-order",
            "--max-count",
            &limit_str,
            &revision,
            "--pretty=format:%s",
        ],
    )?;

    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

pub fn get_commit_details(repo_path: &Path, hash: &str) -> Result<CommitDetails, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "show",
            "--format=%H%x00%s%x00%b%x00%an%x00%ae%x00%cn%x00%ce%x00%aI%x00%P",
            "--name-only",
            "--no-renames",
            // Plain `git show` emits a *combined* diff for merges, which is
            // empty for clean merges. Diff against the first parent instead,
            // matching every mainstream Git GUI.
            "-m",
            "--first-parent",
            hash,
        ],
    )?;

    let parts: Vec<&str> = output.splitn(9, '\0').collect();

    if parts.len() < 9 {
        return Err(AppError::CommitNotFound(hash.to_string()));
    }

    let refs = refs_pointing_to_commit(repo_path, hash, parts[0])?;
    let (parents_str, changed_files_str) = parts[8].split_once("\n\n").unwrap_or((parts[8], ""));
    let parents: Vec<String> = parents_str
        .split_whitespace()
        .map(|p| p.to_string())
        .collect();
    let changed_files: Vec<String> = changed_files_str
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    Ok(CommitDetails {
        hash: parts[0].to_string(),
        message: parts[1].to_string(),
        body: {
            let body = parts[2].trim_end_matches('\n');
            if body.is_empty() {
                None
            } else {
                Some(body.to_string())
            }
        },
        author_name: parts[3].to_string(),
        author_email: parts[4].to_string(),
        committer_name: parts[5].to_string(),
        committer_email: parts[6].to_string(),
        timestamp: parts[7].to_string(),
        refs,
        parents,
        changed_files,
    })
}

fn refs_pointing_to_commit(
    repo_path: &Path,
    hash: &str,
    commit_hash: &str,
) -> Result<Vec<String>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname)",
            "--points-at",
            hash,
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ],
    )?;
    let mut refs = output
        .lines()
        .filter_map(|reference| {
            reference
                .strip_prefix("refs/heads/")
                .map(str::to_owned)
                .or_else(|| reference.strip_prefix("refs/remotes/").map(str::to_owned))
                .or_else(|| {
                    reference
                        .strip_prefix("refs/tags/")
                        .map(|tag| format!("tag: {tag}"))
                })
        })
        .collect::<Vec<_>>();

    let head_branch = GitCli::run(repo_path, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .ok()
        .map(|branch| branch.trim().to_string())
        .filter(|branch| !branch.is_empty());
    let head_points_at_commit = GitCli::run(repo_path, &["rev-parse", "HEAD"])
        .ok()
        .is_some_and(|head| head.trim() == commit_hash);

    if let Some(branch) = head_branch.filter(|_| head_points_at_commit) {
        if let Some(reference) = refs.iter_mut().find(|reference| *reference == &branch) {
            *reference = format!("HEAD -> {branch}");
        } else {
            refs.push(format!("HEAD -> {branch}"));
        }
    }

    Ok(refs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
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
            let path = std::env::temp_dir().join(format!("giteye-commit-{name}-{nonce}"));
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
        String::from_utf8(output.stdout).expect("utf-8 git output")
    }

    fn git_at(cwd: &Path, args: &[&str], iso_date: &str) {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .env("GIT_AUTHOR_DATE", iso_date)
            .env("GIT_COMMITTER_DATE", iso_date)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_repo(path: &Path) {
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
    }

    #[test]
    fn history_returns_empty_for_unborn_repository() {
        let temp = TestDir::new("empty");
        init_repo(&temp.path);

        let history = get_commit_history(&temp.path, Some(10), None).expect("history");

        assert!(history.is_empty());
    }

    #[test]
    fn commit_details_load_changed_files() {
        let temp = TestDir::new("details");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git(
            &temp.path,
            &[
                "commit",
                "-m",
                "Initial fixture",
                "-m",
                "Body line one",
                "-m",
                "Body line two",
            ],
        );

        let history = get_commit_history(&temp.path, Some(10), None).expect("history");
        let details = get_commit_details(&temp.path, &history[0].hash).expect("details");

        assert_eq!(details.message, "Initial fixture");
        assert_eq!(
            details.body.as_deref(),
            Some("Body line one\n\nBody line two")
        );
        assert_eq!(details.changed_files, vec!["README.md".to_string()]);
        assert_eq!(details.parents.len(), 0);
    }

    #[test]
    fn commit_details_include_branch_and_tag_refs() {
        let temp = TestDir::new("details-refs");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial fixture"]);
        git(&temp.path, &["tag", "v1.0.0"]);
        git(&temp.path, &["branch", "feature,comma"]);
        git(&temp.path, &["tag", "v1,0"]);

        let history = get_commit_history(&temp.path, Some(10), None).expect("history");
        let details = get_commit_details(&temp.path, &history[0].hash).expect("details");

        assert!(
            details.refs.iter().any(|r| r == "HEAD -> main"),
            "expected checked out branch in refs, got {:?}",
            details.refs
        );
        assert!(
            details.refs.iter().any(|r| r == "tag: v1.0.0"),
            "expected tag in refs, got {:?}",
            details.refs
        );
        assert!(
            details.refs.iter().any(|r| r == "feature,comma"),
            "expected comma-containing branch in refs, got {:?}",
            details.refs
        );
        assert!(
            details.refs.iter().any(|r| r == "tag: v1,0"),
            "expected comma-containing tag in refs, got {:?}",
            details.refs
        );
        assert_eq!(details.changed_files, vec!["README.md".to_string()]);
    }

    #[test]
    fn history_includes_parent_hashes() {
        let temp = TestDir::new("parents");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial fixture"]);

        fs::write(temp.path.join("README.md"), "# fixture\n\nupdated\n").expect("update file");
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Second fixture"]);

        let history = get_commit_history(&temp.path, Some(10), None).expect("history");

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].message, "Second fixture");
        assert_eq!(history[0].parents, vec![history[1].hash.clone()]);
        assert!(history[1].parents.is_empty());
    }

    #[test]
    fn history_includes_unmerged_non_checked_out_branches() {
        let temp = TestDir::new("all-branches");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial fixture"]);

        git(&temp.path, &["checkout", "-b", "feature"]);
        fs::write(temp.path.join("feature.txt"), "feature\n").expect("write feature");
        git(&temp.path, &["add", "feature.txt"]);
        git(&temp.path, &["commit", "-m", "Feature-only work"]);

        git(&temp.path, &["checkout", "main"]);
        fs::write(temp.path.join("main.txt"), "main\n").expect("write main");
        git(&temp.path, &["add", "main.txt"]);
        git(&temp.path, &["commit", "-m", "Main work"]);

        let messages: Vec<String> = get_commit_history(&temp.path, Some(10), None)
            .expect("history")
            .into_iter()
            .map(|commit| commit.message)
            .collect();

        assert!(
            messages
                .iter()
                .any(|message| message == "Feature-only work"),
            "history should include commits reachable only from another branch: {messages:?}"
        );
    }

    #[test]
    fn history_includes_remote_only_branch_refs() {
        let temp = TestDir::new("remote-branches");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial fixture"]);

        git(&temp.path, &["checkout", "-b", "remote-work"]);
        fs::write(temp.path.join("remote.txt"), "remote\n").expect("write remote");
        git(&temp.path, &["add", "remote.txt"]);
        git(&temp.path, &["commit", "-m", "Remote-only work"]);
        git(
            &temp.path,
            &["update-ref", "refs/remotes/origin/remote-work", "HEAD"],
        );
        git(&temp.path, &["checkout", "main"]);
        git(&temp.path, &["branch", "-D", "remote-work"]);

        let messages: Vec<String> = get_commit_history(&temp.path, Some(10), None)
            .expect("history")
            .into_iter()
            .map(|commit| commit.message)
            .collect();

        assert!(
            messages.iter().any(|message| message == "Remote-only work"),
            "history should include commits reachable only from remote branch refs: {messages:?}"
        );
    }

    #[test]
    fn history_excludes_non_branch_refs_like_stash() {
        let temp = TestDir::new("stash");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial fixture"]);

        fs::write(temp.path.join("README.md"), "# fixture\n\nstashed\n").expect("stash change");
        git(&temp.path, &["stash", "push", "-m", "Temporary stash"]);

        let messages: Vec<String> = get_commit_history(&temp.path, Some(10), None)
            .expect("history")
            .into_iter()
            .map(|commit| commit.message)
            .collect();

        assert!(
            messages
                .iter()
                .all(|message| !message.contains("Temporary stash")),
            "history should not include stash commits when showing branch history: {messages:?}"
        );
    }

    #[test]
    fn history_keeps_recent_side_branch_near_merge() {
        let temp = TestDir::new("date-order");
        init_repo(&temp.path);

        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git_at(
            &temp.path,
            &["commit", "-m", "Initial fixture"],
            "2026-01-01T00:00:00Z",
        );

        git(&temp.path, &["branch", "feature"]);
        fs::write(temp.path.join("main.txt"), "main\n").expect("write main");
        git(&temp.path, &["add", "main.txt"]);
        git_at(
            &temp.path,
            &["commit", "-m", "Main work"],
            "2026-01-02T00:00:00Z",
        );

        git(&temp.path, &["checkout", "feature"]);
        fs::write(temp.path.join("feature.txt"), "feature\n").expect("write feature");
        git(&temp.path, &["add", "feature.txt"]);
        git_at(
            &temp.path,
            &["commit", "-m", "Feature work"],
            "2026-01-04T00:00:00Z",
        );

        git(&temp.path, &["checkout", "main"]);
        git_at(
            &temp.path,
            &["merge", "--no-ff", "feature", "-m", "Merge feature"],
            "2026-01-05T00:00:00Z",
        );

        let messages: Vec<String> = get_commit_history(&temp.path, Some(10), None)
            .expect("history")
            .into_iter()
            .map(|commit| commit.message)
            .collect();
        let feature_index = messages
            .iter()
            .position(|message| message == "Feature work")
            .expect("feature commit");
        let main_index = messages
            .iter()
            .position(|message| message == "Main work")
            .expect("main commit");

        assert_eq!(messages[0], "Merge feature");
        assert!(
            feature_index < main_index,
            "recent merged branch should stay close to merge: {messages:?}"
        );
    }

    #[test]
    fn merge_commit_details_list_changes_against_first_parent() {
        let temp = TestDir::new("merge-details");
        init_repo(&temp.path);

        fs::write(temp.path.join("README.md"), "# fixture\n").expect("write file");
        git(&temp.path, &["add", "README.md"]);
        git_at(
            &temp.path,
            &["commit", "-m", "Initial fixture"],
            "2026-01-01T00:00:00Z",
        );

        git(&temp.path, &["branch", "feature"]);
        git(&temp.path, &["checkout", "feature"]);
        fs::write(temp.path.join("feature.txt"), "feature\n").expect("write feature");
        git(&temp.path, &["add", "feature.txt"]);
        git_at(
            &temp.path,
            &["commit", "-m", "Feature work"],
            "2026-01-02T00:00:00Z",
        );

        git(&temp.path, &["checkout", "main"]);
        git_at(
            &temp.path,
            &["merge", "--no-ff", "feature", "-m", "Merge feature"],
            "2026-01-03T00:00:00Z",
        );

        let history = get_commit_history(&temp.path, Some(10), None).expect("history");
        assert_eq!(history[0].message, "Merge feature");

        let details = get_commit_details(&temp.path, &history[0].hash).expect("details");
        assert!(
            details.changed_files.iter().any(|file| file == "feature.txt"),
            "clean merge must list merged files, got {:?}",
            details.changed_files
        );
    }

    #[test]
    fn history_includes_tag_only_commit_and_ignores_noncommit_tag() {
        let temp = TestDir::new("tag-only");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "initial\n").unwrap();
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial"]);
        git(&temp.path, &["checkout", "-b", "ephemeral"]);
        fs::write(temp.path.join("README.md"), "tagged\n").unwrap();
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Tagged-only work"]);
        git(&temp.path, &["tag", "-a", "-m", "Release note", "release"]);
        let blob = GitCli::run(&temp.path, &["rev-parse", "HEAD:README.md"]).unwrap();
        git(&temp.path, &["tag", "blob-tag", blob.trim()]);
        git(&temp.path, &["checkout", "main"]);
        git(&temp.path, &["branch", "-D", "ephemeral"]);

        let commits = get_commit_history(&temp.path, Some(10), None).unwrap();
        let tagged = commits.iter().find(|commit| commit.message == "Tagged-only work").unwrap();
        assert!(tagged.refs.iter().any(|name| name == "tag: release"), "{:?}", tagged.refs);
        assert_eq!(commits.len(), 2);
    }

    #[test]
    fn history_includes_detached_head_not_shared_with_any_branch() {
        let temp = TestDir::new("detached");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "initial\n").unwrap();
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial"]);
        git(&temp.path, &["switch", "--detach"]);
        fs::write(temp.path.join("README.md"), "detached\n").unwrap();
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Detached-only work"]);

        let commits = get_commit_history(&temp.path, Some(10), None).unwrap();
        assert!(commits.iter().any(|commit| commit.message == "Detached-only work"));
    }

    #[test]
    fn orphaned_stash_base_is_visible_without_wip_or_helper_commits() {
        let temp = TestDir::new("stash-base");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "initial\n").unwrap();
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Initial"]);
        git(&temp.path, &["checkout", "-b", "temporary"]);
        fs::write(temp.path.join("README.md"), "base\n").unwrap();
        git(&temp.path, &["add", "README.md"]);
        git(&temp.path, &["commit", "-m", "Stash base only"]);
        fs::write(temp.path.join("README.md"), "staged\n").unwrap();
        git(&temp.path, &["add", "README.md"]);
        fs::write(temp.path.join("README.md"), "unstaged\n").unwrap();
        fs::write(temp.path.join("untracked.txt"), "new\n").unwrap();
        git(&temp.path, &["stash", "push", "-u", "-m", "saved"]);
        let stash = stash_service::list_stashes(&temp.path).unwrap().remove(0);
        git(&temp.path, &["checkout", "main"]);
        git(&temp.path, &["branch", "-D", "temporary"]);

        let commits = get_commit_history(&temp.path, Some(10), None).unwrap();
        let hashes: Vec<&str> = commits.iter().map(|commit| commit.hash.as_str()).collect();
        assert!(hashes.contains(&stash.base_commit_hash.as_str()));
        assert!(!hashes.contains(&stash.commit_hash.as_str()));
        assert!(!hashes.contains(&stash.index_commit_hash.as_deref().unwrap()));
        assert!(!hashes.contains(&stash.untracked_commit_hash.as_deref().unwrap()));
    }

    fn diverged_fixture() -> (TestDir, String, String) {
        let temp = TestDir::new("ref-history");
        init_repo(&temp.path);
        fs::write(temp.path.join("README.md"), "base\n").unwrap();
        git(&temp.path, &["add", "README.md"]);
        git_at(&temp.path, &["commit", "-m", "Shared base"], "2026-01-01T00:00:00Z");

        fs::write(temp.path.join("main.txt"), "main\n").unwrap();
        git(&temp.path, &["add", "main.txt"]);
        git_at(&temp.path, &["commit", "-m", "Main-only work"], "2026-01-02T00:00:00Z");

        let remote_head = git_output(&temp.path, &["rev-parse", "HEAD"]);
        git(&temp.path, &["update-ref", "refs/remotes/origin/main", remote_head.trim()]);
        git(&temp.path, &["reset", "--hard", "HEAD~1"]);
        git(&temp.path, &["branch", "topic", "HEAD"]);
        git(&temp.path, &["checkout", "topic"]);
        fs::write(temp.path.join("topic.txt"), "topic\n").unwrap();
        git(&temp.path, &["add", "topic.txt"]);
        git_at(&temp.path, &["commit", "-m", "Topic-only work"], "2026-01-03T00:00:00Z");
        (temp, remote_head.trim().to_string(), "topic".to_string())
    }

    #[test]
    fn ref_history_walks_only_the_requested_revision() {
        let (temp, remote_head, _) = diverged_fixture();

        let commits = get_commit_history(&temp.path, Some(10), Some("origin/main")).unwrap();
        let messages: Vec<&str> = commits.iter().map(|c| c.message.as_str()).collect();
        assert_eq!(messages, vec!["Main-only work", "Shared base"]);

        let hashes: Vec<&str> = commits.iter().map(|c| c.hash.as_str()).collect();
        assert!(hashes.contains(&remote_head.as_str()));

        let topic = get_commit_history(&temp.path, Some(10), Some("topic")).unwrap();
        let messages: Vec<&str> = topic.iter().map(|c| c.message.as_str()).collect();
        assert_eq!(messages, vec!["Topic-only work", "Shared base"]);
    }

    #[test]
    fn ref_history_resolves_remote_names_and_limits() {
        let (temp, remote_head, _) = diverged_fixture();

        let commits = get_commit_history(&temp.path, Some(1), Some("origin/main")).unwrap();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].hash, remote_head);
    }

    #[test]
    fn ref_history_rejects_unknown_revision() {
        let (temp, _, _) = diverged_fixture();
        let result = get_commit_history(&temp.path, Some(10), Some("no/such/ref"));
        assert!(result.is_err());
    }

    #[test]
    fn merge_base_finds_shared_ancestor_of_diverged_pair() {
        let (temp, remote_head, _) = diverged_fixture();

        let base = merge_base(&temp.path, "topic", "origin/main").unwrap().unwrap();
        let all = get_commit_history(&temp.path, Some(10), None).unwrap();
        let shared = all.iter().find(|c| c.message == "Shared base").unwrap();
        assert_eq!(base, shared.hash);

        // The pair really has diverged: neither side is an ancestor of the other.
        let topic_tip = get_commit_history(&temp.path, Some(10), Some("topic")).unwrap()[0].hash.clone();
        assert_ne!(base, topic_tip);
        assert_ne!(base, remote_head);
    }

    #[test]
    fn merge_base_returns_none_without_common_ancestor() {
        let temp = TestDir::new("no-merge-base");
        init_repo(&temp.path);
        fs::write(temp.path.join("a.txt"), "a\n").unwrap();
        git(&temp.path, &["add", "a.txt"]);
        git(&temp.path, &["commit", "-m", "Root A"]);
        let root_a = git_output(&temp.path, &["rev-parse", "HEAD"]);

        git(&temp.path, &["checkout", "--orphan", "lonely"]);
        fs::write(temp.path.join("b.txt"), "b\n").unwrap();
        git(&temp.path, &["add", "b.txt"]);
        git(&temp.path, &["commit", "-m", "Root B"]);

        assert_eq!(merge_base(&temp.path, "main", "lonely").unwrap(), None);
        let _ = root_a;
    }

    #[test]
    fn merge_base_errors_on_unknown_revision() {
        let (temp, _, _) = diverged_fixture();
        assert!(merge_base(&temp.path, "topic", "no/such/ref").is_err());
    }

    #[test]
    fn resolve_revision_returns_commit_hash_for_names() {
        let (temp, remote_head, _) = diverged_fixture();

        assert_eq!(resolve_revision(&temp.path, "origin/main").unwrap(), remote_head);
        let topic_tip = resolve_revision(&temp.path, "topic").unwrap();
        let expected = get_commit_history(&temp.path, Some(10), Some("topic")).unwrap()[0]
            .hash
            .clone();
        assert_eq!(topic_tip, expected);
        assert!(resolve_revision(&temp.path, "no/such/ref").is_err());
    }
}
