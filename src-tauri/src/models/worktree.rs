use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub is_current: bool,
    pub is_bare: bool,
    pub is_detached: bool,
    pub is_locked: bool,
    pub lock_reason: Option<String>,
    pub prunable: bool,
    pub status: String,
    pub modified_files: u32,
    pub staged_files: u32,
    pub ahead: u32,
    pub behind: u32,
    pub updated_at: Option<String>,
}
