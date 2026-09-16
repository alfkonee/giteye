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
    pub absolute_path: String,
    pub operation_id: String,
    pub revision: String,
    pub kind: String,
    pub base: ConflictStage,
    pub ours: ConflictStage,
    pub theirs: ConflictStage,
    pub result: Option<String>,
    pub result_exists: bool,
    pub regions: Vec<ConflictRegion>,
    pub submodule: Option<ConflictSubmodule>,
    pub warning: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictStage {
    pub present: bool,
    pub oid: Option<String>,
    pub mode: Option<String>,
    pub content: Option<String>,
    pub label: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRegion {
    pub id: String,
    pub start: usize,
    pub end: usize,
    pub current: String,
    pub incoming: String,
    pub base: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictSubmodule {
    pub head: Option<String>,
    pub dirty: bool,
    pub initialized: bool,
    pub relationship: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConflictResolution {
    Text {
        content: String,
        #[serde(default)]
        mode: Option<String>,
    },
    Keep,
    Side {
        side: ConflictSide,
    },
    Delete,
    SubmoduleHead,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ConflictSide {
    Ours,
    Theirs,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictResolutionRequest {
    pub operation_id: String,
    pub file_path: String,
    pub expected_revision: String,
    pub resolution: ConflictResolution,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RerereStatus {
    pub enabled: bool,
    pub paths: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OperationConflict {
    pub path: String,
    pub status: String,
    pub conflict_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OperationSnapshot {
    pub id: Option<String>,
    pub operation: Option<String>,
    pub phase: String,
    pub source: Option<OperationCommit>,
    pub target: Option<OperationCommit>,
    pub current: Option<OperationCommit>,
    pub rebase: RebaseState,
    pub conflicts: Vec<OperationConflict>,
    pub allowed_actions: Vec<OperationAction>,
    pub current_label: String,
    pub incoming_label: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OperationCommit {
    pub hash: String,
    pub subject: String,
    pub label: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OperationAction {
    Continue,
    Abort,
    Skip,
}

impl OperationAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Continue => "continue",
            Self::Abort => "abort",
            Self::Skip => "skip",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebasePreviewItem {
    pub action: String,
    pub commit: String,
    pub message: String,
}
