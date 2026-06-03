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
}
