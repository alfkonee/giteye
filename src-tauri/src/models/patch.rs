use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum PatchApplyOperation {
    Stage,
    Unstage,
    Discard,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PatchApplyRequest {
    pub file_path: String,
    pub hunk_patch: String,
    pub operation: PatchApplyOperation,
    pub staged: Option<bool>,
}
