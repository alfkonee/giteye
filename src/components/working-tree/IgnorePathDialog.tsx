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
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (patterns: string[], scope: IgnoreScope) => void;
}

const CUSTOM_OPTION = "custom";

export function IgnorePathDialog({ target, isPending, onCancel, onConfirm }: IgnorePathDialogProps) {
  const suggestions = useMemo(
    () => buildIgnoreSuggestions(target.path, target.kind),
    [target.path, target.kind],
  );
  const [selectedId, setSelectedId] = useState(suggestions[0]?.id ?? CUSTOM_OPTION);
  const [customPattern, setCustomPattern] = useState("");
  const [scope, setScope] = useState<IgnoreScope>("repository");

  const trackedCount = target.files.filter(
    (file) => parseFileStatus(file.status) !== "untracked",
  ).length;
  const selected = suggestions.find((suggestion) => suggestion.id === selectedId);
  const pattern = selectedId === CUSTOM_OPTION ? customPattern.trim() : (selected?.pattern ?? "");
  const canSubmit = pattern.length > 0 && !isPending;

  const submit = () => {
    if (!canSubmit) return;
    onConfirm([pattern], scope);
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="ignore-path-title"
        className="w-[calc(100vw-2rem)] max-w-xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 shadow-[var(--shadow-elevated)]"
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
              Adds a rule so Git stops reporting this path as a change.
            </p>
            <code className="mt-1 block break-all font-mono text-xs text-[var(--color-text-secondary)]">
              {target.path}
            </code>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
            {target.kind === "directory" ? "folder" : "file"}
          </span>
        </div>

        {trackedCount > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2.5 text-xs text-[var(--color-warning)]">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {trackedCount === 1
                ? "1 file here is already tracked by Git and will keep showing changes."
                : `${trackedCount} files here are already tracked by Git and will keep showing changes.`}{" "}
              Ignore rules only apply to untracked paths.
            </p>
          </div>
        )}

        <fieldset className="mt-4">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Pattern
          </legend>
          <div className="mt-2 space-y-1.5">
            {suggestions.map((suggestion) => (
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
          </div>
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
            Add ignore rule
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
