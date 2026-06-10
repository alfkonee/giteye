import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useNoticeStore, type Notice } from "../../stores/notice-store";

export function NoticeCenter() {
  const notices = useNoticeStore((state) => state.notices);
  const dismissNotice = useNoticeStore((state) => state.dismissNotice);
  const pruneExpired = useNoticeStore((state) => state.pruneExpired);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      pruneExpired(current);
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [pruneExpired]);

  const visibleNotices = useMemo(
    () => notices.filter((notice) => notice.status === "pending" || notice.expiresAt === null || notice.expiresAt > now),
    [notices, now],
  );

  if (visibleNotices.length === 0) {
    return null;
  }

  return (
    <aside
      aria-live="polite"
      aria-label="Action notices"
      className="pointer-events-none fixed bottom-8 right-4 z-[80] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {visibleNotices.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} now={now} onDismiss={dismissNotice} />
      ))}
    </aside>
  );
}

function NoticeCard({ notice, now, onDismiss }: { notice: Notice; now: number; onDismiss: (id: string) => void }) {
  const isPending = notice.status === "pending";
  const elapsedSeconds = Math.max(0, Math.floor(((notice.finishedAt ?? now) - notice.createdAt) / 1_000));
  const statusDetail = isPending ? runningDetail(notice.detail, elapsedSeconds) : notice.detail;

  return (
    <div
      className={cn(
        "pointer-events-auto overflow-hidden rounded-xl border bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)]",
        notice.status === "error"
          ? "border-[var(--color-danger)]/45"
          : notice.status === "success"
            ? "border-[var(--color-success)]/35"
            : "border-[var(--color-border)]",
      )}
    >
      <div className="flex gap-3 px-3 py-3">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
            notice.status === "error"
              ? "border-[var(--color-danger)]/35 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
              : notice.status === "success"
                ? "border-[var(--color-success)]/35 bg-[var(--color-success)]/10 text-[var(--color-success)]"
                : "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
          )}
        >
          {notice.status === "pending" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : notice.status === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : notice.status === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Info className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{notice.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">{statusDetail}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(notice.id)}
              className="-mr-1 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              aria-label={`Dismiss ${notice.title}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <span>{notice.category}</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
            <span>{elapsedLabel(elapsedSeconds)}</span>
          </div>
        </div>
      </div>

      {isPending && (
        <div className="h-0.5 overflow-hidden bg-[var(--color-border-muted)]">
          <div className="h-full w-1/2 animate-[giteye-notice-progress_1.4s_ease-in-out_infinite] rounded-full bg-[var(--color-accent)]" />
        </div>
      )}
    </div>
  );
}

function runningDetail(detail: string, elapsedSeconds: number) {
  if (elapsedSeconds >= 20) {
    return `${detail} Still running; watching for completion and repository state changes…`;
  }

  if (elapsedSeconds >= 6) {
    return `${detail} Git is still working; live views will refresh after completion…`;
  }

  return detail;
}

function elapsedLabel(elapsedSeconds: number) {
  if (elapsedSeconds < 1) {
    return "just now";
  }

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
