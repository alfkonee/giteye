import { useState, type MouseEvent } from "react";
import { ChevronDown, ChevronRight, Folder, GitBranch, Globe } from "lucide-react";
import { cn } from "../../../lib/cn";
import type { Branch } from "../../../types/git";

export interface BranchTreeNode {
  folders: Map<string, BranchTreeNode>;
  branches: Array<{ branch: Branch; label: string }>;
}

export function visibleBranches(branches: Branch[], showAll: boolean) {
  if (showAll || branches.length <= 8) return branches;
  const visible = branches.slice(0, 8);
  const current = branches.find((branch) => branch.isCurrent);
  if (current && !visible.includes(current)) visible[visible.length - 1] = current;
  return visible;
}

function buildBranchTree(branches: Branch[]): BranchTreeNode {
  const root: BranchTreeNode = { folders: new Map(), branches: [] };
  for (const branch of branches) {
    const parts = branch.shortName.split("/").filter(Boolean);
    const label = parts.pop() ?? branch.shortName;
    let node = root;
    for (const part of parts) {
      let folder = node.folders.get(part);
      if (!folder) {
        folder = { folders: new Map(), branches: [] };
        node.folders.set(part, folder);
      }
      node = folder;
    }
    node.branches.push({ branch, label });
  }
  return root;
}

export function BranchTree({
  branches,
  onSwitch,
  onContextMenu,
  describeActivation,
}: {
  branches: Branch[];
  onSwitch: (branch: Branch) => void;
  onContextMenu: (event: MouseEvent, branch: Branch) => void;
  describeActivation: (branch: Branch) => string;
}) {
  const tree = buildBranchTree(branches);
  return (
    <div className="pb-1">
      <BranchTreeContents
        node={tree}
        depth={0}
        onSwitch={onSwitch}
        onContextMenu={onContextMenu}
        describeActivation={describeActivation}
      />
    </div>
  );
}

function BranchTreeContents({
  node,
  depth,
  onSwitch,
  onContextMenu,
  describeActivation,
}: {
  node: BranchTreeNode;
  depth: number;
  onSwitch: (branch: Branch) => void;
  onContextMenu: (event: MouseEvent, branch: Branch) => void;
  describeActivation: (branch: Branch) => string;
}) {
  return (
    <>
      {[...node.folders.entries()].map(([name, folder]) => (
        <BranchFolder
          key={name}
          name={name}
          node={folder}
          depth={depth}
          onSwitch={onSwitch}
          onContextMenu={onContextMenu}
          describeActivation={describeActivation}
        />
      ))}
      {node.branches.map(({ branch, label }) => (
        <button
          key={branch.name}
          type="button"
          onDoubleClick={() => onSwitch(branch)}
          onContextMenu={(event) => onContextMenu(event, branch)}
          title={describeActivation(branch)}
          style={{ paddingLeft: `${24 + depth * 14}px` }}
          className={cn(
            "giteye-row mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-md pr-2 text-left text-[12px] transition-colors",
            branch.isCurrent
              ? "giteye-nav-active text-[13px] !font-bold tracking-[0.01em] text-[var(--color-text-primary)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]",
          )}
        >
          {branch.isRemote ? <Globe className="h-3.5 w-3.5 shrink-0" /> : <GitBranch className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {branch.upstream && !branch.isRemote ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-text-muted)]" title={trackingLabel(branch)} />
          ) : null}
        </button>
      ))}
    </>
  );
}

function BranchFolder({
  name,
  node,
  depth,
  onSwitch,
  onContextMenu,
  describeActivation,
}: {
  name: string;
  node: BranchTreeNode;
  depth: number;
  onSwitch: (branch: Branch) => void;
  onContextMenu: (event: MouseEvent, branch: Branch) => void;
  describeActivation: (branch: Branch) => string;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const count = node.branches.length + [...node.folders.values()].reduce((total, folder) => total + countBranchTree(folder), 0);
  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        style={{ paddingLeft: `${18 + depth * 14}px` }}
        className="giteye-row mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-md pr-2 text-left text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Folder className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="text-[9px] tabular-nums">{count}</span>
      </button>
      {expanded ? (
        <BranchTreeContents
          node={node}
          depth={depth + 1}
          onSwitch={onSwitch}
          onContextMenu={onContextMenu}
          describeActivation={describeActivation}
        />
      ) : null}
    </>
  );
}

function countBranchTree(node: BranchTreeNode): number {
  return node.branches.length + [...node.folders.values()].reduce((total, folder) => total + countBranchTree(folder), 0);
}

export function ShowMoreButton({ expanded, hiddenCount, onClick }: { expanded: boolean; hiddenCount: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="giteye-menu-item mx-6 mb-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]">
      {expanded ? "Show less" : `Show ${hiddenCount} more`}
    </button>
  );
}

export function trackingLabel(branch: Branch) {
  const divergence = [
    branch.ahead ? `${branch.ahead} ahead` : null,
    branch.behind ? `${branch.behind} behind` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return divergence
    ? `${branch.upstream} · ${divergence}`
    : `tracks ${branch.upstream}`;
}

export function isUnmergedStatus(status: string) {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status);
}
