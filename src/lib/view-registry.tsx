import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Box,
  Database,
  GitBranch,
  GitFork,
  HardDrive,
  Layers,
  LayoutPanelLeft,
  PlugZap,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ViewType } from "../types/git";
import { BranchList } from "../components/branches/BranchList";
import { CiStatusView } from "../components/ci/CiStatusView";
import { CollaborationConnect } from "../components/collaboration/CollaborationConnect";
import { GitWorkspace } from "../components/git-workspace/GitWorkspace";
import { ArchaeologyView } from "../components/repository/ArchaeologyView";
import { DiagnosticsView } from "../components/repository/DiagnosticsView";
import {
  LfsView,
  RemotesView,
  StashesView,
  TagsView,
} from "../components/repository/LocalGitViews";
import { WorktreesSubmodules } from "../components/workspaces/WorktreesSubmodules";
import { DiffReviewStudio } from "../components/review-studio/DiffReviewStudio";
import { CustomCommandView } from "../components/repository/CustomCommandView";
import { RepositorySettings } from "../components/repository/RepositorySettings";

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
    id: "workspace",
    label: "Workspace",
    description:
      "Stage, commit, browse history, merge, rebase, and resolve conflicts in one pane",
    group: "core",
    icon: LayoutPanelLeft,
    render: () => <GitWorkspace />,
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
    id: "worktrees",
    label: "Worktrees",
    description: "Manage linked worktrees for this repository",
    group: "core",
    icon: Layers,
    render: () => <WorktreesSubmodules section="worktrees" />,
  },
  {
    id: "submodules",
    label: "Submodules",
    description: "Inspect, sync, and update configured submodules",
    group: "core",
    icon: Box,
    render: () => <WorktreesSubmodules section="submodules" />,
  },
  {
    id: "repo-settings",
    label: "Repository Settings",
    description:
      "Repository appearance, remotes, hooks, and workspace danger zone",
    group: "repository",
    icon: Settings2,
    render: () => <RepositorySettings />,
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
    description:
      "Inspect GitHub workflow checks for the current branch and selected PR",
    group: "collaboration",
    icon: ShieldCheck,
    render: () => <CiStatusView />,
    collaboration: true,
  },
  {
    id: "review-studio",
    label: "Review Studio",
    description:
      "Review, manage, and land provider pull requests in one workspace",
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
