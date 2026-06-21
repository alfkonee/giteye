use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::github::{
    ActivityItem, CheckRunSummary, GitHubAccount, LabelSummary, PullRequestDiff,
    PullRequestFileDiff, PullRequestSummary, RepositoryGithubOverview, ReviewCommentSummary,
    ReviewRequestSummary, ReviewSummary,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{LazyLock, Mutex};
use std::thread;
use std::time::{Duration, Instant};

static GITHUB_OVERVIEW_CACHE: LazyLock<Mutex<HashMap<String, RepositoryGithubOverview>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static GITHUB_REQUEST_GENERATIONS: LazyLock<Mutex<HashMap<String, u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const GH_TIMEOUT: Duration = Duration::from_secs(3);
const GH_AUTH_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone)]
struct GithubRequestContext {
    repo_key: String,
    generation: u64,
}
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

    let request_context = begin_github_request(repo_path);

    let head = GitCli::run(repo_path, &["rev-parse", "HEAD"])
        .ok()
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let cache_key = format!("{owner}/{repo}@{head}");

    if let Some(cached) = cached_github_overview(&cache_key) {
        return cached;
    }

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
        store_github_overview(cache_key, overview.clone());
        return overview;
    }

    let repo_path_buf = repo_path.to_path_buf();
    let owner_for_prs = owner.clone();
    let owner_for_checks = owner.clone();
    let owner_for_activity = owner.clone();
    let repo_for_prs = repo.clone();
    let repo_for_checks = repo.clone();
    let repo_for_activity = repo.clone();

    let account_handle = thread::spawn({
        let repo_path_buf = repo_path_buf.clone();
        let request_context = request_context.clone();
        move || fetch_account(&repo_path_buf, &request_context)
    });
    let pull_request_handle = thread::spawn({
        let repo_path_buf = repo_path_buf.clone();
        let request_context = request_context.clone();
        move || {
            fetch_pull_requests(
                &repo_path_buf,
                &owner_for_prs,
                &repo_for_prs,
                &request_context,
            )
        }
    });
    let check_runs_handle = thread::spawn({
        let repo_path_buf = repo_path_buf.clone();
        let request_context = request_context.clone();
        move || {
            fetch_check_runs(
                &repo_path_buf,
                &owner_for_checks,
                &repo_for_checks,
                None,
                Some(&request_context),
            )
        }
    });
    let activity_handle = thread::spawn({
        let request_context = request_context.clone();
        move || {
            fetch_activity(
                &repo_path_buf,
                &owner_for_activity,
                &repo_for_activity,
                &request_context,
            )
        }
    });

    overview.provider_available = true;
    overview.account = account_handle.join().ok().flatten();
    overview.pull_requests = pull_request_handle.join().unwrap_or_default();
    overview.check_runs = check_runs_handle
        .join()
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();
    overview.activity = activity_handle.join().unwrap_or_default();

    if !github_request_active(&request_context) {
        return overview;
    }
    if let Some(first_pr) = overview.pull_requests.first() {
        overview.reviews = fetch_reviews(
            repo_path,
            &owner,
            &repo,
            first_pr.number,
            Some(&request_context),
        )
        .unwrap_or_default();
    }

    store_github_overview(cache_key, overview.clone());
    overview
}

fn cached_github_overview(cache_key: &str) -> Option<RepositoryGithubOverview> {
    github_overview_cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(cache_key).cloned())
}

fn store_github_overview(cache_key: String, overview: RepositoryGithubOverview) {
    if let Ok(mut cache) = github_overview_cache().lock() {
        cache.insert(cache_key, overview);
    }
}

fn github_overview_cache() -> &'static Mutex<HashMap<String, RepositoryGithubOverview>> {
    &GITHUB_OVERVIEW_CACHE
}

pub fn cancel_repository_github_work(repo_path: &Path) {
    let context = begin_github_request(repo_path);
    let _ = context;
}

fn begin_github_request(repo_path: &Path) -> GithubRequestContext {
    let repo_key = canonical_repo_key(repo_path);
    let generation = if let Ok(mut generations) = github_request_generations().lock() {
        let entry = generations.entry(repo_key.clone()).or_insert(0);
        *entry += 1;
        *entry
    } else {
        0
    };

    GithubRequestContext {
        repo_key,
        generation,
    }
}

fn github_request_active(context: &GithubRequestContext) -> bool {
    github_request_generations()
        .lock()
        .ok()
        .and_then(|generations| generations.get(&context.repo_key).copied())
        .map(|generation| generation == context.generation)
        .unwrap_or(false)
}

fn github_request_generations() -> &'static Mutex<HashMap<String, u64>> {
    &GITHUB_REQUEST_GENERATIONS
}

pub fn get_pull_request_diff(repo_path: &Path, number: u64) -> Result<PullRequestDiff, AppError> {
    let (owner, repo) = github_repository(repo_path)?;
    let repository = format!("{owner}/{repo}");
    let number_string = number.to_string();
    let mut fetch_errors = Vec::new();
    let diff_text = match run_required_process(
        "gh",
        &["pr", "diff", &number_string, "--repo", &repository],
        repo_path,
        GH_TIMEOUT,
    ) {
        Ok(diff_text) => diff_text,
        Err(error) => {
            fetch_errors.push(format!("diff: {error}"));
            String::new()
        }
    };
    let files = match fetch_pull_request_files(repo_path, &owner, &repo, number) {
        Ok(files) => files,
        Err(error) => {
            fetch_errors.push(format!("files: {error}"));
            Vec::new()
        }
    };
    let comments = match fetch_review_comments(repo_path, &owner, &repo, number) {
        Ok(comments) => comments,
        Err(error) => {
            fetch_errors.push(format!("comments: {error}"));
            Vec::new()
        }
    };
    let reviews = match fetch_reviews(repo_path, &owner, &repo, number, None) {
        Ok(reviews) => reviews,
        Err(error) => {
            fetch_errors.push(format!("reviews: {error}"));
            Vec::new()
        }
    };
    let check_runs = match fetch_check_runs(repo_path, &owner, &repo, Some(number), None) {
        Ok(check_runs) => check_runs,
        Err(error) => {
            fetch_errors.push(format!("checks: {error}"));
            Vec::new()
        }
    };
    let activity = match fetch_pull_request_activity(repo_path, &owner, &repo, number) {
        Ok(activity) => activity,
        Err(error) => {
            fetch_errors.push(format!("activity: {error}"));
            Vec::new()
        }
    };
    let pr = fetch_pull_request(repo_path, &owner, &repo, number);

    Ok(PullRequestDiff {
        number,
        title: pr.as_ref().map(|pr| pr.title.clone()),
        url: pr.and_then(|pr| pr.url),
        diff_text,
        files,
        comments,
        reviews,
        check_runs,
        activity,
        fetch_error: (!fetch_errors.is_empty()).then(|| fetch_errors.join(" · ")),
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

pub fn request_pull_request_review(
    repo_path: &Path,
    number: u64,
    reviewers: &[String],
    teams: &[String],
) -> Result<(), AppError> {
    let (_, _) = github_repository(repo_path)?;
    if reviewers.is_empty() && teams.is_empty() {
        return Err(AppError::GitError(
            "At least one reviewer or team is required".to_string(),
        ));
    }

    let number_string = number.to_string();
    let mut args = vec!["pr", "edit", number_string.as_str()];
    let reviewer_flags: Vec<String> = reviewers
        .iter()
        .chain(teams.iter())
        .map(|reviewer| reviewer.trim().to_string())
        .filter(|reviewer| !reviewer.is_empty())
        .collect();

    if reviewer_flags.is_empty() {
        return Err(AppError::GitError(
            "At least one reviewer or team is required".to_string(),
        ));
    }

    for reviewer in &reviewer_flags {
        args.push("--add-reviewer");
        args.push(reviewer.as_str());
    }

    run_required_process("gh", &args, repo_path, GH_TIMEOUT)?;
    Ok(())
}

pub fn submit_pull_request_review(
    repo_path: &Path,
    number: u64,
    event: &str,
    body: Option<&str>,
) -> Result<(), AppError> {
    let (_, _) = github_repository(repo_path)?;
    let number_string = number.to_string();
    let body = body.map(str::trim).filter(|body| !body.is_empty());
    let review_flag = match event {
        "approve" => "--approve",
        "request_changes" => "--request-changes",
        "comment" => "--comment",
        _ => {
            return Err(AppError::GitError(format!(
                "Unsupported pull request review event: {event}"
            )));
        }
    };

    if review_flag != "--approve" && body.is_none() {
        return Err(AppError::GitError(
            "Review body is required for comments and change requests".to_string(),
        ));
    }

    let mut args = vec!["pr", "review", number_string.as_str(), review_flag];
    if let Some(body) = body {
        args.push("--body");
        args.push(body);
    }

    run_required_process("gh", &args, repo_path, GH_TIMEOUT)?;
    Ok(())
}

pub fn submit_pull_request_line_comment(
    repo_path: &Path,
    number: u64,
    path: &str,
    line: u64,
    side: &str,
    body: &str,
) -> Result<(), AppError> {
    let (owner, repo) = github_repository(repo_path)?;
    let path = path.trim();
    let body = body.trim();
    if path.is_empty() {
        return Err(AppError::GitError(
            "Pull request comment path is required".to_string(),
        ));
    }
    if line == 0 {
        return Err(AppError::GitError(
            "Pull request comment line must be greater than zero".to_string(),
        ));
    }
    if body.is_empty() {
        return Err(AppError::GitError(
            "Pull request line comment body is required".to_string(),
        ));
    }
    let side = normalize_review_comment_side(side)?;
    let head_oid = fetch_pull_request_head_oid(repo_path, &owner, &repo, number)?;
    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/comments");
    let line_field = format!("line={line}");
    let body_field = format!("body={body}");
    let commit_field = format!("commit_id={head_oid}");
    let path_field = format!("path={path}");
    let side_field = format!("side={side}");
    let args = [
        "api",
        "-X",
        "POST",
        endpoint.as_str(),
        "-f",
        body_field.as_str(),
        "-f",
        commit_field.as_str(),
        "-f",
        path_field.as_str(),
        "-F",
        line_field.as_str(),
        "-f",
        side_field.as_str(),
    ];

    run_required_process("gh", &args, repo_path, GH_TIMEOUT)?;
    Ok(())
}

fn normalize_review_comment_side(side: &str) -> Result<&'static str, AppError> {
    match side {
        "LEFT" | "left" => Ok("LEFT"),
        "RIGHT" | "right" => Ok("RIGHT"),
        _ => Err(AppError::GitError(format!(
            "Unsupported pull request comment side: {side}"
        ))),
    }
}

fn fetch_pull_request_head_oid(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<String, AppError> {
    let repository = format!("{owner}/{repo}");
    let number_string = number.to_string();
    let output = run_required_process(
        "gh",
        &[
            "pr",
            "view",
            &number_string,
            "--repo",
            &repository,
            "--json",
            "headRefOid",
        ],
        repo_path,
        GH_TIMEOUT,
    )?;
    let value: Value = serde_json::from_str(&output)
        .map_err(|err| AppError::SerializationError(err.to_string()))?;
    json_string(&value, "headRefOid")
        .ok_or_else(|| AppError::GitError(format!("Head commit was not returned for PR #{number}")))
}

pub fn add_pull_request_label(
    repo_path: &Path,
    number: u64,
    labels: &[String],
) -> Result<(), AppError> {
    edit_pull_request_labels(repo_path, number, "--add-label", labels)
}

pub fn remove_pull_request_label(
    repo_path: &Path,
    number: u64,
    labels: &[String],
) -> Result<(), AppError> {
    edit_pull_request_labels(repo_path, number, "--remove-label", labels)
}

fn edit_pull_request_labels(
    repo_path: &Path,
    number: u64,
    flag: &str,
    labels: &[String],
) -> Result<(), AppError> {
    let (_, _) = github_repository(repo_path)?;
    let label_list = labels
        .iter()
        .map(|label| label.trim())
        .filter(|label| !label.is_empty())
        .collect::<Vec<_>>()
        .join(",");
    if label_list.is_empty() {
        return Err(AppError::GitError(
            "At least one label is required".to_string(),
        ));
    }

    let number_string = number.to_string();
    run_required_process(
        "gh",
        &[
            "pr",
            "edit",
            number_string.as_str(),
            flag,
            label_list.as_str(),
        ],
        repo_path,
        GH_TIMEOUT,
    )?;
    Ok(())
}

pub fn merge_pull_request(
    repo_path: &Path,
    number: u64,
    method: &str,
    admin: bool,
    delete_branch: bool,
) -> Result<(), AppError> {
    let (_, _) = github_repository(repo_path)?;
    let number_string = number.to_string();
    let merge_flag = match method {
        "merge" => "--merge",
        "rebase" => "--rebase",
        _ => "--squash",
    };
    let mut args = vec![
        "pr".to_string(),
        "merge".to_string(),
        number_string,
        merge_flag.to_string(),
    ];
    if delete_branch {
        args.push("--delete-branch".to_string());
    }
    if admin {
        args.push("--admin".to_string());
    }
    let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    run_required_process("gh", &arg_refs, repo_path, GH_TIMEOUT)?;
    Ok(())
}

pub fn close_pull_request(repo_path: &Path, number: u64) -> Result<(), AppError> {
    let (_, _) = github_repository(repo_path)?;
    let number_string = number.to_string();
    run_required_process(
        "gh",
        &["pr", "close", &number_string],
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

fn fetch_account(
    repo_path: &Path,
    request_context: &GithubRequestContext,
) -> Option<GitHubAccount> {
    #[derive(Deserialize)]
    struct UserResponse {
        login: Option<String>,
        name: Option<String>,
        avatar_url: Option<String>,
        html_url: Option<String>,
    }

    let output = run_process_for_request(
        "gh",
        &["api", "user"],
        repo_path,
        GH_TIMEOUT,
        request_context,
    )?;
    let user: UserResponse = serde_json::from_str(&output).ok()?;

    Some(GitHubAccount {
        login: user.login.unwrap_or_default(),
        name: user.name,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
    })
}

fn fetch_pull_requests(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    request_context: &GithubRequestContext,
) -> Vec<PullRequestSummary> {
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
        labels: Option<Vec<GhLabel>>,
        review_requests: Option<Vec<GhReviewRequest>>,
        review_decision: Option<String>,
        merge_state_status: Option<String>,
    }

    let repository = format!("{owner}/{repo}");
    let output = run_process_for_request(
        "gh",
        &[
            "pr",
            "list",
            "--repo",
            &repository,
            "--limit",
            "20",
            "--json",
            "number,title,state,author,url,headRefName,baseRefName,isDraft,updatedAt,labels,reviewRequests,reviewDecision,mergeStateStatus",
        ],
        repo_path,
        GH_TIMEOUT,
        request_context,
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
            labels: map_labels(pr.labels),
            review_requests: map_review_requests(pr.review_requests),
            review_decision: pr.review_decision,
            merge_state_status: pr.merge_state_status,
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
        labels: Option<Vec<GhLabel>>,
        review_requests: Option<Vec<GhReviewRequest>>,
        review_decision: Option<String>,
        merge_state_status: Option<String>,
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
            "number,title,state,author,url,headRefName,baseRefName,isDraft,updatedAt,labels,reviewRequests,reviewDecision,mergeStateStatus",
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
        labels: map_labels(pr.labels),
        review_requests: map_review_requests(pr.review_requests),
        review_decision: pr.review_decision,
        merge_state_status: pr.merge_state_status,
    })
}

fn fetch_pull_request_files(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<PullRequestFileDiff>, AppError> {
    #[derive(Deserialize)]
    struct GhFile {
        filename: Option<String>,
        additions: Option<u64>,
        deletions: Option<u64>,
        status: Option<String>,
    }

    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/files?per_page=100");
    let json = run_required_process("gh", &["api", &endpoint], repo_path, GH_TIMEOUT)?;
    Ok(serde_json::from_str::<Vec<GhFile>>(&json)
        .map_err(|error| AppError::SerializationError(error.to_string()))?
        .into_iter()
        .filter_map(|file| {
            Some(PullRequestFileDiff {
                path: file.filename?,
                additions: file.additions.unwrap_or_default(),
                deletions: file.deletions.unwrap_or_default(),
                status: file.status.unwrap_or_default(),
            })
        })
        .collect())
}

fn fetch_review_comments(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<ReviewCommentSummary>, AppError> {
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
    let json = run_required_process("gh", &["api", &endpoint], repo_path, GH_TIMEOUT)?;
    Ok(serde_json::from_str::<Vec<GhComment>>(&json)
        .map_err(|error| AppError::SerializationError(error.to_string()))?
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
        .collect())
}

fn fetch_check_runs(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: Option<u64>,
    request_context: Option<&GithubRequestContext>,
) -> Result<Vec<CheckRunSummary>, AppError> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct GhCheckRun {
        name: Option<String>,
        state: Option<String>,
        link: Option<String>,
        started_at: Option<String>,
        completed_at: Option<String>,
    }

    let repository = format!("{owner}/{repo}");
    let number_string = number.map(|number| number.to_string());
    let mut args = vec!["pr", "checks"];
    if let Some(number) = number_string.as_deref() {
        args.push(number);
    }
    args.extend([
        "--repo",
        repository.as_str(),
        "--json",
        "name,state,link,startedAt,completedAt",
    ]);

    let json = if let Some(request_context) = request_context {
        run_process_for_request("gh", &args, repo_path, GH_TIMEOUT, request_context)
            .ok_or_else(|| AppError::GitError("Failed to fetch pull request checks".to_string()))?
    } else {
        run_required_process("gh", &args, repo_path, GH_TIMEOUT)?
    };

    Ok(serde_json::from_str::<Vec<GhCheckRun>>(&json)
        .map_err(|error| AppError::SerializationError(error.to_string()))?
        .into_iter()
        .map(|check| CheckRunSummary {
            name: check.name.unwrap_or_default(),
            state: check.state,
            conclusion: None,
            url: check.link,
            started_at: check.started_at,
            completed_at: check.completed_at,
        })
        .collect())
}

fn fetch_reviews(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
    request_context: Option<&GithubRequestContext>,
) -> Result<Vec<ReviewSummary>, AppError> {
    #[derive(Deserialize)]
    struct GhReview {
        user: Option<GhAuthor>,
        state: Option<String>,
        submitted_at: Option<String>,
        html_url: Option<String>,
        body: Option<String>,
    }

    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/reviews");
    let args = ["api", endpoint.as_str()];
    let json = if let Some(request_context) = request_context {
        run_process_for_request("gh", &args, repo_path, GH_TIMEOUT, request_context)
            .ok_or_else(|| AppError::GitError("Failed to fetch pull request reviews".to_string()))?
    } else {
        run_required_process("gh", &args, repo_path, GH_TIMEOUT)?
    };

    Ok(serde_json::from_str::<Vec<GhReview>>(&json)
        .map_err(|error| AppError::SerializationError(error.to_string()))?
        .into_iter()
        .map(|review| ReviewSummary {
            author: review.user.and_then(|user| user.login),
            state: review.state.unwrap_or_default(),
            submitted_at: review.submitted_at,
            body: review.body,
            url: review.html_url,
        })
        .collect())
}

fn fetch_activity(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    request_context: &GithubRequestContext,
) -> Vec<ActivityItem> {
    let endpoint = format!("repos/{owner}/{repo}/events?per_page=20");
    let output = run_process_for_request(
        "gh",
        &["api", &endpoint],
        repo_path,
        GH_TIMEOUT,
        request_context,
    );

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
fn fetch_pull_request_activity(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
) -> Result<Vec<ActivityItem>, AppError> {
    let endpoint = format!("repos/{owner}/{repo}/issues/{number}/timeline?per_page=50");
    let json = run_required_process(
        "gh",
        &[
            "api",
            "-H",
            "Accept: application/vnd.github+json",
            &endpoint,
        ],
        repo_path,
        GH_TIMEOUT,
    )?;

    Ok(serde_json::from_str::<Vec<Value>>(&json)
        .map_err(|error| AppError::SerializationError(error.to_string()))?
        .into_iter()
        .enumerate()
        .map(|(index, event)| ActivityItem {
            id: json_string(&event, "id").unwrap_or_else(|| index.to_string()),
            kind: json_string(&event, "event").unwrap_or_else(|| {
                json_string(&event, "state").unwrap_or_else(|| "timeline".to_string())
            }),
            actor: event
                .get("actor")
                .or_else(|| event.get("user"))
                .and_then(|actor| json_string(actor, "login")),
            title: timeline_title(&event),
            url: json_string(&event, "html_url"),
            created_at: json_string(&event, "created_at")
                .or_else(|| json_string(&event, "submitted_at")),
        })
        .collect())
}

fn timeline_title(event: &Value) -> Option<String> {
    json_string(event, "body")
        .or_else(|| json_string(event, "commit_id"))
        .or_else(|| json_string(event, "event"))
        .or_else(|| json_string(event, "state"))
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
#[derive(Deserialize)]
struct GhLabel {
    name: Option<String>,
    color: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhReviewRequest {
    login: Option<String>,
    slug: Option<String>,
    #[serde(rename = "__typename")]
    typename: Option<String>,
    name: Option<String>,
}

fn map_labels(labels: Option<Vec<GhLabel>>) -> Vec<LabelSummary> {
    labels
        .unwrap_or_default()
        .into_iter()
        .filter_map(|label| {
            Some(LabelSummary {
                name: label.name?,
                color: label.color,
                description: label.description,
            })
        })
        .collect()
}

fn map_review_requests(requests: Option<Vec<GhReviewRequest>>) -> Vec<ReviewRequestSummary> {
    requests
        .unwrap_or_default()
        .into_iter()
        .filter_map(|request| {
            let login = request
                .login
                .or(request.slug)
                .or(request.name)
                .filter(|login| !login.is_empty())?;
            Some(ReviewRequestSummary {
                login,
                kind: request.typename.unwrap_or_else(|| "Reviewer".to_string()),
            })
        })
        .collect()
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

fn run_process_for_request(
    program: &str,
    args: &[&str],
    repo_path: &Path,
    timeout: Duration,
    request_context: &GithubRequestContext,
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
        if !github_request_active(request_context) {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }

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

fn canonical_repo_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::{normalize_review_comment_side, parse_github_remote};

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

    #[test]
    fn normalizes_review_comment_side() {
        assert_eq!(normalize_review_comment_side("RIGHT").unwrap(), "RIGHT");
        assert_eq!(normalize_review_comment_side("left").unwrap(), "LEFT");
        assert!(normalize_review_comment_side("BOTH").is_err());
    }
}
