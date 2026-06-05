use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

static REPO_STATE_GRAPHS: LazyLock<Mutex<HashMap<String, RepoStateGraph>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RepoStateReason {
    Worktree,
    Refs,
    Remote,
    Rebase,
}

#[derive(Clone, Copy, Debug, Hash, PartialEq, Eq)]
pub enum RepoStateNode {
    Snapshot,
    BranchSummary,
    WorkspaceSummary,
    GithubOverview,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RepoNodeState {
    pub fingerprint: Option<String>,
    pub generation: u64,
    pub dirty: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RepoStateGraph {
    pub nodes: HashMap<RepoStateNode, RepoNodeState>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct InvalidationPlan {
    pub snapshot: bool,
    pub branch_summary: bool,
    pub workspace_summary: bool,
    pub github_overview: bool,
}

impl InvalidationPlan {
    pub fn affects(self, node: RepoStateNode) -> bool {
        match node {
            RepoStateNode::Snapshot => self.snapshot,
            RepoStateNode::BranchSummary => self.branch_summary,
            RepoStateNode::WorkspaceSummary => self.workspace_summary,
            RepoStateNode::GithubOverview => self.github_overview,
        }
    }
}

pub fn mark_repository_change(repo_key: &str, reason: RepoStateReason) -> InvalidationPlan {
    let plan = invalidation_plan(reason);
    if let Ok(mut graphs) = REPO_STATE_GRAPHS.lock() {
        let graph = graphs.entry(repo_key.to_string()).or_default();
        for node in affected_nodes(plan) {
            let state = graph.nodes.entry(node).or_default();
            state.generation = state.generation.saturating_add(1);
            state.dirty = true;
            state.fingerprint = None;
        }
    }
    plan
}

pub fn mark_node_fresh(repo_key: &str, node: RepoStateNode, fingerprint: String) {
    if let Ok(mut graphs) = REPO_STATE_GRAPHS.lock() {
        let graph = graphs.entry(repo_key.to_string()).or_default();
        let state = graph.nodes.entry(node).or_default();
        state.fingerprint = Some(fingerprint);
        state.dirty = false;
    }
}

pub fn repo_state_graph(repo_key: &str) -> Option<RepoStateGraph> {
    REPO_STATE_GRAPHS
        .lock()
        .ok()
        .and_then(|graphs| graphs.get(repo_key).cloned())
}

fn affected_nodes(plan: InvalidationPlan) -> impl Iterator<Item = RepoStateNode> {
    [
        RepoStateNode::Snapshot,
        RepoStateNode::BranchSummary,
        RepoStateNode::WorkspaceSummary,
        RepoStateNode::GithubOverview,
    ]
    .into_iter()
    .filter(move |node| plan.affects(*node))
}

pub fn invalidation_plan(reason: RepoStateReason) -> InvalidationPlan {
    match reason {
        RepoStateReason::Worktree => InvalidationPlan {
            snapshot: true,
            branch_summary: false,
            workspace_summary: true,
            github_overview: false,
        },
        RepoStateReason::Refs => InvalidationPlan {
            snapshot: true,
            branch_summary: true,
            workspace_summary: false,
            github_overview: false,
        },
        RepoStateReason::Remote => InvalidationPlan {
            snapshot: true,
            branch_summary: true,
            workspace_summary: true,
            github_overview: true,
        },
        RepoStateReason::Rebase => InvalidationPlan {
            snapshot: false,
            branch_summary: false,
            workspace_summary: false,
            github_overview: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalidation_plan_scopes_nodes_by_reason() {
        let worktree = invalidation_plan(RepoStateReason::Worktree);
        assert!(worktree.affects(RepoStateNode::Snapshot));
        assert!(!worktree.affects(RepoStateNode::BranchSummary));
        assert!(worktree.affects(RepoStateNode::WorkspaceSummary));
        assert!(!worktree.affects(RepoStateNode::GithubOverview));

        let refs = invalidation_plan(RepoStateReason::Refs);
        assert!(refs.affects(RepoStateNode::Snapshot));
        assert!(refs.affects(RepoStateNode::BranchSummary));
        assert!(!refs.affects(RepoStateNode::WorkspaceSummary));
        assert!(!refs.affects(RepoStateNode::GithubOverview));

        let remote = invalidation_plan(RepoStateReason::Remote);
        assert!(remote.affects(RepoStateNode::Snapshot));
        assert!(remote.affects(RepoStateNode::BranchSummary));
        assert!(remote.affects(RepoStateNode::WorkspaceSummary));
        assert!(remote.affects(RepoStateNode::GithubOverview));

        let rebase = invalidation_plan(RepoStateReason::Rebase);
        assert!(!rebase.affects(RepoStateNode::Snapshot));
        assert!(!rebase.affects(RepoStateNode::BranchSummary));
        assert!(!rebase.affects(RepoStateNode::WorkspaceSummary));
        assert!(!rebase.affects(RepoStateNode::GithubOverview));
    }

    #[test]
    fn repository_change_marks_only_affected_cached_nodes_dirty() {
        let repo_key = format!("repo-{}", std::process::id());
        mark_node_fresh(&repo_key, RepoStateNode::Snapshot, "status-a".to_string());
        mark_node_fresh(
            &repo_key,
            RepoStateNode::BranchSummary,
            "branch-a".to_string(),
        );
        mark_node_fresh(
            &repo_key,
            RepoStateNode::WorkspaceSummary,
            "workspace-a".to_string(),
        );
        mark_node_fresh(
            &repo_key,
            RepoStateNode::GithubOverview,
            "github-a".to_string(),
        );

        mark_repository_change(&repo_key, RepoStateReason::Refs);
        let graph = repo_state_graph(&repo_key).expect("repo graph");

        let snapshot = graph
            .nodes
            .get(&RepoStateNode::Snapshot)
            .expect("snapshot node");
        assert!(snapshot.dirty);
        assert_eq!(snapshot.generation, 1);
        assert!(snapshot.fingerprint.is_none());

        let branch = graph
            .nodes
            .get(&RepoStateNode::BranchSummary)
            .expect("branch summary node");
        assert!(branch.dirty);
        assert_eq!(branch.generation, 1);
        assert!(branch.fingerprint.is_none());

        let workspace = graph
            .nodes
            .get(&RepoStateNode::WorkspaceSummary)
            .expect("workspace summary node");
        assert!(!workspace.dirty);
        assert_eq!(workspace.generation, 0);
        assert_eq!(workspace.fingerprint.as_deref(), Some("workspace-a"));

        let github = graph
            .nodes
            .get(&RepoStateNode::GithubOverview)
            .expect("github overview node");
        assert!(!github.dirty);
        assert_eq!(github.generation, 0);
        assert_eq!(github.fingerprint.as_deref(), Some("github-a"));
    }
}
