pub mod branch;
pub mod commit;
pub mod config;
pub mod diff;
pub mod github;
pub mod lfs;
pub mod rebase;
pub mod remote;
pub mod repository;
pub mod ssh;
pub mod stash;
pub mod status;
pub mod submodule;
pub mod tag;
pub mod worktree;

pub use branch::Branch;
pub use commit::{CommitDetails, CommitSummary};
pub use config::{GitCredentialConfig, GitIdentity};
pub use diff::DiffResult;
pub use lfs::{LfsFile, LfsStatus, LfsTrackPattern};
pub use remote::Remote;
pub use repository::{
    BranchSummary, GitStatusSummary, RepositoryInfo, RepositorySnapshot, WorkspaceSummary,
};
pub use ssh::{SshAgentIdentity, SshKey, SshStatus};
pub use stash::StashEntry;
pub use status::GitStatusFile;
pub use tag::GitTag;
