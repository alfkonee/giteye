import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EyeOff, FileWarning, Users, X } from "lucide-react";
import type { IgnoreScope } from "../../types/git";
import { parseFileStatus } from "../../types/git";
import { buildIgnoreSuggestions } from "../../lib/gitignore";
import { Button, Input } from "../ui";
import { cn } from "../../lib/cn";
import type { WorkingTreePathTarget } from "./WorkingTreePathContextMenu";

interface IgnorePathDialogProps {
  target: WorkingTreePathTarget;
  initialScope: IgnoreScope;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (patterns: string[], scope: IgnoreScope, affectTracked: boolean) => void;
}

const CUSTOM_OPTION = "custom";

export function IgnorePathDialog({
  target,
  initialScope,
  isPending,
  onCancel,
  onConfirm,
}: IgnorePathDialogProps) {
  const suggestions = useMemo(
    () => buildIgnoreSuggestions(target.path, target.kind),
    [target.path, target.kind],
  );
  const [selectedId, setSelectedId] = useState(suggestions[0]?.id ?? CUSTOM_OPTION);
  const [customPattern, setCustomPattern] = useState("");
  const [scope, setScope] = useState<IgnoreScope>(initialScope);
  const [affectTracked, setAffectTracked] = useState(false);

  const trackedCount = target.files.filter(
    (file) => parseFileStatus(file.status) !== "untracked",
  ).length;
  const exact = suggestions.find((suggestion) => suggestion.id === "exact");
  const selected = suggestions.find((suggestion) => suggestion.id === selectedId);
  const pattern = affectTracked
    ? (exact?.pattern ?? "")
    : selectedId === CUSTOM_OPTION ? customPattern.trim() : (selected?.pattern ?? "");
  const undoPath = target.kind === "directory"
    ? "'path/to/tracked-file'"
    : `'${target.path.replace(/'/g, "'\\''")}'`;
  const canSubmit = pattern.length > 0 && !isPending;

  const submit = () => {
    if (!canSubmit) return;
    onConfirm([pattern], scope, affectTracked);
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="ignore-path-title"
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 shadow-[var(--shadow-elevated)]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="ignore-path-title" className="text-base font-semibold text-[var(--color-text-primary)]">
              Ignore {target.kind === "directory" ? "folder" : "file"}
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Add an ignore rule, with an optional action for tracked files.
            </p>
            <code className="mt-1 block break-all font-mono text-xs text-[var(--color-text-secondary)]">
              {target.path}
            </code>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
            {target.kind === "directory" ? "folder" : "file"}
          </span>
        </div>

        {!affectTracked && (trackedCount > 0 || target.kind === "directory") && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2.5 text-xs text-[var(--color-warning)]">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {target.kind === "directory"
                ? "This folder may include tracked files, including unchanged files not shown in this list."
                : "This file is already tracked by Git."}{" "}
              Rules alone only ignore untracked paths; tracked changes will still appear.
            </p>
          </div>
        )}

        <fieldset className="mt-4">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Pattern
          </legend>
          <div className="mt-2 space-y-1.5">
            {suggestions.filter((suggestion) => !affectTracked || suggestion.id === "exact").map((suggestion) => (
              <OptionRow
                key={suggestion.id}
                name="ignore-pattern"
                checked={selectedId === suggestion.id}
                onSelect={() => setSelectedId(suggestion.id)}
                title={suggestion.label}
                description={suggestion.description}
                trailing={
                  <code className="shrink-0 font-mono text-[11px] text-[var(--color-accent)]">
                    {suggestion.pattern}
                  </code>
                }
              />
            ))}
            {!affectTracked && (
              <OptionRow
                name="ignore-pattern"
                checked={selectedId === CUSTOM_OPTION}
                onSelect={() => setSelectedId(CUSTOM_OPTION)}
                title="Custom pattern"
                description="Write a gitignore pattern by hand."
              >
                <Input
                  value={customPattern}
                  onChange={(event) => setCustomPattern(event.target.value)}
                  onFocus={() => setSelectedId(CUSTOM_OPTION)}
                  placeholder="e.g. build/**/*.tmp"
                  aria-label="Custom ignore pattern"
                  className="mt-2 font-mono text-xs"
                  spellCheck={false}
                />
              </OptionRow>
            )}
          </div>
          {affectTracked && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Locked to this exact path. Other locations matching a name, extension, or custom pattern will not be changed.
            </p>
          )}
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Where to save
          </legend>
          <div className="mt-2 grid gap-1.5 min-[480px]:grid-cols-2">
            <OptionRow
              name="ignore-scope"
              checked={scope === "repository"}
              onSelect={() => setScope("repository")}
              title=".gitignore"
              description="Shared with everyone; commit the change."
              icon={<Users className="h-3.5 w-3.5" />}
            />
            <OptionRow
              name="ignore-scope"
              checked={scope === "local"}
              onSelect={() => setScope("local")}
              title=".git/info/exclude"
              description="Only this clone; never committed."
              icon={<EyeOff className="h-3.5 w-3.5" />}
            />
          </div>
        </fieldset>

        <fieldset className="mt-4" disabled={isPending}>
          <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Tracked files
          </legend>
          <div className="mt-2 space-y-1.5">
            <OptionRow
              name="ignore-tracked"
              checked={!affectTracked}
              onSelect={() => setAffectTracked(false)}
              title="Add rules only"
              description="Leave tracked files and their changes alone."
            />
            <OptionRow
              name="ignore-tracked"
              checked={affectTracked}
              onSelect={() => {
                setSelectedId("exact");
                setAffectTracked(true);
              }}
              title={scope === "repository" ? "Also stop tracking selected files" : "Also hide tracked edits locally"}
              description={target.kind === "directory"
                ? "Applies to all tracked files inside this folder, including unchanged descendants."
                : trackedCount > 0
                  ? "Applies only to this tracked file."
                  : "Applies only if this file is tracked when the action runs."}
            />
          </div>
        </fieldset>

        {affectTracked && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2.5 text-xs text-[var(--color-warning)]">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 space-y-2">
              {scope === "repository" ? (
                <p>
                  Stops tracking the selected files but keeps their local contents.
                  Removals from Git are staged: commit them with the .gitignore change
                  to share this behavior. Git will reject unsafe removals rather than discard staged data.
                </p>
              ) : (
                <>
                  <p>
                    Uses skip-worktree to hide tracked edits in this clone; .git/info/exclude
                    alone cannot do that. Files remain tracked. This can block branch switching
                    or merging and is not a protection against overwriting files.
                    Staged changes, conflicts, missing files, and submodules are rejected.
                  </p>
                  <p>
                    Undo from the repository root{target.kind === "directory"
                      ? ": run this for each affected tracked file, replacing the example path. This command takes file paths, not a folder."
                      : ":"}
                  </p>
                  <code className="block break-all font-mono text-[11px]">
                    git update-index --no-skip-worktree -- {undoPath}
                  </code>
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
            icon={<X className="h-4 w-4" />}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            icon={<EyeOff className="h-4 w-4" />}
          >
            {affectTracked
              ? scope === "repository" ? "Ignore and stop tracking" : "Ignore and hide tracked edits"
              : "Add ignore rule"}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function OptionRow({
  name,
  checked,
  onSelect,
  title,
  description,
  icon,
  trailing,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 transition-colors",
        checked
          ? "border-[var(--color-border-accent)] bg-[var(--color-bg-selected-muted)] text-[var(--color-text-primary)]"
          : "border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)]",
      )}
    >
      <label className="block cursor-pointer">
        <div className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={checked}
            onChange={onSelect}
            className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
          />
          {icon ? <span className="shrink-0 text-[var(--color-accent)]">{icon}</span> : null}
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text-primary)]">
            {title}
          </span>
          {trailing}
        </div>
        <p className="mt-0.5 pl-[22px] text-[11px] text-[var(--color-text-muted)]">{description}</p>
      </label>
      {children ? <div className="pl-[22px]">{children}</div> : null}
    </div>
  );
}
