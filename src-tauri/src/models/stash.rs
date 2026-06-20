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
}
