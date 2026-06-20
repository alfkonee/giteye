use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshStatus {
    pub ssh_dir: String,
    pub ssh_keygen_available: bool,
    pub agent_available: bool,
    pub agent_error: Option<String>,
    pub keys: Vec<SshKey>,
    pub agent_identities: Vec<SshAgentIdentity>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    pub name: String,
    pub private_key_path: String,
    pub public_key_path: String,
    pub key_type: Option<String>,
    pub fingerprint: Option<String>,
    pub comment: Option<String>,
    pub public_key: Option<String>,
    pub has_private_key: bool,
    pub loaded_in_agent: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshAgentIdentity {
    pub fingerprint: String,
    pub key_type: Option<String>,
    pub comment: Option<String>,
}
