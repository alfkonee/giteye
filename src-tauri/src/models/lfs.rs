use super::job::GitJobSummary;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LfsStatus {
    pub available: bool,
    pub version: Option<String>,
    pub git_version: Option<String>,
    pub hooks_installed: bool,
    pub endpoint: Option<String>,
    pub local_media_dir: Option<String>,
    pub concurrent_transfers: Option<u32>,
    pub tracked_patterns: Vec<LfsTrackPattern>,
    pub files: Vec<LfsFile>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsTrackPattern {
    pub pattern: String,
    pub source: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsFile {
    pub oid: String,
    pub size: Option<String>,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LfsLock {
    pub id: String,
    pub path: String,
    pub owner: Option<String>,
    pub locked_at: Option<String>,
    pub ours: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsLocks {
    pub ours: Vec<LfsLock>,
    pub theirs: Vec<LfsLock>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsCommandPreview {
    pub command: Vec<String>,
    pub lines: Vec<String>,
    pub destructive: bool,
    pub description: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LfsMigrationStart {
    pub backup_branch: String,
    pub job: GitJobSummary,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LfsTransferOperation {
    Fetch,
    Pull,
    Push,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LfsTransferRequest {
    pub operation: LfsTransferOperation,
    pub remote: Option<String>,
    pub reference: Option<String>,
    pub include: Option<String>,
    pub exclude: Option<String>,
    pub all: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsPruneRequest {
    pub verify_remote: bool,
    pub force: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LfsMigrationMode {
    Import,
    Export,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LfsMigrationRequest {
    pub mode: LfsMigrationMode,
    pub include: String,
    pub exclude: Option<String>,
    pub include_refs: Vec<String>,
    pub everything: bool,
    pub remote: Option<String>,
}
