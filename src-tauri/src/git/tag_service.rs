use crate::errors::AppError;
use crate::git::cli::{required_git_arg, GitCli};
use crate::models::GitTag;
use std::path::Path;

pub fn list_tags(repo_path: &Path) -> Result<Vec<GitTag>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "for-each-ref",
            "refs/tags",
            "--sort=-creatordate",
            "--format=%(refname:short)%00%(objectname)%00%(objectname:short)%00%(*objectname)%00%(*objectname:short)%00%(subject)%00%(taggername)%00%(creatordate:iso-strict)%00%(objecttype)",
        ],
    )?;

    Ok(output
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(parse_tag_line)
        .collect())
}

pub fn create_tag(
    repo_path: &Path,
    name: &str,
    target: Option<&str>,
    message: Option<&str>,
) -> Result<(), AppError> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err(AppError::GitError("tag name is required".to_string()));
    }

    let trimmed_target = target.map(str::trim).filter(|value| !value.is_empty());
    let trimmed_message = message.map(str::trim).filter(|value| !value.is_empty());

    let mut args = vec!["tag"];
    if let Some(value) = trimmed_message {
        args.push("--annotate");
        args.push(trimmed_name);
        if let Some(target) = trimmed_target {
            args.push(target);
        }
        args.push("--message");
        args.push(value);
    } else {
        args.push(trimmed_name);
        if let Some(target) = trimmed_target {
            args.push(target);
        }
    }

    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn delete_tag(repo_path: &Path, name: &str) -> Result<(), AppError> {
    GitCli::run(repo_path, &["tag", "--delete", name])?;
    Ok(())
}

pub fn push_tag(repo_path: &Path, remote: &str, name: &str) -> Result<(), AppError> {
    let args = push_tag_args(repo_path, remote, name, false)?;
    run_git(repo_path, &args)?;
    Ok(())
}

pub fn push_tag_dry_run(
    repo_path: &Path,
    remote: &str,
    name: &str,
) -> Result<Vec<String>, AppError> {
    let args = push_tag_args(repo_path, remote, name, true)?;
    let output = run_git(repo_path, &args)?;
    let lines = non_empty_lines(&output);
    if lines.is_empty() {
        Ok(vec![format!("Tag {name} would not change on {remote}")])
    } else {
        Ok(lines)
    }
}

pub fn delete_remote_tag(repo_path: &Path, remote: &str, name: &str) -> Result<(), AppError> {
    let args = delete_remote_tag_args(repo_path, remote, name, false)?;
    run_git(repo_path, &args)?;
    Ok(())
}

pub fn delete_remote_tag_dry_run(
    repo_path: &Path,
    remote: &str,
    name: &str,
) -> Result<Vec<String>, AppError> {
    let args = delete_remote_tag_args(repo_path, remote, name, true)?;
    let output = run_git(repo_path, &args)?;
    let lines = non_empty_lines(&output);
    if lines.is_empty() {
        Ok(vec![format!("Remote tag {remote}/{name} would not change")])
    } else {
        Ok(lines)
    }
}

fn push_tag_args(
    repo_path: &Path,
    remote: &str,
    name: &str,
    dry_run: bool,
) -> Result<Vec<String>, AppError> {
    let remote = required_git_arg(remote, "remote name")?;
    let name = required_tag_name(repo_path, name)?;
    let refspec = format!("refs/tags/{name}:refs/tags/{name}");
    Ok(push_args(remote, refspec, dry_run))
}

fn delete_remote_tag_args(
    repo_path: &Path,
    remote: &str,
    name: &str,
    dry_run: bool,
) -> Result<Vec<String>, AppError> {
    let remote = required_git_arg(remote, "remote name")?;
    let name = required_tag_name(repo_path, name)?;
    let refspec = format!(":refs/tags/{name}");
    Ok(push_args(remote, refspec, dry_run))
}

fn push_args(remote: &str, refspec: String, dry_run: bool) -> Vec<String> {
    let mut args = vec!["push".to_string()];
    if dry_run {
        args.push("--dry-run".to_string());
        args.push("--porcelain".to_string());
    }
    args.push(remote.to_string());
    args.push(refspec);
    args
}

fn required_tag_name<'a>(repo_path: &Path, name: &'a str) -> Result<&'a str, AppError> {
    let name = required_git_arg(name, "tag name")?;
    let ref_name = format!("refs/tags/{name}");
    GitCli::run(repo_path, &["check-ref-format", &ref_name])
        .map_err(|_| AppError::GitError(format!("tag name is not a valid Git ref name: {name}")))?;
    Ok(name)
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

fn parse_tag_line(line: &str) -> Option<GitTag> {
    let mut parts = line.split('\0');
    let name = parts.next()?.to_string();
    let object_hash = parts.next()?.to_string();
    let object_short_hash = parts.next()?.to_string();
    let peeled_hash = parts.next().unwrap_or_default();
    let peeled_short_hash = parts.next().unwrap_or_default();
    let subject = parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let tagger = parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let timestamp = parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let object_type = parts.next().unwrap_or_default();
    let annotated = object_type == "tag";

    let commit_hash = if peeled_hash.is_empty() {
        object_hash
    } else {
        peeled_hash.to_string()
    };
    let short_hash = if peeled_short_hash.is_empty() {
        object_short_hash
    } else {
        peeled_short_hash.to_string()
    };

    Some(GitTag {
        name,
        commit_hash,
        short_hash,
        subject,
        tagger,
        timestamp,
        annotated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestRepo {
        path: PathBuf,
    }

    impl TestRepo {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-tag-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create temp repo dir");
            run_git(&path, &["init"]);
            run_git(&path, &["config", "user.name", "GitEye Test"]);
            run_git(&path, &["config", "user.email", "giteye@example.test"]);
            fs::write(path.join("tracked.txt"), "initial\n").expect("write tracked file");
            run_git(&path, &["add", "tracked.txt"]);
            run_git(&path, &["commit", "-m", "initial"]);
            Self { path }
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn run_git(path: &std::path::Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(path)
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
    fn parses_lightweight_tag() {
        let tag = parse_tag_line("v1.0\0abcdef123\0abcdef1\0\0\0release commit\0\0\0commit")
            .expect("tag");

        assert_eq!(tag.name, "v1.0");
        assert_eq!(tag.commit_hash, "abcdef123");
        assert!(!tag.annotated);
        assert_eq!(tag.subject.as_deref(), Some("release commit"));
        assert_eq!(tag.tagger, None);
    }

    #[test]
    fn parses_annotated_tag_target() {
        let tag = parse_tag_line(
            "v2.0\0tagobject\0tagobj\0commit123\0commit1\0release notes\0Ada Lovelace\02026-06-13T20:00:00+00:00\0tag",
        )
        .expect("tag");

        assert_eq!(tag.commit_hash, "commit123");
        assert_eq!(tag.short_hash, "commit1");
        assert!(tag.annotated);
        assert_eq!(tag.tagger.as_deref(), Some("Ada Lovelace"));
    }

    #[test]
    fn creates_lists_and_deletes_tags() {
        let repo = TestRepo::new("roundtrip");

        create_tag(&repo.path, "v-test", None, Some("release checkpoint")).expect("create tag");

        let tags = list_tags(&repo.path).expect("list tags");
        let tag = tags
            .iter()
            .find(|tag| tag.name == "v-test")
            .expect("created tag");
        assert!(tag.annotated);
        assert_eq!(tag.subject.as_deref(), Some("release checkpoint"));

        delete_tag(&repo.path, "v-test").expect("delete tag");
        assert!(list_tags(&repo.path)
            .expect("list tags")
            .iter()
            .all(|tag| tag.name != "v-test"));
    }

    #[test]
    fn pushes_and_deletes_remote_tag_with_explicit_refspec() {
        let source = TestRepo::new("remote-source");
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let remote_path = std::env::temp_dir().join(format!("giteye-tag-remote-{nonce}.git"));
        run_git(
            &source.path,
            &[
                "clone",
                "--bare",
                ".",
                remote_path.to_str().expect("remote path"),
            ],
        );
        let remote = TestRepo { path: remote_path };
        run_git(
            &source.path,
            &[
                "remote",
                "add",
                "origin",
                remote.path.to_str().expect("remote path"),
            ],
        );

        create_tag(&source.path, "v-remote", None, None).expect("create tag");
        let push_preview =
            push_tag_dry_run(&source.path, "origin", "v-remote").expect("preview push tag");
        assert!(push_preview.iter().any(|line| line.contains("v-remote")));
        assert!(GitCli::run(
            &remote.path,
            &["rev-parse", "--verify", "refs/tags/v-remote"]
        )
        .is_err());
        push_tag(&source.path, "origin", "v-remote").expect("push tag");
        assert!(Command::new("git")
            .args(["rev-parse", "--verify", "refs/tags/v-remote"])
            .current_dir(&remote.path)
            .output()
            .expect("verify remote tag")
            .status
            .success());

        let delete_preview = delete_remote_tag_dry_run(&source.path, "origin", "v-remote")
            .expect("preview delete remote tag");
        assert!(delete_preview.iter().any(|line| line.contains("v-remote")));
        assert!(GitCli::run(
            &remote.path,
            &["rev-parse", "--verify", "refs/tags/v-remote"]
        )
        .is_ok());

        delete_remote_tag(&source.path, "origin", "v-remote").expect("delete remote tag");
        assert!(!Command::new("git")
            .args(["rev-parse", "--verify", "refs/tags/v-remote"])
            .current_dir(&remote.path)
            .output()
            .expect("verify deleted remote tag")
            .status
            .success());
    }
}
