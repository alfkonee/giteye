use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub name: String,
    pub index: u32,
    pub branch: Option<String>,
    pub message: String,
    pub commit_hash: String,
    pub short_hash: String,
    pub timestamp: Option<String>,
    pub base_commit_hash: String,
    pub index_commit_hash: Option<String>,
    pub untracked_commit_hash: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StashTarget {
    pub name: String,
    pub commit_hash: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StashSection {
    Staged,
    Unstaged,
    Untracked,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StashFile {
    pub path: String,
    pub section: StashSection,
}
