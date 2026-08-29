use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub short_name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    /// Committer date of the commit the ref points at, ISO-8601.
    pub last_commit_date: Option<String>,
    pub last_commit_author: Option<String>,
    pub last_commit_subject: Option<String>,
    /// When the branch first appeared in this repository (oldest reflog entry).
    /// Remote-tracking refs have no meaningful creation date and report null.
    pub created_at: Option<String>,
}

/// A local branch that is safe to prune: fully merged into HEAD and/or
/// tracking an upstream that no longer exists.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranchPruneCandidate {
    pub branch: String,
    pub fully_merged: bool,
    pub upstream_gone: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranchPruneFailure {
    pub branch: String,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LocalBranchPruneResult {
    pub deleted: Vec<String>,
    pub failed: Vec<LocalBranchPruneFailure>,
}

/// Formats a Unix timestamp (seconds) as an ISO-8601 UTC string.
pub fn unix_seconds_to_iso(seconds: i64) -> Option<String> {
    DateTime::<Utc>::from_timestamp(seconds, 0).map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}
