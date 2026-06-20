use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsStatus {
    pub available: bool,
    pub version: Option<String>,
    pub tracked_patterns: Vec<LfsTrackPattern>,
    pub files: Vec<LfsFile>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsTrackPattern {
    pub pattern: String,
    pub source: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LfsFile {
    pub oid: String,
    pub size: Option<String>,
    pub path: String,
}
