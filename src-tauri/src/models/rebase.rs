use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebaseState {
    pub in_progress: bool,
    pub rebase_dir: Option<String>,
    pub head_name: Option<String>,
    pub onto: Option<String>,
    pub orig_head: Option<String>,
    pub current_step: Option<u32>,
    pub total_steps: Option<u32>,
    pub todo: Vec<RebaseTodoItem>,
    pub done: Vec<RebaseTodoItem>,
    pub conflicts: Vec<ConflictFile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebaseTodoItem {
    pub action: String,
    pub commit: String,
    pub message: String,
    pub raw: String,
    pub completed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictContent {
    pub file_path: String,
    pub base: String,
    pub ours: String,
    pub theirs: String,
    pub result: String,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebasePreviewItem {
    pub action: String,
    pub commit: String,
    pub message: String,
}
