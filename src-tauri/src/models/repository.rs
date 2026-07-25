use super::GitStatusFile;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryParent {
    pub path: String,
    pub name: String,
    pub submodule_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub path: String,
    pub name: String,
    pub current_branch: String,
    pub is_clean: bool,
    pub head_commit: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub submodule_parent: Option<RepositoryParent>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusSummary {
    pub staged_count: u32,
    pub unstaged_count: u32,
    pub untracked_count: u32,
    pub ignored_count: u32,
    pub total_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub repository_info: RepositoryInfo,
    pub files: Vec<GitStatusFile>,
    pub summary: GitStatusSummary,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummary {
    pub current_branch: String,
    pub local_count: u32,
    pub remote_count: u32,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub worktree_count: u32,
    pub submodule_count: u32,
    pub behind_submodule_count: u32,
}
