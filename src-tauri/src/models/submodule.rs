use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Submodule {
    pub path: String,
    pub name: String,
    pub url: Option<String>,
    pub branch: Option<String>,
    pub pinned_commit: Option<String>,
    pub current_commit: Option<String>,
    pub status: SubmoduleStatus,
    pub is_initialized: bool,
    pub is_recursive: bool,
    pub behind: u32,
    pub ahead: u32,
    pub has_changes: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum SubmoduleStatus {
    UpToDate,
    UpdatesAvailable,
    Uninitialized,
    Modified,
    Conflict,
}
