import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import { cn } from "../../lib/cn";

interface FileTreeProps<T> {
  items: T[];
  getPath: (item: T) => string;
  getKey?: (item: T) => string;
  selectedKey?: string | null;
  onSelect: (item: T) => void;
  onFileContextMenu?: (event: MouseEvent, item: T) => void;
  onDirectoryContextMenu?: (event: MouseEvent, path: string, items: T[]) => void;
  renderIcon?: (item: T, selected: boolean) => ReactNode;
  renderSubtext?: (item: T, selected: boolean) => ReactNode;
  renderTrailing?: (item: T, selected: boolean) => ReactNode;
  /** Hover actions for a folder row, mirroring the per-file trailing actions. */
  renderDirectoryTrailing?: (path: string, items: T[]) => ReactNode;
  className?: string;
}

interface TreeDirectory<T> {
  type: "directory";
  name: string;
  path: string;
  directories: Map<string, TreeDirectory<T>>;
  files: TreeFile<T>[];
}

interface TreeFile<T> {
  type: "file";
  name: string;
  path: string;
  key: string;
  item: T;
}

type TreeEntry<T> = TreeDirectory<T> | TreeFile<T>;

export function FileTree<T>({
  items,
  getPath,
  getKey,
  selectedKey,
  onSelect,
  onFileContextMenu,
  onDirectoryContextMenu,
  renderIcon,
  renderSubtext,
  renderTrailing,
  renderDirectoryTrailing,
  className,
}: FileTreeProps<T>) {
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(() => new Set());
  const root = useMemo(() => buildTree(items, getPath, getKey), [items, getPath, getKey]);

  const toggleDirectory = (path: string) => {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className={cn("overflow-hidden rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/45", className)}>
      <TreeEntries
        entries={sortedEntries(root)}
        depth={0}
        collapsedDirectories={collapsedDirectories}
        selectedKey={selectedKey}
        onToggleDirectory={toggleDirectory}
        onSelect={onSelect}
        onFileContextMenu={onFileContextMenu}
        onDirectoryContextMenu={onDirectoryContextMenu}
        renderIcon={renderIcon}
        renderSubtext={renderSubtext}
        renderTrailing={renderTrailing}
        renderDirectoryTrailing={renderDirectoryTrailing}
      />
    </div>
  );
}

function TreeEntries<T>({
  entries,
  depth,
  collapsedDirectories,
  selectedKey,
  onToggleDirectory,
  onSelect,
  onFileContextMenu,
  onDirectoryContextMenu,
  renderIcon,
  renderSubtext,
  renderTrailing,
  renderDirectoryTrailing,
}: {
  entries: TreeEntry<T>[];
  depth: number;
  collapsedDirectories: Set<string>;
  selectedKey?: string | null;
  onToggleDirectory: (path: string) => void;
  onSelect: (item: T) => void;
  onFileContextMenu?: (event: MouseEvent, item: T) => void;
  onDirectoryContextMenu?: (event: MouseEvent, path: string, items: T[]) => void;
  renderIcon?: (item: T, selected: boolean) => ReactNode;
  renderSubtext?: (item: T, selected: boolean) => ReactNode;
  renderTrailing?: (item: T, selected: boolean) => ReactNode;
  renderDirectoryTrailing?: (path: string, items: T[]) => ReactNode;
}) {
  return (
    <div className="divide-y divide-[var(--color-border-muted)]/70">
      {entries.map((entry) => {
        if (entry.type === "directory") {
          const collapsed = collapsedDirectories.has(entry.path);
          const items = directoryItems(entry);
          return (
            <div key={entry.path}>
              <div
                className="group flex min-h-[22px] w-full items-center gap-1 pr-1 transition-colors hover:bg-[var(--color-bg-hover)]"
                onContextMenu={(event) => onDirectoryContextMenu?.(event, entry.path, items)}
              >
                <button
                  type="button"
                  onClick={() => onToggleDirectory(entry.path)}
                  className="flex min-w-0 flex-1 items-center gap-1 px-1.5 text-left text-[11.5px] text-[var(--color-text-secondary)]"
                  style={{ paddingLeft: depth * 10 + 6 }}
                >
                  {collapsed ? <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)]" /> : <ChevronDown className="h-3 w-3 text-[var(--color-text-muted)]" />}
                  <Folder className="h-3 w-3 shrink-0 text-[var(--color-accent)]" />
                  <span className="truncate font-medium">{entry.name}</span>
                  <span className="shrink-0 text-[9.5px] tabular-nums text-[var(--color-text-muted)]">{items.length}</span>
                </button>
                {renderDirectoryTrailing?.(entry.path, items)}
              </div>
              {!collapsed && (
                <TreeEntries
                  entries={sortedEntries(entry)}
                  depth={depth + 1}
                  collapsedDirectories={collapsedDirectories}
                  selectedKey={selectedKey}
                  onToggleDirectory={onToggleDirectory}
                  onSelect={onSelect}
                  onFileContextMenu={onFileContextMenu}
                  onDirectoryContextMenu={onDirectoryContextMenu}
                  renderIcon={renderIcon}
                  renderSubtext={renderSubtext}
                  renderTrailing={renderTrailing}
                  renderDirectoryTrailing={renderDirectoryTrailing}
                />
              )}
            </div>
          );
        }

        const selected = selectedKey === entry.key;
        return (
          <div
            key={entry.key}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(entry.item)}
            onContextMenu={(event) => onFileContextMenu?.(event, entry.item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(entry.item);
              }
            }}
            className={cn(
              "group grid min-h-[24px] w-full cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 px-1.5 text-left transition-colors",
              selected
                ? "giteye-selected-row"
                : "hover:bg-[var(--color-bg-hover)]",
            )}
            style={{ paddingLeft: depth * 12 + 8 }}
          >
            {renderIcon ? (
              renderIcon(entry.item, selected)
            ) : (
              <File
                className={cn(
                  "h-3 w-3",
                  selected ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]",
                )}
              />
            )}
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-[11.5px] font-medium leading-4",
                  selected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-primary)]",
                )}
              >
                {entry.name}
              </span>
              {renderSubtext?.(entry.item, selected)}
            </span>
            {renderTrailing?.(entry.item, selected)}
          </div>
        );
      })}
    </div>
  );
}

function directoryItems<T>(directory: TreeDirectory<T>): T[] {
  return [
    ...directory.files.map((file) => file.item),
    ...Array.from(directory.directories.values()).flatMap(directoryItems),
  ];
}

function buildTree<T>(items: T[], getPath: (item: T) => string, getKey?: (item: T) => string): TreeDirectory<T> {
  const root: TreeDirectory<T> = {
    type: "directory",
    name: "",
    path: "",
    directories: new Map(),
    files: [],
  };

  for (const item of items) {
    const path = getPath(item);
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let directory = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      const directoryPath = directory.path ? `${directory.path}/${name}` : name;
      let next = directory.directories.get(name);
      if (!next) {
        next = {
          type: "directory",
          name,
          path: directoryPath,
          directories: new Map(),
          files: [],
        };
        directory.directories.set(name, next);
      }
      directory = next;
    }

    const name = parts[parts.length - 1];
    directory.files.push({
      type: "file",
      name,
      path,
      key: getKey?.(item) ?? path,
      item,
    });
  }

  return root;
}

function sortedEntries<T>(directory: TreeDirectory<T>): TreeEntry<T>[] {
  return [
    ...Array.from(directory.directories.values()).sort(compareTreeNames),
    ...directory.files.sort(compareTreeNames),
  ];
}

function compareTreeNames(left: { name: string }, right: { name: string }) {
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}
