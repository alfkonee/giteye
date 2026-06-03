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
        let mut s = serializer.serialize_struct("AppError", 1)?;
        s.serialize_field("error", &self.to_string())?;
        s.end()
    }
}
