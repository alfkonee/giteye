use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandSafety {
    pub requires_explicit_action: bool,
    pub changes_worktree: bool,
    pub rewrites_history: bool,
    pub long_running: bool,
    pub description: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BisectTerms {
    pub bad: String,
    pub good: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BisectRevision {
    pub role: String,
    pub name: String,
    pub commit: String,
    pub summary: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BisectLogEntry {
    pub command: String,
    pub revision: Option<String>,
    pub raw: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BisectState {
    pub in_progress: bool,
    pub terms: BisectTerms,
    pub start_revision: Option<String>,
    pub current_commit: Option<BisectRevision>,
    pub paths: Vec<String>,
    pub known_good: Vec<BisectRevision>,
    pub known_bad: Vec<BisectRevision>,
    pub skipped: Vec<BisectRevision>,
    pub log: Vec<BisectLogEntry>,
    pub safety: GitCommandSafety,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BisectActionSummary {
    pub command: Vec<String>,
    pub output: String,
    pub state: BisectState,
    pub safety: GitCommandSafety,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GitFsckSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitFsckIssue {
    pub severity: GitFsckSeverity,
    pub object_type: Option<String>,
    pub object_id: Option<String>,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitFsckSummary {
    pub ok: bool,
    pub exit_code: i32,
    pub command: Vec<String>,
    pub issue_count: usize,
    pub issues: Vec<GitFsckIssue>,
    pub raw_output: String,
    pub safety: GitCommandSafety,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitMaintenanceSummary {
    pub mode: String,
    pub exit_code: i32,
    pub command: Vec<String>,
    pub output: String,
    pub safety: GitCommandSafety,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GitSignatureStatus {
    Valid,
    Invalid,
    Unsigned,
    Unknown,
    Unsupported,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitSignatureSummary {
    pub target: String,
    pub object_type: String,
    pub status: GitSignatureStatus,
    pub signer: Option<String>,
    pub key_id: Option<String>,
    pub fingerprint: Option<String>,
    pub trust: Option<String>,
    pub exit_code: i32,
    pub command: Vec<String>,
    pub output: String,
    pub raw_status: Vec<String>,
    pub safety: GitCommandSafety,
}
