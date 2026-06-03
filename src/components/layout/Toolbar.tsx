import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  Circle,
  Cloud,
  Download,
  FolderGit2,
  GitBranch,
  GitMerge,
  RefreshCw,
  Search,
  Settings,
  Upload,
  Zap,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../stores/app-store";
import { useBranches, useCheckoutBranch } from "../../hooks/useBranches";

interface ToolbarProps {
  repoName?: string;
  currentBranch?: string;
  isClean?: boolean;
}

export function Toolbar({ repoName, currentBranch, isClean }: ToolbarProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const { data: branches } = useBranches(activeRepoPath);
  const checkoutBranch = useCheckoutBranch(activeRepoPath);

  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [commandValue, setCommandValue] = useState("");
  const branchMenuRef = useRef<HTMLDivElement>(null);

  const localBranches = branches?.filter((branch) => !branch.isRemote) ?? [];
  const workingTreeState = isClean ? "Clean" : "Uncommitted changes";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(event.target as Node)) {
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="giteye-toolbar flex h-12 shrink-0 select-none items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 shadow-[var(--shadow-panel)]">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <button
          onClick={() => setActiveRepoPath(null)}
          className="flex h-8 max-w-[260px] items-center gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-2.5 text-[13px] font-semibold text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]"
          title="Switch repository"
        >
          <FolderGit2 className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          <span className="truncate">{repoName ?? "GitEye"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
        </button>

        {currentBranch && (
          <div className="relative" ref={branchMenuRef}>
            <button
              onClick={() => setBranchMenuOpen((open) => !open)}
              className="flex h-8 max-w-[220px] items-center gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-2.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
              title="Checkout branch"
            >
              <GitBranch className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span className="truncate">{currentBranch}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", branchMenuOpen && "rotate-180")} />
            </button>

            {branchMenuOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 max-h-80 w-80 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1.5 shadow-[var(--shadow-elevated)]">
                <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  <span>Local Branches</span>
                  <span>{localBranches.length}</span>
                </div>
                {localBranches.map((branch) => (
                  <button
                    key={branch.name}
                    onClick={() => {
                      checkoutBranch.mutate(branch.shortName);
                      setBranchMenuOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
                      branch.isCurrent
                        ? "bg-[var(--color-bg-selected)] text-white"
                        : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
                    )}
                  >
                    <GitBranch className={cn("h-4 w-4 shrink-0", branch.isCurrent ? "text-white" : "text-[var(--color-text-muted)]")} />
                    <span className="truncate">{branch.shortName}</span>
                    {branch.isCurrent && <span className="ml-auto text-[11px] opacity-80">current</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-1 h-7 w-px shrink-0 bg-[var(--color-border-muted)]" />

      <div className="flex shrink-0 items-center gap-1">
        <ToolbarButton icon={<Download className="h-4 w-4" />} label="Fetch" title="Fetch from remote" />
        <ToolbarButton icon={<GitMerge className="h-4 w-4" />} label="Pull" title="Pull from remote" />
        <ToolbarButton icon={<Upload className="h-4 w-4" />} label="Push" title="Push to remote" />
        <ToolbarButton icon={<Zap className="h-4 w-4" />} label="Sync" title="Sync repository" />
      </div>

      <div className="flex min-w-[180px] flex-1 justify-center px-2">
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={commandValue}
            onChange={(event) => setCommandValue(event.target.value)}
            placeholder="Search files, branches, commands..."
            className="h-8 w-full rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] pl-9 pr-3 text-[13px] text-[var(--color-text-primary)] shadow-[var(--shadow-panel)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isClean !== undefined && currentBranch && (
          <div className={cn("hidden h-8 items-center gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-2.5 text-[12px] xl:flex", isClean ? "text-[var(--color-success)]" : "text-[var(--color-warning)]")}>
            <Circle className="h-2.5 w-2.5 fill-current" />
            <span>{workingTreeState}</span>
          </div>
        )}
        <ToolbarButton icon={<RefreshCw className="h-4 w-4" />} title="Refresh" />
        <ToolbarButton icon={<Cloud className="h-4 w-4" />} title="Remote status" />
        <ToolbarButton icon={<Bell className="h-4 w-4" />} title="Notifications" />
        <ToolbarButton
          icon={<Settings className="h-4 w-4" />}
          title="Settings"
          onClick={() => setActiveView("settings")}
        />
      </div>
    </div>
  );
}

function ToolbarButton({ icon, label, title, onClick }: { icon: ReactNode; label?: string; title?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
    >
      {icon}
      {label && <span className="hidden lg:inline">{label}</span>}
    </button>
  );
}
