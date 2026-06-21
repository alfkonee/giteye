pub mod archaeology;
pub mod branch;
pub mod commit;
pub mod config;
pub mod diagnostics;
pub mod diff;
pub mod github;
pub mod history;
pub mod lfs;
pub mod patch;
pub mod rebase;
pub mod remote;
pub mod repository;
pub mod ssh;
pub mod stash;
pub mod status;
pub mod submodule;
pub mod tag;
pub mod worktree;

pub use archaeology::{
    BlameLine, CommitSearchResult, FileChange, FileHistoryEntry, GitGrepMatch, LostCommit,
    PickaxeSearchResult,
};
pub use branch::Branch;
pub use commit::{CommitDetails, CommitSummary};
pub use config::{GitCredentialConfig, GitIdentity};
pub use diff::DiffResult;
pub use history::{AmendPreview, ReflogEntry, ResetMode, ResetPreview, ResetPreviewFile};
pub use lfs::{LfsFile, LfsStatus, LfsTrackPattern};
pub use patch::{PatchApplyOperation, PatchApplyRequest};
pub use remote::Remote;
pub use repository::{
    BranchSummary, GitStatusSummary, RepositoryInfo, RepositoryParent, RepositorySnapshot,
    WorkspaceSummary,
};
pub use ssh::{SshAgentIdentity, SshKey, SshStatus};
pub use stash::StashEntry;
pub use status::GitStatusFile;
pub use tag::GitTag;
