use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Stable lifecycle state for a GitEye-triggered background Git job.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GitJobStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Canceled,
}

/// Output stream that produced one captured Git job log line.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GitJobLogChannel {
    Stdout,
    Stderr,
}

/// One stdout/stderr line captured from a GitEye-triggered Git job.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitJobLogLine {
    pub channel: GitJobLogChannel,
    pub line: String,
    pub timestamp: DateTime<Utc>,
}

/// Full persisted record for a GitEye-triggered background Git command.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitJobRecord {
    pub job_id: String,
    pub repo_path: String,
    pub kind: String,
    pub title: String,
    pub status: GitJobStatus,
    pub command: String,
    pub args: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
    pub invalidation_reasons: Vec<String>,
    pub logs: Vec<GitJobLogLine>,
}

/// Lightweight list payload for the command log; use get_git_job for logs.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitJobSummary {
    pub job_id: String,
    pub repo_path: String,
    pub kind: String,
    pub title: String,
    pub status: GitJobStatus,
    pub command: String,
    pub args: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
    pub invalidation_reasons: Vec<String>,
    pub log_line_count: usize,
}

/// Structured Tauri event payload emitted on every background Git job transition.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitJobEvent {
    pub job_id: String,
    pub repo_path: String,
    pub kind: String,
    pub title: String,
    pub status: GitJobStatus,
    pub command: String,
    pub args: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub stream: Option<GitJobLogLine>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
    pub invalidation_reasons: Vec<String>,
}

impl GitJobRecord {
    pub fn summary(&self) -> GitJobSummary {
        GitJobSummary {
            job_id: self.job_id.clone(),
            repo_path: self.repo_path.clone(),
            kind: self.kind.clone(),
            title: self.title.clone(),
            status: self.status.clone(),
            command: self.command.clone(),
            args: self.args.clone(),
            created_at: self.created_at,
            started_at: self.started_at,
            finished_at: self.finished_at,
            exit_code: self.exit_code,
            error: self.error.clone(),
            invalidation_reasons: self.invalidation_reasons.clone(),
            log_line_count: self.logs.len(),
        }
    }

    pub fn event(&self, stream: Option<GitJobLogLine>) -> GitJobEvent {
        GitJobEvent {
            job_id: self.job_id.clone(),
            repo_path: self.repo_path.clone(),
            kind: self.kind.clone(),
            title: self.title.clone(),
            status: self.status.clone(),
            command: self.command.clone(),
            args: self.args.clone(),
            created_at: self.created_at,
            started_at: self.started_at,
            finished_at: self.finished_at,
            stream,
            exit_code: self.exit_code,
            error: self.error.clone(),
            invalidation_reasons: self.invalidation_reasons.clone(),
        }
    }
}
