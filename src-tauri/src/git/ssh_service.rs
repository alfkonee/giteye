use crate::errors::AppError;
use crate::models::{SshAgentIdentity, SshKey, SshStatus};
use directories::UserDirs;
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn get_ssh_status() -> Result<SshStatus, AppError> {
    let ssh_dir = ssh_dir()?;
    let ssh_keygen_available = command_available("ssh-keygen");
    let (agent_available, agent_error, agent_identities) = list_agent_identities();
    let loaded_fingerprints: HashSet<&str> = agent_identities
        .iter()
        .map(|identity| identity.fingerprint.as_str())
        .collect();
    let keys = list_keys(&ssh_dir, ssh_keygen_available, &loaded_fingerprints)?;

    Ok(SshStatus {
        ssh_dir: ssh_dir.to_string_lossy().into_owned(),
        ssh_keygen_available,
        agent_available,
        agent_error,
        keys,
        agent_identities,
    })
}

pub fn generate_ssh_key(name: &str, comment: Option<&str>) -> Result<SshStatus, AppError> {
    if !command_available("ssh-keygen") {
        return Err(AppError::GitError(
            "ssh-keygen is not installed or not found in PATH".to_string(),
        ));
    }

    let ssh_dir = ssh_dir()?;
    ensure_ssh_dir(&ssh_dir)?;
    let key_path = key_path(&ssh_dir, name)?;
    let public_key_path = public_key_path(&key_path);
    if key_path.exists() || public_key_path.exists() {
        return Err(AppError::GitError(format!(
            "SSH key already exists: {}",
            key_path.to_string_lossy()
        )));
    }

    let key_comment = comment
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("giteye");
    let output = Command::new("ssh-keygen")
        .args([OsStr::new("-t"), OsStr::new("ed25519"), OsStr::new("-C")])
        .arg(key_comment)
        .arg("-f")
        .arg(&key_path)
        .args([OsStr::new("-N"), OsStr::new("")])
        .output()
        .map_err(|err| AppError::GitError(format!("Failed to run ssh-keygen: {err}")))?;

    if !output.status.success() {
        return Err(AppError::GitError(command_message(&output)));
    }

    get_ssh_status()
}

pub fn add_ssh_key_to_agent(name: &str) -> Result<SshStatus, AppError> {
    let ssh_dir = ssh_dir()?;
    let key_path = key_path(&ssh_dir, name)?;
    if !key_path.exists() {
        return Err(AppError::GitError(format!(
            "SSH key not found: {}",
            key_path.to_string_lossy()
        )));
    }

    let output = Command::new("ssh-add")
        .arg(&key_path)
        .output()
        .map_err(|err| AppError::GitError(format!("Failed to run ssh-add: {err}")))?;

    if !output.status.success() {
        return Err(AppError::GitError(command_message(&output)));
    }

    get_ssh_status()
}

fn ssh_dir() -> Result<PathBuf, AppError> {
    let user_dirs = UserDirs::new()
        .ok_or_else(|| AppError::InvalidPath("Home directory not found".to_string()))?;
    Ok(user_dirs.home_dir().join(".ssh"))
}

fn ensure_ssh_dir(path: &Path) -> Result<(), AppError> {
    fs::create_dir_all(path).map_err(|err| AppError::IoError(err.to_string()))?;
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|err| AppError::IoError(err.to_string()))?;
    Ok(())
}

fn key_path(ssh_dir: &Path, name: &str) -> Result<PathBuf, AppError> {
    let name = safe_key_name(name)?;
    Ok(ssh_dir.join(name))
}

fn safe_key_name(name: &str) -> Result<&str, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::GitError("SSH key name is required".to_string()));
    }
    if name == "." || name == ".." {
        return Err(AppError::InvalidPath("Invalid SSH key name".to_string()));
    }
    if !name
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
    {
        return Err(AppError::InvalidPath(
            "SSH key names may only contain letters, numbers, '.', '_' and '-'".to_string(),
        ));
    }
    Ok(name)
}

fn list_keys(
    ssh_dir: &Path,
    ssh_keygen_available: bool,
    loaded_fingerprints: &HashSet<&str>,
) -> Result<Vec<SshKey>, AppError> {
    if !ssh_dir.exists() {
        return Ok(Vec::new());
    }

    let mut keys = Vec::new();
    let entries = fs::read_dir(ssh_dir).map_err(|err| AppError::IoError(err.to_string()))?;
    for entry in entries {
        let entry = entry.map_err(|err| AppError::IoError(err.to_string()))?;
        let public_key_path = entry.path();
        if public_key_path.extension().and_then(OsStr::to_str) != Some("pub") {
            continue;
        }

        let public_key = fs::read_to_string(&public_key_path)
            .ok()
            .and_then(|content| content.lines().next().map(str::trim).map(str::to_string))
            .filter(|line| !line.is_empty());
        let public_info = public_key.as_deref().and_then(parse_public_key_line);
        let fingerprint = if ssh_keygen_available {
            key_fingerprint(&public_key_path)
        } else {
            None
        };
        let private_key_path = private_key_path(&public_key_path);
        let name = private_key_path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_string();
        let loaded_in_agent = fingerprint
            .as_deref()
            .is_some_and(|fingerprint| loaded_fingerprints.contains(fingerprint));

        keys.push(SshKey {
            name,
            private_key_path: private_key_path.to_string_lossy().into_owned(),
            public_key_path: public_key_path.to_string_lossy().into_owned(),
            key_type: public_info.as_ref().map(|info| info.key_type.to_string()),
            fingerprint,
            comment: public_info.and_then(|info| info.comment.map(str::to_string)),
            public_key,
            has_private_key: private_key_path.exists(),
            loaded_in_agent,
        });
    }

    keys.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(keys)
}

fn public_key_path(private_key_path: &Path) -> PathBuf {
    let file_name = private_key_path
        .file_name()
        .and_then(OsStr::to_str)
        .map(|name| format!("{name}.pub"))
        .unwrap_or_else(|| ".pub".to_string());
    private_key_path.with_file_name(file_name)
}

fn private_key_path(public_key_path: &Path) -> PathBuf {
    match public_key_path.file_name().and_then(OsStr::to_str) {
        Some(file_name) => public_key_path.with_file_name(file_name.trim_end_matches(".pub")),
        None => public_key_path.to_path_buf(),
    }
}

fn key_fingerprint(public_key_path: &Path) -> Option<String> {
    let output = Command::new("ssh-keygen")
        .args([OsStr::new("-lf")])
        .arg(public_key_path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_fingerprint_line(&String::from_utf8_lossy(&output.stdout)).map(str::to_string)
}

fn list_agent_identities() -> (bool, Option<String>, Vec<SshAgentIdentity>) {
    let output = match Command::new("ssh-add").arg("-l").output() {
        Ok(output) => output,
        Err(err) => {
            return (
                false,
                Some(format!("Failed to run ssh-add: {err}")),
                Vec::new(),
            )
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = stderr.trim();

    if output.status.success() {
        return (true, None, parse_agent_identities(&stdout));
    }

    if stdout.contains("The agent has no identities")
        || stderr.contains("The agent has no identities")
    {
        return (true, None, Vec::new());
    }

    let error = if message.is_empty() {
        "SSH agent is not available".to_string()
    } else {
        message.to_string()
    };
    (false, Some(error), Vec::new())
}

fn command_available(command: &str) -> bool {
    Command::new(command).arg("-?").output().is_ok()
}

fn command_message(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return stderr;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return stdout;
    }
    "Command failed".to_string()
}

struct PublicKeyInfo<'a> {
    key_type: &'a str,
    comment: Option<&'a str>,
}

fn parse_public_key_line(line: &str) -> Option<PublicKeyInfo<'_>> {
    let line = line.trim();
    let key_type_end = line.find(char::is_whitespace)?;
    let key_type = &line[..key_type_end];
    let rest = line[key_type_end..].trim_start();
    let encoded_end = rest.find(char::is_whitespace).unwrap_or(rest.len());
    let encoded = &rest[..encoded_end];
    let comment = rest[encoded_end..].trim();

    if !key_type.starts_with("ssh-")
        && !key_type.starts_with("ecdsa-")
        && !key_type.starts_with("sk-")
    {
        return None;
    }
    if encoded.is_empty() {
        return None;
    }
    Some(PublicKeyInfo {
        key_type,
        comment: (!comment.is_empty()).then_some(comment),
    })
}

fn parse_fingerprint_line(line: &str) -> Option<&str> {
    line.split_whitespace().nth(1)
}

fn parse_agent_identities(output: &str) -> Vec<SshAgentIdentity> {
    output
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            parts.next()?;
            let fingerprint = parts.next()?.to_string();
            let comment = parts.next().map(str::to_string);
            let key_type = parts
                .next()
                .and_then(|value| {
                    value
                        .strip_prefix('(')
                        .and_then(|value| value.strip_suffix(')'))
                })
                .map(str::to_string);
            Some(SshAgentIdentity {
                fingerprint,
                key_type,
                comment,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_public_key_line() {
        let info = parse_public_key_line("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA test@example.com")
            .expect("public key info");

        let spaced =
            parse_public_key_line("ssh-ed25519   AAAAC3NzaC1lZDI1NTE5AAAA   spaced@example.com")
                .expect("spaced public key info");
        assert_eq!(spaced.comment, Some("spaced@example.com"));

        assert_eq!(info.key_type, "ssh-ed25519");
        assert_eq!(info.comment, Some("test@example.com"));
    }

    #[test]
    fn parses_agent_identity_line() {
        let identities = parse_agent_identities("256 SHA256:abc123 me@example.com (ED25519)\n");

        assert_eq!(identities.len(), 1);
        assert_eq!(identities[0].fingerprint, "SHA256:abc123");
        assert_eq!(identities[0].comment.as_deref(), Some("me@example.com"));
        assert_eq!(identities[0].key_type.as_deref(), Some("ED25519"));
    }

    #[test]
    fn rejects_unsafe_key_names() {
        assert!(safe_key_name("id_giteye").is_ok());
        assert!(safe_key_name("../id_rsa").is_err());
        assert!(safe_key_name("id rsa").is_err());
        assert!(safe_key_name("").is_err());
    }
}
