use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAccount {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub html_url: Option<String>,
}
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LabelSummary {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRequestSummary {
    pub login: String,
    pub kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestSummary {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub author: Option<String>,
    pub url: Option<String>,
    pub head_ref_name: Option<String>,
    pub base_ref_name: Option<String>,
    pub is_draft: bool,
    pub updated_at: Option<String>,
    pub labels: Vec<LabelSummary>,
    pub review_requests: Vec<ReviewRequestSummary>,
    pub review_decision: Option<String>,
    pub merge_state_status: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestFileDiff {
    pub path: String,
    pub additions: u64,
    pub deletions: u64,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDiff {
    pub number: u64,
    pub title: Option<String>,
    pub url: Option<String>,
    pub diff_text: String,
    pub files: Vec<PullRequestFileDiff>,
    pub comments: Vec<ReviewCommentSummary>,
    pub reviews: Vec<ReviewSummary>,
    pub check_runs: Vec<CheckRunSummary>,
    pub activity: Vec<ActivityItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCommentSummary {
    pub id: u64,
    pub author: Option<String>,
    pub path: Option<String>,
    pub line: Option<u64>,
    pub body: String,
    pub url: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckRunSummary {
    pub name: String,
    pub state: Option<String>,
    pub conclusion: Option<String>,
    pub url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSummary {
    pub author: Option<String>,
    pub state: String,
    pub submitted_at: Option<String>,
    pub url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    pub id: String,
    pub kind: String,
    pub actor: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryGithubOverview {
    pub provider_available: bool,
    pub is_github_repository: bool,
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub remote_url: Option<String>,
    pub account: Option<GitHubAccount>,
    pub pull_requests: Vec<PullRequestSummary>,
    pub check_runs: Vec<CheckRunSummary>,
    pub reviews: Vec<ReviewSummary>,
    pub activity: Vec<ActivityItem>,
}
