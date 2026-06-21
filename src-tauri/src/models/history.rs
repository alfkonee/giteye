use serde::{Deserialize, Serialize};

use super::CommitSummary;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResetMode {
    Soft,
    Mixed,
    Hard,
}

impl ResetMode {
    pub fn as_git_flag(self) -> &'static str {
        match self {
            ResetMode::Soft => "--soft",
            ResetMode::Mixed => "--mixed",
            ResetMode::Hard => "--hard",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResetPreview {
    pub target_commit: CommitSummary,
    pub changed_files: Vec<ResetPreviewFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResetPreviewFile {
    pub status: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AmendPreview {
    pub head: CommitSummary,
    pub message: String,
    pub staged_files: Vec<ResetPreviewFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub selector: String,
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author_name: String,
    pub timestamp: String,
}
