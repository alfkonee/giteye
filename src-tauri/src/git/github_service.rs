use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::github::{
    ActivityItem, CheckRunSummary, GitHubAccount, PullRequestDiff, PullRequestFileDiff,
    PullRequestSummary, RepositoryGithubOverview, ReviewCommentSummary, ReviewSummary,
};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const GH_TIMEOUT: Duration = Duration::from_secs(3);
const GH_AUTH_TIMEOUT: Duration = Duration::from_secs(2);

pub fn get_repository_github_overview(repo_path: &Path) -> RepositoryGithubOverview {
    let remote_url = GitCli::run(repo_path, &["remote", "get-url", "origin"])
        .ok()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty());

    let Some(remote_url_value) = remote_url.as_deref() else {
        return RepositoryGithubOverview::default();
    };

    let Some((owner, repo)) = parse_github_remote(remote_url_value) else {
        return RepositoryGithubOverview::default();
    };

    let mut overview = RepositoryGithubOverview {
        provider_available: false,
        is_github_repository: true,
        owner: Some(owner.clone()),
        repo: Some(repo.clone()),
        remote_url,
        account: None,
        pull_requests: Vec::new(),
        check_runs: Vec::new(),
        reviews: Vec::new(),
        activity: Vec::new(),
    };

    if !gh_is_authenticated(repo_path) {
        return overview;
    }

    overview.provider_available = true;
    overview.account = fetch_account(repo_path);
    overview.pull_requests = fetch_pull_requests(repo_path, &owner, &repo);
    overview.check_runs = fetch_check_runs(repo_path, &owner, &repo);
    overview.activity = fetch_activity(repo_path, &owner, &repo);

    if let Some(first_pr) = overview.pull_requests.first() {
        overview.reviews = fetch_reviews(repo_path, &owner, &repo, first_pr.number);
    }

    overview
}
pub fn get_pull_request_diff(repo_path: &Path, number: u64) -> Result<PullRequestDiff, AppError> {
    let (owner, repo) = github_repository(repo_path)?;
    let repository = format!("{owner}/{repo}");
    let number_string = number.to_string();
    let diff_text = run_required_process(
        "gh",
        &["pr", "diff", &number_string, "--repo", &repository],
        repo_path,
        GH_TIMEOUT,
    )?;
    let files = fetch_pull_request_files(repo_path, &owner, &repo, number);
    let comments = fetch_review_comments(repo_path, &owner, &repo, number);
    let pr = fetch_pull_request(repo_path, &owner, &repo, number);

    Ok(PullRequestDiff {
        number,
        title: pr.as_ref().map(|pr| pr.title.clone()),
        url: pr.and_then(|pr| pr.url),
        diff_text,
        files,
        comments,
    })
}

pub fn checkout_pull_request(repo_path: &Path, number: u64) -> Result<(), AppError> {
    let (_, _) = github_repository(repo_path)?;
    let number_string = number.to_string();
    run_required_process(
        "gh",
        &["pr", "checkout", &number_string],
        repo_path,
        GH_TIMEOUT,
    )?;
    Ok(())
}

pub fn update_pull_request_branch(repo_path: &Path, number: u64) -> Result<(), AppError> {
    let (_, _) = github_repository(repo_path)?;
    let number_string = number.to_string();
    run_required_process(
        "gh",
        &["pr", "update-branch", &number_string],
        repo_path,
        GH_TIMEOUT,
    )?;
    Ok(())
}

pub fn merge_pull_request(repo_path: &Path, number: u64, method: &str) -> Result<(), AppError> {
    let (_, _) = github_repository(repo_path)?;
    let number_string = number.to_string();
    let merge_flag = match method {
        "merge" => "--merge",
        "rebase" => "--rebase",
        _ => "--squash",
    };
    run_required_process(
        "gh",
        &["pr", "merge", &number_string, merge_flag, "--delete-branch"],
        repo_path,
        GH_TIMEOUT,
    )?;
    Ok(())
}

fn github_repository(repo_path: &Path) -> Result<(String, String), AppError> {
    let remote_url = GitCli::run(repo_path, &["remote", "get-url", "origin"])
        .map_err(|e| AppError::GitError(e.to_string()))?;
    let Some((owner, repo)) = parse_github_remote(remote_url.trim()) else {
        return Err(AppError::GitError(
            "Repository origin is not a GitHub remote".to_string(),
        ));
    };

    if !gh_is_authenticated(repo_path) {
        return Err(AppError::GitError(
            "GitHub CLI is not authenticated for github.com".to_string(),
        ));
    }

    Ok((owner, repo))
}

fn parse_github_remote(remote_url: &str) -> Option<(String, String)> {
    let trimmed = remote_url.trim().trim_end_matches('/');
    let without_suffix = trimmed.strip_suffix(".git").unwrap_or(trimmed);

    let path = if let Some(path) = without_suffix.strip_prefix("git@github.com:") {
        path
    } else if let Some(protocol_end) = without_suffix.find("://") {
        let after_protocol = &without_suffix[protocol_end + 3..];
        let (authority, path) = after_protocol.split_once('/')?;
        let host_port = authority
            .rsplit_once('@')
            .map_or(authority, |(_, host)| host);
        let host = host_port
            .split_once(':')
            .map_or(host_port, |(host, _)| host);

        if host != "github.com" {
            return None;
        }

        path
    } else {
        return None;
    };

    let mut parts = path.split('/').filter(|part| !part.is_empty());
    let owner = parts.next()?;
    let repo = parts.next()?;

    if owner.is_empty() || repo.is_empty() {
        return None;
    }

    Some((owner.to_string(), repo.to_string()))
}

fn gh_is_authenticated(repo_path: &Path) -> bool {
    run_process(
        "gh",
        &["auth", "status", "--hostname", "github.com"],
        repo_path,
        GH_AUTH_TIMEOUT,
    )
    .is_some()
}

fn fetch_account(repo_path: &Path) -> Option<GitHubAccount> {
    #[derive(Deserialize)]
    struct UserResponse {
        login: Option<String>,
        name: Option<String>,
        avatar_url: Option<String>,
        html_url: Option<String>,
    }

    let output = run_process("gh", &["api", "user"], repo_path, GH_TIMEOUT)?;
    let user: UserResponse = serde_json::from_str(&output).ok()?;

    Some(GitHubAccount {
        login: user.login.unwrap_or_default(),
        name: user.name,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
    })
}

fn fetch_pull_requests(repo_path: &Path, owner: &str, repo: &str) -> Vec<PullRequestSummary> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct GhPullRequest {
        number: Option<u64>,
        title: Option<String>,
        state: Option<String>,
        author: Option<GhAuthor>,
        url: Option<String>,
        head_ref_name: Option<String>,
        base_ref_name: Option<String>,
        is_draft: Option<bool>,
        updated_at: Option<String>,
    }

    let repository = format!("{owner}/{repo}");
    let output = run_process(
        "gh",
        &[
            "pr",
            "list",
            "--repo",
            &repository,
            "--limit",
            "10",
            "--json",
            "number,title,state,author,url,headRefName,baseRefName,isDraft,updatedAt",
        ],
        repo_path,
        GH_TIMEOUT,
    );

    output
        .and_then(|json| serde_json::from_str::<Vec<GhPullRequest>>(&json).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|pr| PullRequestSummary {
            number: pr.number.unwrap_or_default(),
            title: pr.title.unwrap_or_default(),
            state: pr.state.unwrap_or_default(),
            author: pr.author.and_then(|author| author.login),
            url: pr.url,
            head_ref_name: pr.head_ref_name,
            base_ref_name: pr.base_ref_name,
            is_draft: pr.is_draft.unwrap_or(false),
            updated_at: pr.updated_at,
        })
        .collect()
}

fn fetch_pull_request(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
) -> Option<PullRequestSummary> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct GhPullRequest {
        number: Option<u64>,
        title: Option<String>,
        state: Option<String>,
        author: Option<GhAuthor>,
        url: Option<String>,
        head_ref_name: Option<String>,
        base_ref_name: Option<String>,
        is_draft: Option<bool>,
        updated_at: Option<String>,
    }

    let repository = format!("{owner}/{repo}");
    let number_string = number.to_string();
    let output = run_process(
        "gh",
        &[
            "pr",
            "view",
            &number_string,
            "--repo",
            &repository,
            "--json",
            "number,title,state,author,url,headRefName,baseRefName,isDraft,updatedAt",
        ],
        repo_path,
        GH_TIMEOUT,
    )?;

    let pr = serde_json::from_str::<GhPullRequest>(&output).ok()?;
    Some(PullRequestSummary {
        number: pr.number.unwrap_or(number),
        title: pr.title.unwrap_or_default(),
        state: pr.state.unwrap_or_default(),
        author: pr.author.and_then(|author| author.login),
        url: pr.url,
        head_ref_name: pr.head_ref_name,
        base_ref_name: pr.base_ref_name,
        is_draft: pr.is_draft.unwrap_or(false),
        updated_at: pr.updated_at,
    })
}

fn fetch_pull_request_files(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
) -> Vec<PullRequestFileDiff> {
    #[derive(Deserialize)]
    struct GhFile {
        filename: Option<String>,
        additions: Option<u64>,
        deletions: Option<u64>,
        status: Option<String>,
    }

    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/files?per_page=100");
    run_process("gh", &["api", &endpoint], repo_path, GH_TIMEOUT)
        .and_then(|json| serde_json::from_str::<Vec<GhFile>>(&json).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|file| {
            Some(PullRequestFileDiff {
                path: file.filename?,
                additions: file.additions.unwrap_or_default(),
                deletions: file.deletions.unwrap_or_default(),
                status: file.status.unwrap_or_default(),
            })
        })
        .collect()
}

fn fetch_review_comments(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
) -> Vec<ReviewCommentSummary> {
    #[derive(Deserialize)]
    struct GhComment {
        id: Option<u64>,
        user: Option<GhAuthor>,
        path: Option<String>,
        line: Option<u64>,
        body: Option<String>,
        html_url: Option<String>,
        created_at: Option<String>,
    }

    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/comments?per_page=100");
    run_process("gh", &["api", &endpoint], repo_path, GH_TIMEOUT)
        .and_then(|json| serde_json::from_str::<Vec<GhComment>>(&json).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|comment| ReviewCommentSummary {
            id: comment.id.unwrap_or_default(),
            author: comment.user.and_then(|user| user.login),
            path: comment.path,
            line: comment.line,
            body: comment.body.unwrap_or_default(),
            url: comment.html_url,
            created_at: comment.created_at,
        })
        .collect()
}

fn fetch_check_runs(repo_path: &Path, owner: &str, repo: &str) -> Vec<CheckRunSummary> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct GhCheckRun {
        name: Option<String>,
        state: Option<String>,
        conclusion: Option<String>,
        link: Option<String>,
        started_at: Option<String>,
        completed_at: Option<String>,
    }

    let repository = format!("{owner}/{repo}");
    let output = run_process(
        "gh",
        &[
            "pr",
            "checks",
            "--repo",
            &repository,
            "--json",
            "name,state,conclusion,link,startedAt,completedAt",
        ],
        repo_path,
        GH_TIMEOUT,
    );

    output
        .and_then(|json| serde_json::from_str::<Vec<GhCheckRun>>(&json).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|check| CheckRunSummary {
            name: check.name.unwrap_or_default(),
            state: check.state,
            conclusion: check.conclusion,
            url: check.link,
            started_at: check.started_at,
            completed_at: check.completed_at,
        })
        .collect()
}

fn fetch_reviews(repo_path: &Path, owner: &str, repo: &str, number: u64) -> Vec<ReviewSummary> {
    #[derive(Deserialize)]
    struct GhReview {
        user: Option<GhAuthor>,
        state: Option<String>,
        submitted_at: Option<String>,
        html_url: Option<String>,
    }

    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/reviews");
    let output = run_process("gh", &["api", &endpoint], repo_path, GH_TIMEOUT);

    output
        .and_then(|json| serde_json::from_str::<Vec<GhReview>>(&json).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|review| ReviewSummary {
            author: review.user.and_then(|user| user.login),
            state: review.state.unwrap_or_default(),
            submitted_at: review.submitted_at,
            url: review.html_url,
        })
        .collect()
}

fn fetch_activity(repo_path: &Path, owner: &str, repo: &str) -> Vec<ActivityItem> {
    let endpoint = format!("repos/{owner}/{repo}/events?per_page=20");
    let output = run_process("gh", &["api", &endpoint], repo_path, GH_TIMEOUT);

    output
        .and_then(|json| serde_json::from_str::<Vec<Value>>(&json).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|event| ActivityItem {
            id: json_string(&event, "id").unwrap_or_default(),
            kind: json_string(&event, "type").unwrap_or_default(),
            actor: event
                .get("actor")
                .and_then(|actor| json_string(actor, "login")),
            title: activity_title(&event),
            url: activity_url(&event),
            created_at: json_string(&event, "created_at"),
        })
        .collect()
}

fn activity_title(event: &Value) -> Option<String> {
    event
        .get("payload")
        .and_then(|payload| payload.get("pull_request").or_else(|| payload.get("issue")))
        .and_then(|item| json_string(item, "title"))
        .or_else(|| {
            event
                .get("payload")
                .and_then(|payload| payload.get("ref"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn activity_url(event: &Value) -> Option<String> {
    event
        .get("payload")
        .and_then(|payload| payload.get("pull_request").or_else(|| payload.get("issue")))
        .and_then(|item| json_string(item, "html_url"))
        .or_else(|| {
            event
                .get("repo")
                .and_then(|repo| json_string(repo, "url"))
                .map(|api_url| api_url.replace("api.github.com/repos", "github.com"))
        })
}

fn json_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

#[derive(Deserialize)]
struct GhAuthor {
    login: Option<String>,
}

fn run_required_process(
    program: &str,
    args: &[&str],
    repo_path: &Path,
    timeout: Duration,
) -> Result<String, AppError> {
    let mut child = Command::new(program)
        .args(args)
        .current_dir(repo_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::GitError(e.to_string()))?;

    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child
                    .wait_with_output()
                    .map_err(|e| AppError::GitError(e.to_string()))?;
                if output.status.success() {
                    return String::from_utf8(output.stdout)
                        .map_err(|e| AppError::SerializationError(e.to_string()));
                }
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(AppError::GitError(stderr.trim().to_string()));
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(AppError::GitError(format!(
                    "{program} command timed out after {}s",
                    timeout.as_secs()
                )));
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(e) => return Err(AppError::GitError(e.to_string())),
        }
    }
}

fn run_process(
    program: &str,
    args: &[&str],
    repo_path: &Path,
    timeout: Duration,
) -> Option<String> {
    let mut child = Command::new(program)
        .args(args)
        .current_dir(repo_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child.wait_with_output().ok()?;
                if !output.status.success() {
                    return None;
                }
                return String::from_utf8(output.stdout).ok();
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(_) => return None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::parse_github_remote;

    #[test]
    fn parses_github_remote_urls() {
        assert_eq!(
            parse_github_remote("git@github.com:owner/repo.git"),
            Some(("owner".to_string(), "repo".to_string()))
        );
        assert_eq!(
            parse_github_remote("https://github.com/owner/repo"),
            Some(("owner".to_string(), "repo".to_string()))
        );
        assert_eq!(
            parse_github_remote("ssh://git@github.com:443/owner/repo.git"),
            Some(("owner".to_string(), "repo".to_string()))
        );
        assert_eq!(
            parse_github_remote("https://example.com/owner/repo.git"),
            None
        );
    }
}
