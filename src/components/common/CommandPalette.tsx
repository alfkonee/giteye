import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Command,
  FileText,
  FolderGit2,
  GitBranch,
  Moon,
  RefreshCw,
  Search,
  Sun,
  TerminalSquare,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { COMMAND_PALETTE_OPEN_EVENT } from "../../lib/command-palette";
import { gitMutations, gitQueries, invalidateGitState } from "../../lib/git-data";
import { viewDefinitions, viewGroups } from "../../lib/view-registry";
import { useAppStore } from "../../stores/app-store";
import { useJobStore } from "../../stores/job-store";
import type { FavoriteRepo, RecentRepo } from "../../types/git";

type PaletteItemKind = "command" | "repository" | "view";

type PaletteItem = {
  id: string;
  kind: PaletteItemKind;
  section: string;
  label: string;
  detail: string;
  keywords: string;
  icon: LucideIcon;
  disabled?: boolean;
  isActive?: boolean;
  priority: number;
  run: () => void;
};

type RepositoryPaletteItem = {
  path: string;
  name: string;
  source: "open" | "favorite" | "recent";
  isActive: boolean;
};

const MAX_RESULTS = 14;

const viewGroupLabels = Object.fromEntries(
  viewGroups.map((group) => [group.id, group.label]),
);

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeRepoPath = useAppStore((state) => state.activeRepoPath);
  const openRepoPaths = useAppStore((state) => state.openRepoPaths);
  const setActiveRepoPath = useAppStore((state) => state.setActiveRepoPath);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const diffMode = useAppStore((state) => state.diffMode);
  const setDiffMode = useAppStore((state) => state.setDiffMode);
  const setCommandLogOpen = useJobStore((state) => state.setCommandLogOpen);
  const queryClient = useQueryClient();
  const { data: recentRepos } = useQuery({
    ...gitQueries.recentRepositories(),
    enabled: open,
  });
  const { data: favoriteRepos } = useQuery({
    ...gitQueries.favoriteRepositories(),
    enabled: open,
  });
  const openRepository = useMutation(
    gitMutations.openRepository(queryClient, setActiveRepoPath),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const paletteItems = useMemo<PaletteItem[]>(
    () => {
      const repositoryItems = buildRepositoryItems({
        activeRepoPath,
        favoriteRepos: favoriteRepos ?? [],
        openRepoPaths,
        openRepositoryPath: (path) => {
          if (openRepoPaths.includes(path)) {
            setActiveRepoPath(path);
            return;
          }
          openRepository.mutate(path);
        },
        recentRepos: recentRepos ?? [],
        repositoryMutationPending: openRepository.isPending,
      });
      const viewItems = viewDefinitions.map<PaletteItem>((definition) => ({
        id: `view:${definition.id}`,
        kind: "view",
        section: viewGroupLabels[definition.group] ?? "Views",
        label: `Open ${definition.label}`,
        detail: definition.description,
        keywords: `${definition.id} ${definition.group} ${definition.collaboration ? "provider collaboration github pull request review" : "git repository"}`,
        icon: definition.icon,
        disabled: !activeRepoPath,
        priority: definition.group === "core" ? 86 : definition.group === "repository" ? 78 : 68,
        run: () => setActiveView(definition.id),
      }));
      const commandItems: PaletteItem[] = [
      {
        id: "command:refresh-repository",
        kind: "command",
        section: "Commands",
        label: "Refresh Repository",
        detail: "Refetch status, branches, history, and provider metadata for the active repository",
        keywords: "reload refresh invalidate current repo git status",
        icon: RefreshCw,
        disabled: !activeRepoPath,
        priority: 92,
        run: () => void invalidateGitState(queryClient, activeRepoPath),
      },
      {
        id: "command:command-log",
        kind: "command",
        section: "Commands",
        label: "Open Command Log",
        detail: "Inspect background Git jobs, streamed output, and failures",
        keywords: "terminal output jobs transcript background logs stderr stdout",
        icon: TerminalSquare,
        priority: 90,
        run: () => setCommandLogOpen(true),
      },
      {
        id: "command:toggle-theme",
        kind: "command",
        section: "Commands",
        label: theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
        detail: "Toggle the GitEye application color theme",
        keywords: "theme appearance dark light color mode",
        icon: theme === "dark" ? Sun : Moon,
        priority: 72,
        run: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "command:toggle-diff-mode",
        kind: "command",
        section: "Commands",
        label: diffMode === "split" ? "Use Unified Diff Mode" : "Use Split Diff Mode",
        detail: "Change the default diff presentation for repository views",
        keywords: "diff split unified side by side patch viewer",
        icon: FileText,
        priority: 70,
        run: () => setDiffMode(diffMode === "split" ? "unified" : "split"),
      },
      ];

      return [...repositoryItems, ...viewItems, ...commandItems];
    },
    [
      activeRepoPath,
      diffMode,
      favoriteRepos,
      openRepoPaths,
      openRepository,
      queryClient,
      recentRepos,
      setActiveRepoPath,
      setActiveView,
      setCommandLogOpen,
      setDiffMode,
      setTheme,
      theme,
    ],
  );

  const results = useMemo(
    () => flattenPaletteSections(groupPaletteItemsBySection(rankPaletteItems(paletteItems, query))).slice(0, MAX_RESULTS),
    [paletteItems, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(Math.max(0, results.length - 1));
    }
  }, [activeIndex, results.length]);

  if (!open) {
    return null;
  }

  const activeItem = results[activeIndex] ?? null;
  const activeOptionId = activeItem ? paletteOptionId(activeItem.id) : undefined;
  const runItem = (item: PaletteItem | null) => {
    if (!item || item.disabled) {
      return;
    }
    item.run();
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-sm" role="presentation" onMouseDown={() => setOpen(false)}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
          <Command className="h-4 w-4 text-[var(--color-accent)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={activeOptionId}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => nextEnabledIndex(results, index, 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => nextEnabledIndex(results, index, -1));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                runItem(activeItem);
              }
            }}
            placeholder="Search views, repositories, and commands…"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
          />
          <kbd className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[10px] text-[var(--color-text-muted)]">Esc</kbd>
        </div>

        <div id="command-palette-results" role="listbox" aria-label="Command palette results" className="max-h-[min(560px,65vh)] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="grid place-items-center gap-2 px-6 py-10 text-center">
              <Search className="h-6 w-6 text-[var(--color-text-muted)]" />
              <p className="text-sm font-medium text-[var(--color-text-primary)]">No command matched</p>
              <p className="max-w-sm text-xs leading-5 text-[var(--color-text-muted)]">
                Try a view name, repository name, Git action, or provider workflow.
              </p>
            </div>
          ) : (
            <PaletteResultList
              activeIndex={activeIndex}
              items={results}
              onHover={setActiveIndex}
              onRun={runItem}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-border-muted)] px-4 py-2 text-[11px] text-[var(--color-text-muted)]">
          <span>Ctrl/⌘K opens this palette anywhere in GitEye.</span>
          <span>↑↓ select · Enter run</span>
        </div>
      </section>
    </div>
  );
}

function PaletteResultList({
  activeIndex,
  items,
  onHover,
  onRun,
}: {
  activeIndex: number;
  items: PaletteItem[];
  onHover: (index: number) => void;
  onRun: (item: PaletteItem) => void;
}) {
  const groups = groupPaletteItemsBySection(items);
  let itemIndex = 0;

  return groups.map((group) => (
    <div key={group.section}>
      <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {group.section}
      </div>
      {group.items.map((item) => {
        const index = itemIndex;
        itemIndex += 1;
        return (
          <PaletteResult
            key={item.id}
            active={index === activeIndex}
            disabled={item.disabled}
            icon={<item.icon className="h-4 w-4" />}
            item={item}
            optionId={paletteOptionId(item.id)}
            onHover={() => onHover(index)}
            onRun={() => onRun(item)}
          />
        );
      })}
    </div>
  ));
}

export function groupPaletteItemsBySection(items: PaletteItem[]) {
  const sections: { section: string; items: PaletteItem[] }[] = [];
  const sectionByName = new Map<string, PaletteItem[]>();

  for (const item of items) {
    const sectionItems = sectionByName.get(item.section);
    if (sectionItems) {
      sectionItems.push(item);
      continue;
    }

    const nextSection = { section: item.section, items: [item] };
    sections.push(nextSection);
    sectionByName.set(item.section, nextSection.items);
  }

  return sections;
}

function flattenPaletteSections(sections: { section: string; items: PaletteItem[] }[]) {
  return sections.flatMap((section) => section.items);
}

function PaletteResult({
  active,
  disabled,
  icon,
  item,
  optionId,
  onHover,
  onRun,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  item: PaletteItem;
  optionId: string;
  onHover: () => void;
  onRun: () => void;
}) {
  return (
    <button
      id={optionId}
      type="button"
      role="option"
      aria-selected={active}
      aria-disabled={disabled}
      disabled={disabled}
      onMouseEnter={onHover}
      onClick={onRun}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active ? "bg-[var(--color-bg-tertiary)]" : "hover:bg-[var(--color-bg-hover)]",
      )}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">
          {item.label}
        </span>
        <span className="block truncate text-xs text-[var(--color-text-muted)]">
          {item.detail}
        </span>
      </span>
      {item.kind === "repository" && item.isActive ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success)]" />
      ) : null}
    </button>
  );
}

function buildRepositoryItems({
  activeRepoPath,
  favoriteRepos,
  openRepoPaths,
  openRepositoryPath,
  recentRepos,
  repositoryMutationPending,
}: {
  activeRepoPath: string | null;
  favoriteRepos: FavoriteRepo[];
  openRepoPaths: string[];
  openRepositoryPath: (path: string) => void;
  recentRepos: RecentRepo[];
  repositoryMutationPending: boolean;
}): PaletteItem[] {
  const repos = collectRepositoryItems({
    activeRepoPath,
    favoriteRepos,
    openRepoPaths,
    recentRepos,
  });

  return repos.map((repo) => ({
    id: `repo:${repo.path}`,
    kind: "repository",
    section: "Repositories",
    label: `${repo.source === "open" ? "Switch to" : "Open"} ${repo.name}`,
    detail: `${repo.isActive ? "Active · " : ""}${repo.source === "favorite" ? "Favorite" : repo.source === "open" ? "Open session" : "Recent"} · ${repo.path}`,
    keywords: `${repo.name} ${repo.path} ${repo.source} repository workspace session`,
    icon: repo.source === "open" ? GitBranch : FolderGit2,
    disabled: repositoryMutationPending && repo.source !== "open",
    isActive: repo.isActive,
    priority: repo.isActive ? 110 : repo.source === "open" ? 104 : repo.source === "favorite" ? 100 : 94,
    run: () => openRepositoryPath(repo.path),
  }));
}

export function collectRepositoryItems({
  activeRepoPath,
  favoriteRepos,
  openRepoPaths,
  recentRepos,
}: {
  activeRepoPath: string | null;
  favoriteRepos: FavoriteRepo[];
  openRepoPaths: string[];
  recentRepos: RecentRepo[];
}): RepositoryPaletteItem[] {
  const seen = new Set<string>();
  const items: RepositoryPaletteItem[] = [];
  const add = (path: string, name: string | null | undefined, source: RepositoryPaletteItem["source"]) => {
    if (!path || seen.has(path)) {
      return;
    }
    seen.add(path);
    items.push({
      path,
      name: name?.trim() || basename(path),
      source,
      isActive: path === activeRepoPath,
    });
  };

  for (const path of openRepoPaths) {
    add(path, null, "open");
  }
  for (const repo of favoriteRepos) {
    add(repo.path, repo.name, "favorite");
  }
  for (const repo of recentRepos) {
    add(repo.path, repo.name, "recent");
  }

  return items;
}

export function rankPaletteItems(items: PaletteItem[], query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...items]
      .sort((left, right) => effectivePriority(right) - effectivePriority(left) || left.label.localeCompare(right.label));
  }

  const queryParts = normalizedQuery.split(" ").filter(Boolean);
  return items
    .map((item) => ({ item, score: scorePaletteItem(item, normalizedQuery, queryParts) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || effectivePriority(right.item) - effectivePriority(left.item) || left.item.label.localeCompare(right.item.label))
    .map((entry) => entry.item);
}

function scorePaletteItem(item: PaletteItem, query: string, queryParts: string[]) {
  const label = normalize(item.label);
  const haystack = normalize(`${item.label} ${item.detail} ${item.keywords}`);

  if (label === query) return 300 + item.priority;
  if (label.startsWith(query)) return 220 + item.priority;
  if (haystack.includes(query)) return 140 + item.priority;
  if (queryParts.every((part) => haystack.includes(part))) return 90 + item.priority;
  return 0;
}

function effectivePriority(item: PaletteItem) {
  return item.disabled ? item.priority - 200 : item.priority;
}

function paletteOptionId(itemId: string) {
  return `command-palette-option-${itemId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export function nextEnabledIndex(items: PaletteItem[], currentIndex: number, direction: 1 | -1) {
  if (items.length === 0) {
    return 0;
  }

  for (let offset = 1; offset <= items.length; offset += 1) {
    const next = (currentIndex + offset * direction + items.length) % items.length;
    if (!items[next]?.disabled) {
      return next;
    }
  }

  return currentIndex;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9/_.:-]+/g, " ").trim();
}

function basename(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").pop() || normalized || "Repository";
}
