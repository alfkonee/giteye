import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import { cn } from "../../lib/cn";

interface FileTreeProps<T> {
  items: T[];
  getPath: (item: T) => string;
  getKey?: (item: T) => string;
  selectedKey?: string | null;
  onSelect: (item: T) => void;
  renderIcon?: (item: T, selected: boolean) => ReactNode;
  renderSubtext?: (item: T, selected: boolean) => ReactNode;
  renderTrailing?: (item: T, selected: boolean) => ReactNode;
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
  renderIcon,
  renderSubtext,
  renderTrailing,
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
    <div className={cn("overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/45", className)}>
      <TreeEntries
        entries={sortedEntries(root)}
        depth={0}
        collapsedDirectories={collapsedDirectories}
        selectedKey={selectedKey}
        onToggleDirectory={toggleDirectory}
        onSelect={onSelect}
        renderIcon={renderIcon}
        renderSubtext={renderSubtext}
        renderTrailing={renderTrailing}
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
  renderIcon,
  renderSubtext,
  renderTrailing,
}: {
  entries: TreeEntry<T>[];
  depth: number;
  collapsedDirectories: Set<string>;
  selectedKey?: string | null;
  onToggleDirectory: (path: string) => void;
  onSelect: (item: T) => void;
  renderIcon?: (item: T, selected: boolean) => ReactNode;
  renderSubtext?: (item: T, selected: boolean) => ReactNode;
  renderTrailing?: (item: T, selected: boolean) => ReactNode;
}) {
  return (
    <div className="divide-y divide-[var(--color-border-muted)]/70">
      {entries.map((entry) => {
        if (entry.type === "directory") {
          const collapsed = collapsedDirectories.has(entry.path);
          return (
            <div key={entry.path}>
              <button
                type="button"
                onClick={() => onToggleDirectory(entry.path)}
                className="flex min-h-[28px] w-full items-center gap-1.5 px-2 py-0.5 text-left text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ paddingLeft: depth * 12 + 8 }}
              >
                {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />}
                <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                <span className="truncate font-medium">{entry.name}</span>
              </button>
              {!collapsed && (
                <TreeEntries
                  entries={sortedEntries(entry)}
                  depth={depth + 1}
                  collapsedDirectories={collapsedDirectories}
                  selectedKey={selectedKey}
                  onToggleDirectory={onToggleDirectory}
                  onSelect={onSelect}
                  renderIcon={renderIcon}
                  renderSubtext={renderSubtext}
                  renderTrailing={renderTrailing}
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
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(entry.item);
              }
            }}
            className={cn(
              "group grid min-h-[30px] w-full cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1.5 px-2 py-0.5 text-left transition-colors",
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
                  "h-3.5 w-3.5",
                  selected ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]",
                )}
              />
            )}
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-[12px] font-medium leading-4",
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
