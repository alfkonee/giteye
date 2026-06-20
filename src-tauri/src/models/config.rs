use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    pub local_name: Option<String>,
    pub local_email: Option<String>,
    pub global_name: Option<String>,
    pub global_email: Option<String>,
    pub effective_name: Option<String>,
    pub effective_email: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitCredentialConfig {
    pub local_helpers: Vec<String>,
    pub global_helpers: Vec<String>,
    pub effective_helpers: Vec<String>,
}
