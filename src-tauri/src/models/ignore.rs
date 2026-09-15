use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IgnoreScope {
    /// Repository-wide `.gitignore`, shared with everyone who clones the repo.
    Repository,
    /// `.git/info/exclude`, private to this checkout.
    Local,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreRuleRequest {
    /// Selected file or folder, relative to the repository root.
    pub path: String,
    pub patterns: Vec<String>,
    pub scope: IgnoreScope,
    /// Also untrack shared paths or mark local paths skip-worktree.
    pub affect_tracked: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreRuleResult {
    /// Ignore file that was written, relative to the repository root when possible.
    pub file: String,
    pub added: Vec<String>,
    /// Patterns already present in the ignore file, left untouched.
    pub skipped: Vec<String>,
    /// Index entries removed or newly marked skip-worktree.
    pub affected_tracked: usize,
}
