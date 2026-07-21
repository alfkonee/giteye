import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Archive,
  Box,
  Database,
  FolderOpen,
  GitBranch,
  GitFork,
  GitPullRequest,
  HardDrive,
  History,
  Layers,
  PlugZap,
  Search,
  ShieldCheck,
  Tag,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ViewType } from "../types/git";
import { BranchList } from "../components/branches/BranchList";
import { CiStatusView } from "../components/ci/CiStatusView";
import { CommitHistory } from "../components/commit-history/CommitHistory";
import { CollaborationConnect } from "../components/collaboration/CollaborationConnect";
import { AdvancedMergeRebasePanel } from "../components/rebase/AdvancedMergeRebasePanel";
import { ArchaeologyView } from "../components/repository/ArchaeologyView";
import { DiagnosticsView } from "../components/repository/DiagnosticsView";
import { LfsView, RemotesView, StashesView, TagsView } from "../components/repository/LocalGitViews";
import { StackedPrBoard } from "../components/stacked-prs/StackedPrBoard";
import { WorktreesSubmodules } from "../components/workspaces/WorktreesSubmodules";
import { DiffReviewStudio } from "../components/review-studio/DiffReviewStudio";
import { WorkingTree } from "../components/working-tree/WorkingTree";
import { CustomCommandView } from "../components/repository/CustomCommandView";

export type ViewGroupId = "core" | "repository" | "collaboration";

export interface ViewGroupDefinition {
  id: ViewGroupId;
  label: string;
}

export interface ViewDefinition {
  id: ViewType;
  label: string;
  description: string;
  group: ViewGroupId;
  icon: LucideIcon;
  render: () => ReactNode;
  detailPane?: boolean;
  collaboration?: boolean;
  connectEntry?: boolean;
}

export const viewGroups: ViewGroupDefinition[] = [
  { id: "core", label: "Core Git" },
  { id: "repository", label: "Repository" },
  { id: "collaboration", label: "Collaboration" },
];

export const viewDefinitions: ViewDefinition[] = [
  {
    id: "working-tree",
    label: "Working Tree",
    description: "Stage, unstage, discard, and commit local changes",
    group: "core",
    icon: FolderOpen,
    render: () => <WorkingTree />,
    detailPane: true,
  },
  {
    id: "history",
    label: "History",
    description: "Inspect commits, diffs, reflog, and recovery paths",
    group: "core",
    icon: History,
    render: () => <CommitHistory />,
    detailPane: true,
  },
  {
    id: "branches",
    label: "Branches",
    description: "Create, switch, track, merge, and prune refs",
    group: "core",
    icon: GitBranch,
    render: () => <BranchList />,
  },
  {
    id: "rebase-conflicts",
    label: "Merge & Rebase",
    description: "Resolve conflicts and continue in-progress operations",
    group: "core",
    icon: AlertTriangle,
    render: () => <AdvancedMergeRebasePanel />,
  },
  {
    id: "worktrees",
    label: "Worktrees",
    description: "Manage linked worktrees for this repository",
    group: "core",
    icon: Layers,
    render: () => <WorktreesSubmodules />,
  },
  {
    id: "submodules",
    label: "Submodules",
    description: "Inspect, sync, and update configured submodules",
    group: "core",
    icon: Box,
    render: () => <WorktreesSubmodules />,
  },
  {
    id: "remotes",
    label: "Remotes",
    description: "Manage fetch/push remotes and remote refs",
    group: "repository",
    icon: Database,
    render: () => <RemotesView />,
  },
  {
    id: "stashes",
    label: "Stashes",
    description: "Create, apply, pop, and drop local stashes",
    group: "repository",
    icon: Archive,
    render: () => <StashesView />,
  },
  {
    id: "tags",
    label: "Tags",
    description: "Inspect, create, push, and delete tags",
    group: "repository",
    icon: Tag,
    render: () => <TagsView />,
  },
  {
    id: "lfs",
    label: "Git LFS",
    description: "Manage large-file tracking and LFS status",
    group: "repository",
    icon: HardDrive,
    render: () => <LfsView />,
  },
  {
    id: "archaeology",
    label: "Search & Archaeology",
    description: "Search commits, blame, grep, pickaxe, and lost commits",
    group: "repository",
    icon: Search,
    render: () => <ArchaeologyView />,
  },
  {
    id: "diagnostics",
    label: "Diagnostics & Bisect",
    description: "Run fsck, maintenance, signature checks, and bisect",
    group: "repository",
    icon: Wrench,
    render: () => <DiagnosticsView />,
  },
  {
    id: "custom-command",
    label: "Custom Command",
    description: "Run arbitrary git commands in the repository",
    group: "repository",
    icon: Terminal,
    render: () => <CustomCommandView />,
  },
  {
    id: "collaboration-connect",
    label: "Connect Provider",
    description: "Check provider capability without loading PR data eagerly",
    group: "collaboration",
    icon: PlugZap,
    render: () => <CollaborationConnect />,
    collaboration: true,
    connectEntry: true,
  },
  {
    id: "ci-status",
    label: "CI Status",
    description: "Inspect GitHub workflow checks for the current branch and selected PR",
    group: "collaboration",
    icon: ShieldCheck,
    render: () => <CiStatusView />,
    collaboration: true,
  },
  {
    id: "stacked-prs",
    label: "Pull Requests",
    description: "Review and land provider pull requests when available",
    group: "collaboration",
    icon: GitPullRequest,
    render: () => <StackedPrBoard />,
    collaboration: true,
  },
  {
    id: "review-studio",
    label: "Review Studio",
    description: "Inspect provider diffs, comments, checks, and reviews",
    group: "collaboration",
    icon: GitFork,
    render: () => <DiffReviewStudio />,
    collaboration: true,
  },
];

const viewDefinitionById = viewDefinitions.reduce(
  (definitions, definition) => {
    definitions[definition.id] = definition;
    return definitions;
  },
  {} as Record<ViewType, ViewDefinition>,
);

export function getViewDefinition(view: ViewType) {
  return viewDefinitionById[view] ?? viewDefinitions[0];
}

export function getViewsForGroup(groupId: ViewGroupId) {
  return viewDefinitions.filter((definition) => definition.group === groupId);
}

export function isCollaborationView(view: ViewType) {
  return getViewDefinition(view).collaboration === true;
}
