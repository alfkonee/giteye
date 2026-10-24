use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Git is not installed or not found in PATH")]
    GitNotFound,

    #[error("Repository not found: {0}")]
    RepositoryNotFound(String),

    #[error("Git error: {0}")]
    GitError(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Commit not found: {0}")]
    CommitNotFound(String),

    #[error("Storage error: {0}")]
    StorageError(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let (code, recovery_hint) = match self {
            Self::GitNotFound => (
                "GIT_NOT_FOUND",
                "Install Git and make sure its executable is on PATH, or select the Git executable in Settings, then restart GitEye.",
            ),
            Self::RepositoryNotFound(_) => (
                "REPOSITORY_NOT_FOUND",
                "Open an existing Git repository folder. If it was moved or deleted, locate it again or clone a new copy.",
            ),
            Self::GitError(_) => (
                "GIT_ERROR",
                "Review the Git error and refresh the repository status before deciding whether to repeat the operation; it may have partially completed.",
            ),
            Self::IoError(_) => (
                "IO_ERROR",
                "Check that the affected file or folder is accessible and that you have the required permissions. Check the operation's current state before repeating it.",
            ),
            Self::SerializationError(_) => (
                "SERIALIZATION_ERROR",
                "Check that the imported or saved data is valid and compatible with this version of GitEye. Back up the affected file before repairing or replacing it.",
            ),
            Self::InvalidPath(_) => (
                "INVALID_PATH",
                "Choose a valid file or folder path and check that its parent folder exists and is accessible.",
            ),
            Self::CommitNotFound(_) => (
                "COMMIT_NOT_FOUND",
                "Refresh the repository history and select an existing commit. Fetch the relevant branch if the commit is only available on a remote.",
            ),
            Self::StorageError(_) => (
                "STORAGE_ERROR",
                "Check available disk space and read/write permissions for the GitEye data folder or selected settings file. Back up existing data before making changes.",
            ),
        };
        let mut s = serializer.serialize_struct("AppError", 5)?;
        s.serialize_field("code", code)?;
        s.serialize_field("message", &self.to_string())?;
        s.serialize_field("command", &Option::<&str>::None)?;
        s.serialize_field("recoveryHint", recovery_hint)?;
        // These variants span reads and mutations, including partially completed operations.
        // None provides enough operation-specific information to promise a safe retry.
        s.serialize_field("retryable", &false)?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;
    use std::collections::HashSet;

    #[test]
    fn all_variants_serialize_to_the_consumer_error_envelope() {
        let cases = [
            (AppError::GitNotFound, "GIT_NOT_FOUND"),
            (
                AppError::RepositoryNotFound("/missing/repository".into()),
                "REPOSITORY_NOT_FOUND",
            ),
            (
                AppError::GitError("merge partially applied: \"conflict\"\nnext step".into()),
                "GIT_ERROR",
            ),
            (AppError::IoError("permission denied".into()), "IO_ERROR"),
            (
                AppError::SerializationError("invalid JSON".into()),
                "SERIALIZATION_ERROR",
            ),
            (
                AppError::InvalidPath("/invalid/path".into()),
                "INVALID_PATH",
            ),
            (
                AppError::CommitNotFound("abc123".into()),
                "COMMIT_NOT_FOUND",
            ),
            (AppError::StorageError("disk full".into()), "STORAGE_ERROR"),
        ];
        let mut codes = HashSet::new();

        for (error, expected_code) in cases {
            let json = serde_json::to_string(&error).expect("serialize command failure");
            let value: serde_json::Value =
                serde_json::from_str(&json).expect("read command failure as JSON");
            let envelope = value.as_object().expect("structured command failure");

            assert_eq!(envelope.len(), 5);
            assert_eq!(value["code"], expected_code);
            assert_eq!(value["message"], error.to_string());
            assert!(envelope.get("command").expect("command field").is_null());
            assert_eq!(value["retryable"], false);
            assert!(!envelope.contains_key("error"));

            let hint = value["recoveryHint"].as_str().expect("recovery guidance");
            assert!(!hint.trim().is_empty());
            assert!(codes.insert(expected_code));
        }
    }
}
