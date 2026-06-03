import type { ReactNode } from "react";
import { Monitor, User, FileText, Sun, Moon } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";

export function SettingsPlaceholder() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const isDark = theme === "dark";

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-11 items-center border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Settings</h2>
          <p className="text-[11px] text-[var(--color-text-muted)]">Application preferences</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-2xl space-y-5">
          <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <SettingsHeader
              icon={<Monitor className="h-4 w-4" />}
              title="Appearance"
              description="Tune the desktop shell for your environment."
            />
            <div className="divide-y divide-[var(--color-border-muted)]">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]">
                    {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-[var(--color-text-primary)]">Theme</div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {isDark ? "Dark interface enabled" : "Light interface enabled"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-0.5">
                  <ThemeButton active={theme === "light"} onClick={() => setTheme("light")} icon={<Sun className="h-3.5 w-3.5" />}>
                    Light
                  </ThemeButton>
                  <ThemeButton active={theme === "dark"} onClick={() => setTheme("dark")} icon={<Moon className="h-3.5 w-3.5" />}>
                    Dark
                  </ThemeButton>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-[13px] font-medium text-[var(--color-text-primary)]">Diff Mode</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">Default viewer presentation</div>
                </div>
                <span className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-2.5 py-1 text-[12px] text-[var(--color-text-secondary)]">
                  Unified
                </span>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <SettingsHeader
              icon={<User className="h-4 w-4" />}
              title="Identity"
              description="Git author information for commits."
            />
            <div className="px-4 py-3 text-[12px] text-[var(--color-text-muted)]">
              GitEye uses your global Git config by default.
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <SettingsHeader
              icon={<FileText className="h-4 w-4" />}
              title="Git"
              description="Command-line integration."
            />
            <div className="px-4 py-3 text-[12px] text-[var(--color-text-muted)]">
              GitEye uses git from your system PATH.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SettingsHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
        {icon}
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
        <p className="text-[11px] text-[var(--color-text-muted)]">{description}</p>
      </div>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "bg-[var(--color-accent)] text-white shadow-sm"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
