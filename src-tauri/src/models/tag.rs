use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitTag {
    pub name: String,
    pub commit_hash: String,
    pub short_hash: String,
    pub subject: Option<String>,
    pub tagger: Option<String>,
    pub timestamp: Option<String>,
    pub annotated: bool,
}
