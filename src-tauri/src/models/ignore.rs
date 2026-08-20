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
    pub patterns: Vec<String>,
    pub scope: IgnoreScope,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreRuleResult {
    /// Ignore file that was written, relative to the repository root when possible.
    pub file: String,
    pub added: Vec<String>,
    /// Patterns already present in the ignore file, left untouched.
    pub skipped: Vec<String>,
}
