use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub file_path: String,
    pub old_file_path: Option<String>,
    pub diff_text: String,
    pub additions: u32,
    pub deletions: u32,
    pub is_binary: bool,
    /// True when `diff_text` was capped at `MAX_DIFF_BYTES` and is incomplete.
    #[serde(default)]
    pub truncated: bool,
}
