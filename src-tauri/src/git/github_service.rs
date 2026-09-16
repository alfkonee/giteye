use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::github::{
    ActivityItem, BranchPullRequestMatch, CheckRunSummary, GitHubAccount, LabelSummary,
    PullRequestDiff, PullRequestFileDiff, PullRequestSummary, RepositoryGithubOverview,
    ReviewCommentSummary, ReviewRequestSummary, ReviewSummary,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, LazyLock, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const MAX_GH_STDERR_BYTES: usize = 256 * 1024;

static GITHUB_OVERVIEW_CACHE: LazyLock<Mutex<HashMap<String, RepositoryGithubOverview>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static GITHUB_REQUEST_GENERATIONS: LazyLock<Mutex<HashMap<String, u64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Cost class of a `gh` invocation. Drives the timeout budget and retry policy,
/// so a large `pr diff` is no longer killed by the same 3s budget as a `pr list`.
#[derive(Clone, Copy)]
enum GhOp {
    /// Light authentication probes (`gh auth status`): no retry, short budget.
    Auth,
    /// Read-only list/view/api calls: safe to retry on timeout.
    Read,
    /// Large-payload reads (`gh pr diff`): longest budget, retried on timeout.
    Diff,
    /// Mutating calls (merge, review, comment, close): no retry to avoid double-apply.
    Mutation,
}

impl GhOp {
    fn timeout(self) -> Duration {
        match self {
            Self::Auth => Duration::from_secs(2),
            Self::Read => Duration::from_secs(6),
            Self::Diff => Duration::from_secs(12),
            Self::Mutation => Duration::from_secs(10),
        }
    }

    fn retries(self) -> u32 {
        match self {
            Self::Auth | Self::Mutation => 0,
            Self::Read | Self::Diff => 2,
        }
    }

    fn stdout_limit(self) -> usize {
        match self {
            Self::Auth => 256 * 1024,
            Self::Read => 8 * 1024 * 1024,
            Self::Diff => 16 * 1024 * 1024,
            Self::Mutation => 4 * 1024 * 1024,
        }
    }
}

/// Terminal failure of a single `gh` process, before retry is considered.
#[derive(Debug)]
enum GhRunError {
    /// The process exceeded its deadline.
    Timeout,
    /// The request generation advanced (user navigated away): do not retry.
    Cancelled,
    /// stdout or stderr exceeded its operation-specific retention cap.
    OutputLimit { stream: &'static str, limit: usize },
    /// The process exited non-zero; stderr trimmed.
    NonZero(String),
    /// Spawn/io failure.
    Spawn(String),
}

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
    if let Some(first_pr) = overview
        .pull_requests
        .iter()
        .find(|pr| pr.state.eq_ignore_ascii_case("open"))
    {
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

fn clear_github_overview_cache(owner: &str, repo: &str) {
    let cache_key_prefix = format!("{owner}/{repo}@");
    if let Ok(mut cache) = github_overview_cache().lock() {
        cache.retain(|cache_key, _| !cache_key.starts_with(&cache_key_prefix));
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
        GhOp::Diff,
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
    let (body, created_at, author_association, author, author_avatar_url) =
        fetch_pull_request_detail(repo_path, &owner, &repo, number)
            .unwrap_or((None, None, None, None, None));

    Ok(PullRequestDiff {
        number,
        title: pr.as_ref().map(|pr| pr.title.clone()),
        url: pr.and_then(|pr| pr.url),
        body,
        author,
        author_avatar_url,
        author_association,
        created_at,
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
    let (owner, repo) = github_repository(repo_path)?;
    let number_string = number.to_string();
    run_required_process(
        "gh",
        &["pr", "checkout", &number_string],
        repo_path,
        GhOp::Mutation,
    )?;
    clear_github_overview_cache(&owner, &repo);
    Ok(())
}

pub fn update_pull_request_branch(repo_path: &Path, number: u64) -> Result<(), AppError> {
    let (owner, repo) = github_repository(repo_path)?;
    let number_string = number.to_string();
    run_required_process(
        "gh",
        &["pr", "update-branch", &number_string],
        repo_path,
        GhOp::Mutation,
    )?;
    clear_github_overview_cache(&owner, &repo);
    Ok(())
}

pub fn request_pull_request_review(
    repo_path: &Path,
    number: u64,
    reviewers: &[String],
    teams: &[String],
) -> Result<(), AppError> {
    let (owner, repo) = github_repository(repo_path)?;
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

    run_required_process("gh", &args, repo_path, GhOp::Mutation)?;
    clear_github_overview_cache(&owner, &repo);
    Ok(())
}

pub fn submit_pull_request_review(
    repo_path: &Path,
    number: u64,
    event: &str,
    body: Option<&str>,
) -> Result<(), AppError> {
    let (owner, repo) = github_repository(repo_path)?;
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

    run_required_process("gh", &args, repo_path, GhOp::Mutation)?;
    clear_github_overview_cache(&owner, &repo);
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

    run_required_process("gh", &args, repo_path, GhOp::Mutation)?;
    clear_github_overview_cache(&owner, &repo);
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
        GhOp::Read,
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
    let (owner, repo) = github_repository(repo_path)?;
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
        GhOp::Mutation,
    )?;
    clear_github_overview_cache(&owner, &repo);
    Ok(())
}

pub fn merge_pull_request(
    repo_path: &Path,
    number: u64,
    method: &str,
    admin: bool,
    delete_branch: bool,
) -> Result<(), AppError> {
    let (owner, repo) = github_repository(repo_path)?;
    let number_string = number.to_string();
    let merge_flag = merge_method_flag(method)?;
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
    run_required_process("gh", &arg_refs, repo_path, GhOp::Mutation)?;
    clear_github_overview_cache(&owner, &repo);
    Ok(())
}

fn merge_method_flag(method: &str) -> Result<&'static str, AppError> {
    match method {
        "merge" => Ok("--merge"),
        "rebase" => Ok("--rebase"),
        "squash" => Ok("--squash"),
        _ => Err(AppError::GitError(format!(
            "Unsupported pull request merge method: {method}"
        ))),
    }
}

pub fn close_pull_request(repo_path: &Path, number: u64) -> Result<(), AppError> {
    let (owner, repo) = github_repository(repo_path)?;
    let number_string = number.to_string();
    run_required_process(
        "gh",
        &["pr", "close", &number_string],
        repo_path,
        GhOp::Mutation,
    )?;
    clear_github_overview_cache(&owner, &repo);
    Ok(())
}

pub fn create_pull_request(
    repo_path: &Path,
    head: &str,
    base: Option<&str>,
    title: &str,
    body: Option<&str>,
    draft: bool,
) -> Result<String, AppError> {
    let (owner, repo) = github_repository(repo_path)?;
    let mut args: Vec<String> = vec![
        "pr".to_string(),
        "create".to_string(),
        "--head".to_string(),
        head.to_string(),
        "--title".to_string(),
        title.to_string(),
    ];
    if let Some(base) = base {
        args.push("--base".to_string());
        args.push(base.to_string());
    }
    if let Some(body) = body {
        args.push("--body".to_string());
        args.push(body.to_string());
    }
    if draft {
        args.push("--draft".to_string());
    }
    let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    let output = run_required_process("gh", &arg_refs, repo_path, GhOp::Mutation)?;
    clear_github_overview_cache(&owner, &repo);
    Ok(output.trim().to_string())
}

/// Resolve the selected ref, not the checked-out branch or an arbitrary same-name fork.
fn branch_head_identity(
    repo_path: &Path,
    branch_ref: &str,
) -> Result<(String, String, String), AppError> {
    GitCli::run(repo_path, &["show-ref", "--verify", "--quiet", branch_ref])?;
    let (remote, head) = if let Some(local) = branch_ref.strip_prefix("refs/heads/") {
        let tracking = GitCli::run(
            repo_path,
            &[
                "for-each-ref",
                "--format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref)",
                branch_ref,
            ],
        )?;
        let fields = tracking
            .lines()
            .find_map(|line| {
                let fields: Vec<_> = line.split('\0').collect();
                (fields.len() == 3 && fields[0] == branch_ref).then_some(fields)
            })
            .ok_or_else(|| AppError::GitError("Selected branch no longer exists".to_string()))?;
        if fields[1].is_empty() {
            ("origin".to_string(), local.to_string())
        } else {
            let head = fields[2].strip_prefix("refs/heads/").ok_or_else(|| {
                AppError::GitError("The branch does not track a GitHub branch".to_string())
            })?;
            (fields[1].to_string(), head.to_string())
        }
    } else if let Some(remote_ref) = branch_ref.strip_prefix("refs/remotes/") {
        let remotes = GitCli::run(repo_path, &["remote"])?;
        let (remote, head) = split_remote_branch(remote_ref, &remotes).ok_or_else(|| {
            AppError::GitError("Unable to identify the selected branch's remote".to_string())
        })?;
        (remote.to_string(), head.to_string())
    } else {
        return Err(AppError::GitError(
            "Select a local or remote branch".to_string(),
        ));
    };
    let url = GitCli::run(repo_path, &["remote", "get-url", &remote])?;
    let (owner, repo) = parse_github_remote(url.trim())
        .ok_or_else(|| AppError::GitError(format!("Remote {remote} is not a GitHub repository")))?;
    Ok((owner, repo, head))
}

fn split_remote_branch<'a>(remote_ref: &'a str, remotes: &'a str) -> Option<(&'a str, &'a str)> {
    remotes
        .lines()
        .filter_map(|remote| {
            let head = remote_ref.strip_prefix(remote)?.strip_prefix('/')?;
            (!head.is_empty()).then_some((remote, head))
        })
        .max_by_key(|(remote, _)| remote.len())
}

#[derive(Deserialize)]
struct BranchPullRequestRepository {
    full_name: String,
}

#[derive(Deserialize)]
struct BranchPullRequestHead {
    #[serde(rename = "ref")]
    ref_name: String,
    repo: Option<BranchPullRequestRepository>,
}

#[derive(Deserialize)]
struct BranchPullRequest {
    number: u64,
    title: String,
    state: String,
    merged_at: Option<String>,
    user: Option<GhAuthor>,
    html_url: Option<String>,
    head: BranchPullRequestHead,
    base: BranchPullRequestHead,
    #[serde(default)]
    draft: bool,
    updated_at: Option<String>,
    labels: Option<Vec<GhLabel>>,
    requested_reviewers: Option<Vec<GhAuthor>>,
}

fn matching_branch_pull_requests(
    pages: Vec<Vec<BranchPullRequest>>,
    head_repository: &str,
    head_branch: &str,
    review_repository: &str,
) -> Vec<BranchPullRequestMatch> {
    pages
        .into_iter()
        .flatten()
        .filter(|pr| {
            pr.state.eq_ignore_ascii_case("open")
                && pr.merged_at.is_none()
                && pr.head.ref_name == head_branch
                && pr
                    .head
                    .repo
                    .as_ref()
                    .is_some_and(|repo| repo.full_name.eq_ignore_ascii_case(head_repository))
        })
        .filter_map(|pr| {
            let base_repository = pr.base.repo?.full_name;
            Some(BranchPullRequestMatch {
                review_in_app: base_repository.eq_ignore_ascii_case(review_repository),
                base_repository,
                pull_request: PullRequestSummary {
                    number: pr.number,
                    title: pr.title,
                    state: pr.state,
                    author: pr.user.and_then(|user| user.login),
                    url: pr.html_url,
                    head_ref_name: Some(pr.head.ref_name),
                    base_ref_name: Some(pr.base.ref_name),
                    is_draft: pr.draft,
                    updated_at: pr.updated_at,
                    labels: map_labels(pr.labels),
                    review_requests: pr
                        .requested_reviewers
                        .unwrap_or_default()
                        .into_iter()
                        .filter_map(|user| user.login)
                        .map(|login| ReviewRequestSummary {
                            login,
                            kind: "user".to_string(),
                        })
                        .collect(),
                    ..PullRequestSummary::default()
                },
            })
        })
        .collect()
}

pub fn get_branch_pull_requests(
    repo_path: &Path,
    branch_ref: &str,
) -> Result<Vec<BranchPullRequestMatch>, AppError> {
    let (head_owner, head_repo, head_branch) = branch_head_identity(repo_path, branch_ref)?;
    let (owner, repo) = github_repository(repo_path)?;
    let review_repository = format!("{owner}/{repo}");
    let repository_endpoint = format!("repos/{review_repository}");
    let parent = run_required_process(
        "gh",
        &[
            "api",
            &repository_endpoint,
            "--hostname",
            "github.com",
            "--jq",
            ".parent.full_name // empty",
        ],
        repo_path,
        GhOp::Read,
    )?;
    let head_filter = format!("head={head_owner}:{head_branch}");
    let head_repository = format!("{head_owner}/{head_repo}");
    let mut targets = vec![review_repository.as_str()];
    if !parent.trim().is_empty() && !parent.trim().eq_ignore_ascii_case(&review_repository) {
        targets.push(parent.trim());
    }
    let mut matches = Vec::new();
    // The overview is deliberately bounded. Search both this repository and a
    // fork's parent without quotas, and keep their distinct navigation targets.
    for target in targets {
        let endpoint = format!("repos/{target}/pulls");
        let output = run_required_process(
            "gh",
            &[
                "api",
                &endpoint,
                "--hostname",
                "github.com",
                "--method",
                "GET",
                "--paginate",
                "--slurp",
                "-f",
                "state=open",
                "-f",
                "per_page=100",
                "-f",
                &head_filter,
            ],
            repo_path,
            GhOp::Read,
        )?;
        let pages = serde_json::from_str(&output).map_err(|error| {
            AppError::GitError(format!("Unable to read branch pull requests: {error}"))
        })?;
        matches.extend(matching_branch_pull_requests(
            pages,
            &head_repository,
            &head_branch,
            &review_repository,
        ));
    }
    Ok(matches)
}

pub fn get_pull_request_summary(
    repo_path: &Path,
    number: u64,
) -> Result<PullRequestSummary, AppError> {
    let (owner, repo) = github_repository(repo_path)?;
    fetch_pull_request(repo_path, &owner, &repo, number)
        .ok_or_else(|| AppError::GitError(format!("Unable to load pull request #{number}")))
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
        GhOp::Auth,
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
        GhOp::Read,
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
    let fetch_state = |state: &str, limit: &str| {
        run_process_for_request(
            "gh",
            &[
                "pr",
                "list",
                "--repo",
                &repository,
                "--limit",
                limit,
                "--state",
                state,
                "--json",
                "number,title,state,author,url,headRefName,baseRefName,isDraft,updatedAt,labels,reviewRequests,reviewDecision,mergeStateStatus",
            ],
            repo_path,
            GhOp::Read,
            request_context,
        )
        .and_then(|json| serde_json::from_str::<Vec<GhPullRequest>>(&json).ok())
        .unwrap_or_default()
    };

    // Separate quotas prevent a busy closed history from pushing open PRs out
    // of the bounded overview. GitHub/gh's `closed` state includes merged PRs.
    fetch_state("open", "20")
        .into_iter()
        .chain(fetch_state("closed", "30"))
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
        GhOp::Read,
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

fn fetch_pull_request_detail(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    number: u64,
) -> Option<(
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
)> {
    #[derive(Deserialize)]
    struct GhPullRequestDetail {
        body: Option<String>,
        created_at: Option<String>,
        author_association: Option<String>,
        user: Option<GhAuthor>,
    }

    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}");
    let output = run_process("gh", &["api", &endpoint], repo_path, GhOp::Read)?;
    let detail = serde_json::from_str::<GhPullRequestDetail>(&output).ok()?;
    Some((
        detail.body,
        detail.created_at,
        detail.author_association,
        detail.user.as_ref().and_then(|user| user.login.clone()),
        detail.user.and_then(|user| user.avatar_url),
    ))
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
    let json = run_required_process("gh", &["api", &endpoint], repo_path, GhOp::Read)?;
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
        author_association: Option<String>,
        path: Option<String>,
        line: Option<u64>,
        body: Option<String>,
        html_url: Option<String>,
        created_at: Option<String>,
    }

    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/comments?per_page=100");
    let json = run_required_process("gh", &["api", &endpoint], repo_path, GhOp::Read)?;
    Ok(serde_json::from_str::<Vec<GhComment>>(&json)
        .map_err(|error| AppError::SerializationError(error.to_string()))?
        .into_iter()
        .map(|comment| ReviewCommentSummary {
            id: comment.id.unwrap_or_default(),
            author: comment.user.as_ref().and_then(|user| user.login.clone()),
            avatar_url: comment.user.and_then(|user| user.avatar_url),
            author_association: comment.author_association,
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
        bucket: Option<String>,
        workflow: Option<String>,
        event: Option<String>,
        description: Option<String>,
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
        "name,state,bucket,workflow,event,description,link,startedAt,completedAt",
    ]);

    let json = if let Some(request_context) = request_context {
        run_process_for_request("gh", &args, repo_path, GhOp::Read, request_context)
            .ok_or_else(|| AppError::GitError("Failed to fetch pull request checks".to_string()))?
    } else {
        run_required_process("gh", &args, repo_path, GhOp::Read)?
    };

    Ok(serde_json::from_str::<Vec<GhCheckRun>>(&json)
        .map_err(|error| AppError::SerializationError(error.to_string()))?
        .into_iter()
        .map(|check| CheckRunSummary {
            name: check.name.unwrap_or_default(),
            state: check.state,
            conclusion: None,
            bucket: check.bucket,
            workflow: check.workflow,
            event: check.event,
            description: check.description,
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
        author_association: Option<String>,
        state: Option<String>,
        submitted_at: Option<String>,
        html_url: Option<String>,
        body: Option<String>,
    }

    let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/reviews");
    let args = ["api", endpoint.as_str()];
    let json = if let Some(request_context) = request_context {
        run_process_for_request("gh", &args, repo_path, GhOp::Read, request_context)
            .ok_or_else(|| AppError::GitError("Failed to fetch pull request reviews".to_string()))?
    } else {
        run_required_process("gh", &args, repo_path, GhOp::Read)?
    };

    Ok(serde_json::from_str::<Vec<GhReview>>(&json)
        .map_err(|error| AppError::SerializationError(error.to_string()))?
        .into_iter()
        .map(|review| ReviewSummary {
            author: review.user.as_ref().and_then(|user| user.login.clone()),
            avatar_url: review.user.and_then(|user| user.avatar_url),
            author_association: review.author_association,
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
        GhOp::Read,
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
            avatar_url: event
                .get("actor")
                .and_then(|actor| json_string(actor, "avatar_url")),
            author_association: json_string(&event, "author_association"),
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
        GhOp::Read,
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
            avatar_url: event
                .get("actor")
                .or_else(|| event.get("user"))
                .and_then(|actor| json_string(actor, "avatar_url")),
            author_association: json_string(&event, "author_association"),
            title: timeline_title(&event),
            url: json_string(&event, "html_url"),
            created_at: json_string(&event, "created_at")
                .or_else(|| json_string(&event, "submitted_at")),
        })
        .collect())
}

fn timeline_title(event: &Value) -> Option<String> {
    let kind = json_string(event, "event").unwrap_or_default();
    match kind.as_str() {
        "commented" | "reviewed" => json_string(event, "body"),
        "labeled" => {
            nested_string(event, "label", "name").map(|name| format!("added the {name} label"))
        }
        "unlabeled" => {
            nested_string(event, "label", "name").map(|name| format!("removed the {name} label"))
        }
        "review_requested" => nested_string(event, "requested_reviewer", "login")
            .or_else(|| nested_string(event, "requested_team", "name"))
            .map(|who| format!("requested review from {who}")),
        "review_request_removed" => nested_string(event, "requested_reviewer", "login")
            .or_else(|| nested_string(event, "requested_team", "name"))
            .map(|who| format!("removed request for review from {who}")),
        "renamed" => match (
            nested_string(event, "rename", "from"),
            nested_string(event, "rename", "to"),
        ) {
            (Some(from), Some(to)) => Some(format!("changed the title from {from} to {to}")),
            _ => Some("changed the title".to_string()),
        },
        "merged" => {
            json_string(event, "commit_id").map(|sha| format!("merged commit {}", short_sha(&sha)))
        }
        "head_ref_force_pushed" => json_string(event, "ref")
            .map(|reference| format!("force-pushed the {} branch", trim_ref(&reference))),
        "head_ref_deleted" => json_string(event, "ref")
            .map(|reference| format!("deleted the {} branch", trim_ref(&reference))),
        "head_ref_restored" => json_string(event, "ref")
            .map(|reference| format!("restored the {} branch", trim_ref(&reference))),
        "closed" => Some("closed this pull request".to_string()),
        "reopened" => Some("reopened this pull request".to_string()),
        "converted_to_draft" => Some("marked this pull request as draft".to_string()),
        "ready_for_review" => Some("marked this pull request as ready for review".to_string()),
        "committed" => {
            json_string(event, "commit_id").map(|sha| format!("added commit {}", short_sha(&sha)))
        }
        "referenced" | "cross-referenced" => json_string(event, "commit_id")
            .map(|sha| format!("referenced this pull request in {}", short_sha(&sha))),
        "subscribed" | "unsubscribed" => None,
        _ => json_string(event, "commit_id")
            .or_else(|| json_string(event, "event"))
            .or_else(|| json_string(event, "state")),
    }
}

fn nested_string(value: &Value, key: &str, nested: &str) -> Option<String> {
    value.get(key).and_then(|item| json_string(item, nested))
}

fn short_sha(sha: &str) -> String {
    if sha.len() > 7 {
        sha[..7].to_string()
    } else {
        sha.to_string()
    }
}

fn trim_ref(value: &str) -> String {
    value
        .strip_prefix("refs/heads/")
        .unwrap_or(value)
        .to_string()
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
    avatar_url: Option<String>,
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
    op: GhOp,
) -> Result<String, AppError> {
    run_gh(program, args, repo_path, op, None).map_err(|error| gh_error_to_app(program, op, error))
}

fn run_process(program: &str, args: &[&str], repo_path: &Path, op: GhOp) -> Option<String> {
    run_gh(program, args, repo_path, op, None).ok()
}

fn run_process_for_request(
    program: &str,
    args: &[&str],
    repo_path: &Path,
    op: GhOp,
    request_context: &GithubRequestContext,
) -> Option<String> {
    run_gh(program, args, repo_path, op, Some(request_context)).ok()
}

fn gh_error_to_app(program: &str, op: GhOp, error: GhRunError) -> AppError {
    match error {
        GhRunError::Timeout => AppError::GitError(format!(
            "{program} command timed out after {}s",
            op.timeout().as_secs()
        )),
        GhRunError::Cancelled => AppError::GitError(format!("{program} request was cancelled")),
        GhRunError::OutputLimit { stream, limit } => {
            let display_limit = if limit >= 1024 * 1024 {
                format!("{} MiB", limit / (1024 * 1024))
            } else {
                format!("{} KiB", limit / 1024)
            };
            AppError::GitError(format!(
                "{program} {stream} exceeded the {display_limit} output limit"
            ))
        }
        GhRunError::NonZero(stderr) => AppError::GitError(stderr),
        GhRunError::Spawn(message) => AppError::GitError(message),
    }
}

/// Runs `gh` with a per-operation timeout and bounded retry.
///
/// Only `Timeout` failures are retried (a deadline is the transient case); a
/// non-zero exit or a stale generation returns immediately, so mutations are
/// never double-applied and a cancelled background refresh never restarts.
fn run_gh(
    program: &str,
    args: &[&str],
    repo_path: &Path,
    op: GhOp,
    request_context: Option<&GithubRequestContext>,
) -> Result<String, GhRunError> {
    let timeout = op.timeout();
    let retries = op.retries();
    let mut last_error = GhRunError::Timeout;

    for attempt in 0..=retries {
        match run_gh_once(
            program,
            args,
            repo_path,
            timeout,
            op.stdout_limit(),
            request_context,
        ) {
            Ok(output) => return Ok(output),
            Err(GhRunError::Timeout) if attempt < retries => {
                last_error = GhRunError::Timeout;
                thread::sleep(backoff_delay(attempt));
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error)
}

fn backoff_delay(attempt: u32) -> Duration {
    Duration::from_millis(150 * (1u64 << attempt))
}

#[derive(Debug)]
struct BoundedPipe {
    bytes: Vec<u8>,
    truncated: bool,
}

fn spawn_pipe_reader<R: Read + Send + 'static>(
    mut pipe: R,
    limit: usize,
    limit_reached: Arc<AtomicBool>,
) -> JoinHandle<std::io::Result<BoundedPipe>> {
    thread::spawn(move || {
        let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
        let mut truncated = false;
        let mut chunk = [0u8; 16 * 1024];
        loop {
            let read = pipe.read(&mut chunk)?;
            if read == 0 {
                break;
            }
            let remaining = limit.saturating_sub(bytes.len());
            let kept = remaining.min(read);
            bytes.extend_from_slice(&chunk[..kept]);
            if kept < read {
                truncated = true;
                limit_reached.store(true, Ordering::Release);
            }
        }
        Ok(BoundedPipe { bytes, truncated })
    })
}

fn join_pipe_reader(
    reader: JoinHandle<std::io::Result<BoundedPipe>>,
    stream: &str,
) -> Result<BoundedPipe, GhRunError> {
    reader
        .join()
        .map_err(|_| GhRunError::Spawn(format!("gh {stream} reader panicked")))?
        .map_err(|error| GhRunError::Spawn(format!("failed to read gh {stream}: {error}")))
}

fn run_gh_once(
    program: &str,
    args: &[&str],
    repo_path: &Path,
    timeout: Duration,
    stdout_limit: usize,
    request_context: Option<&GithubRequestContext>,
) -> Result<String, GhRunError> {
    let mut command = Command::new(program);
    GitCli::configure_command_environment(&mut command);
    let mut child = command
        .args(args)
        .current_dir(repo_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| GhRunError::Spawn(e.to_string()))?;
    let stdout_limit_reached = Arc::new(AtomicBool::new(false));
    let stderr_limit_reached = Arc::new(AtomicBool::new(false));
    let stdout_reader = spawn_pipe_reader(
        child
            .stdout
            .take()
            .ok_or_else(|| GhRunError::Spawn("gh stdout unavailable".to_string()))?,
        stdout_limit,
        Arc::clone(&stdout_limit_reached),
    );
    let stderr_reader = spawn_pipe_reader(
        child
            .stderr
            .take()
            .ok_or_else(|| GhRunError::Spawn("gh stderr unavailable".to_string()))?,
        MAX_GH_STDERR_BYTES,
        Arc::clone(&stderr_limit_reached),
    );

    let deadline = Instant::now() + timeout;
    loop {
        if let Some(request_context) = request_context {
            if !github_request_active(request_context) {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GhRunError::Cancelled);
            }
        }
        if stdout_limit_reached.load(Ordering::Acquire)
            || stderr_limit_reached.load(Ordering::Acquire)
        {
            let stream = if stdout_limit_reached.load(Ordering::Acquire) {
                "stdout"
            } else {
                "stderr"
            };
            let limit = if stream == "stdout" {
                stdout_limit
            } else {
                MAX_GH_STDERR_BYTES
            };
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(GhRunError::OutputLimit { stream, limit });
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = join_pipe_reader(stdout_reader, "stdout")?;
                let stderr = join_pipe_reader(stderr_reader, "stderr")?;
                if stdout.truncated {
                    return Err(GhRunError::OutputLimit {
                        stream: "stdout",
                        limit: stdout_limit,
                    });
                }
                if stderr.truncated {
                    return Err(GhRunError::OutputLimit {
                        stream: "stderr",
                        limit: MAX_GH_STDERR_BYTES,
                    });
                }
                if status.success() {
                    return String::from_utf8(stdout.bytes)
                        .map_err(|e| GhRunError::Spawn(e.to_string()));
                }
                return Err(GhRunError::NonZero(
                    String::from_utf8_lossy(&stderr.bytes).trim().to_string(),
                ));
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GhRunError::Timeout);
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GhRunError::Spawn(e.to_string()));
            }
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
    use super::{
        cached_github_overview, clear_github_overview_cache, join_pipe_reader,
        matching_branch_pull_requests, merge_method_flag, normalize_review_comment_side,
        parse_github_remote, spawn_pipe_reader, split_remote_branch, store_github_overview,
    };
    use crate::errors::AppError;
    use crate::models::github::RepositoryGithubOverview;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    #[test]
    fn branch_lookup_excludes_unrelated_forks_and_closed_prs_but_keeps_ambiguous_open_matches() {
        let pr = |number, repository: Option<&str>, branch, state, merged: Option<&str>, base| {
            serde_json::json!({
                "number": number, "title": "Branch change", "state": state, "merged_at": merged,
                "head": { "ref": branch, "repo": repository.map(|name| serde_json::json!({ "full_name": name })) },
                "base": { "ref": base, "repo": { "full_name": "upstream/project" } }
            })
        };
        let pages = serde_json::from_value(serde_json::json!([
            [
                pr(
                    1,
                    Some("alice/project"),
                    "feature/login",
                    "open",
                    None,
                    "main"
                ),
                pr(
                    2,
                    Some("bob/project"),
                    "feature/login",
                    "open",
                    None,
                    "main"
                ),
                pr(
                    3,
                    Some("alice/unrelated"),
                    "feature/login",
                    "open",
                    None,
                    "main"
                ),
                pr(
                    4,
                    Some("alice/project"),
                    "feature/login",
                    "closed",
                    None,
                    "main"
                )
            ],
            [
                pr(
                    5,
                    Some("alice/project"),
                    "feature/login",
                    "open",
                    Some("2026-01-01"),
                    "main"
                ),
                pr(6, None, "feature/login", "open", None, "main"),
                pr(
                    7,
                    Some("alice/project"),
                    "Feature/login",
                    "open",
                    None,
                    "main"
                ),
                pr(
                    8,
                    Some("ALICE/Project"),
                    "feature/login",
                    "open",
                    None,
                    "release"
                )
            ]
        ]))
        .unwrap();
        let matches = matching_branch_pull_requests(
            pages,
            "alice/project",
            "feature/login",
            "UPSTREAM/Project",
        );
        assert_eq!(
            matches
                .iter()
                .map(|pr| pr.pull_request.number)
                .collect::<Vec<_>>(),
            vec![1, 8]
        );
        assert_eq!(
            matches[1].pull_request.base_ref_name.as_deref(),
            Some("release")
        );
        assert!(matches.iter().all(|pr| pr.review_in_app));
    }

    #[test]
    fn fork_parent_pr_keeps_its_url_instead_of_aliasing_an_origin_pr_with_the_same_number() {
        let pages = serde_json::from_value(serde_json::json!([[
            {
                "number": 42, "title": "Local PR", "state": "open",
                "head": { "ref": "feature", "repo": { "full_name": "alice/project" } },
                "base": { "ref": "main", "repo": { "full_name": "alice/project" } },
                "html_url": "https://github.com/alice/project/pull/42"
            },
            {
                "number": 42, "title": "Upstream PR", "state": "open",
                "head": { "ref": "feature", "repo": { "full_name": "alice/project" } },
                "base": { "ref": "main", "repo": { "full_name": "upstream/project" } },
                "html_url": "https://github.com/upstream/project/pull/42"
            }
        ]]))
        .unwrap();
        let matches =
            matching_branch_pull_requests(pages, "alice/project", "feature", "alice/project");
        assert!(matches[0].review_in_app);
        assert!(!matches[1].review_in_app);
        assert_eq!(matches[1].base_repository, "upstream/project");
        assert_eq!(
            matches[1].pull_request.url.as_deref(),
            Some("https://github.com/upstream/project/pull/42")
        );
    }

    #[test]
    fn remote_branch_identity_preserves_slashes_and_prefers_the_complete_remote_name() {
        let remotes = "origin\nteam\nteam/fork\n";
        assert_eq!(
            split_remote_branch("team/fork/feature/login", remotes),
            Some(("team/fork", "feature/login"))
        );
        assert_eq!(
            split_remote_branch("origin/feature/login", remotes),
            Some(("origin", "feature/login"))
        );
        assert_eq!(
            split_remote_branch("origin-other/feature/login", remotes),
            None
        );
    }

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

    #[test]
    fn pipe_reader_drains_but_retains_only_the_limit() {
        let limit_reached = Arc::new(AtomicBool::new(false));
        let reader = spawn_pipe_reader(
            std::io::Cursor::new(vec![b'x'; 1024]),
            64,
            Arc::clone(&limit_reached),
        );
        let captured = join_pipe_reader(reader, "test").expect("bounded capture");

        assert_eq!(captured.bytes.len(), 64);
        assert!(captured.truncated);
        assert!(limit_reached.load(Ordering::Acquire));
    }

    #[test]
    fn validates_pull_request_merge_methods() {
        assert_eq!(merge_method_flag("merge").unwrap(), "--merge");
        assert_eq!(merge_method_flag("rebase").unwrap(), "--rebase");
        assert_eq!(merge_method_flag("squash").unwrap(), "--squash");

        let error = merge_method_flag("fast-forward").expect_err("unsupported method rejected");
        assert!(
            matches!(error, AppError::GitError(message) if message.contains("Unsupported pull request merge method"))
        );
    }

    #[test]
    fn clears_github_overview_cache_for_repository_only() {
        store_github_overview(
            "giteye-cache-owner/giteye-cache-repo@abc".to_string(),
            RepositoryGithubOverview::default(),
        );
        store_github_overview(
            "giteye-cache-owner/giteye-cache-repo@def".to_string(),
            RepositoryGithubOverview::default(),
        );
        store_github_overview(
            "giteye-cache-owner/other-repo@abc".to_string(),
            RepositoryGithubOverview::default(),
        );

        clear_github_overview_cache("giteye-cache-owner", "giteye-cache-repo");

        assert!(cached_github_overview("giteye-cache-owner/giteye-cache-repo@abc").is_none());
        assert!(cached_github_overview("giteye-cache-owner/giteye-cache-repo@def").is_none());
        assert!(cached_github_overview("giteye-cache-owner/other-repo@abc").is_some());

        clear_github_overview_cache("giteye-cache-owner", "other-repo");
    }
}
