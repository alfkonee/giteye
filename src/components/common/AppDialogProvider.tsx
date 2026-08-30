import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, X } from "lucide-react";
import { Button, Input } from "../ui";

export type AppDialogTone = "default" | "danger" | "warning";

interface BaseDialogOptions {
  title: string;
  message: string;
  detail?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
}

export interface PromptDialogOptions extends BaseDialogOptions {
  initialValue?: string;
  inputLabel?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}

interface AppDialogApi {
  alert: (options: BaseDialogOptions) => Promise<void>;
  confirm: (options: BaseDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
}

let mountedDialogApi: AppDialogApi | null = null;

function requireDialogApi() {
  if (!mountedDialogApi) throw new Error("AppDialogProvider is not mounted");
  return mountedDialogApi;
}

/**
 * Imperative facade for workflow helpers and menus that are not React hooks.
 * It intentionally mirrors the three native popup operations while returning
 * promises, allowing every caller to use the same themed, non-blocking modal.
 */
export const appDialog = {
  alert(message: string, title = "GitEye") {
    return requireDialogApi().alert({ title, message });
  },
  confirm(message: string, title = "Confirm action", tone: AppDialogTone = "warning") {
    return requireDialogApi().confirm({ title, message, tone });
  },
  prompt(message: string, initialValue = "", title = "Enter value") {
    return requireDialogApi().prompt({
      title,
      message,
      initialValue,
      inputLabel: message,
    });
  },
};

type PendingDialogRequest =
  | { kind: "alert"; options: BaseDialogOptions; resolve: (value: void) => void }
  | { kind: "confirm"; options: BaseDialogOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptDialogOptions; resolve: (value: string | null) => void };

type DialogRequest = PendingDialogRequest & { id: number };

const AppDialogContext = createContext<AppDialogApi | null>(null);

export function useAppDialog() {
  const api = useContext(AppDialogContext);
  if (!api) throw new Error("useAppDialog must be used inside AppDialogProvider");
  return api;
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<DialogRequest | null>(null);
  const queueRef = useRef<DialogRequest[]>([]);
  const nextRequestIdRef = useRef(0);

  const showNext = useCallback(() => {
    setActive(queueRef.current.shift() ?? null);
  }, []);

  const enqueue = useCallback((request: PendingDialogRequest) => {
    // Unique per-request id used as the AppDialog key so every dialog remounts:
    // queued prompts must not inherit a previous prompt's input, and the
    // focus-in effect must rerun for each new dialog.
    const requestWithId: DialogRequest = { ...request, id: nextRequestIdRef.current++ };
    setActive((current) => {
      if (current) {
        queueRef.current.push(requestWithId);
        return current;
      }
      return requestWithId;
    });
  }, []);

  const api = useMemo<AppDialogApi>(
    () => ({
      alert: (options) => new Promise<void>((resolve) => enqueue({ kind: "alert", options, resolve })),
      confirm: (options) =>
        new Promise<boolean>((resolve) => enqueue({ kind: "confirm", options, resolve })),
      prompt: (options) =>
        new Promise<string | null>((resolve) => enqueue({ kind: "prompt", options, resolve })),
    }),
    [enqueue],
  );

  const settle = useCallback(
    (value: boolean | string | null | void) => {
      if (!active) return;
      if (active.kind === "alert") active.resolve();
      else if (active.kind === "confirm") active.resolve(Boolean(value));
      else active.resolve(typeof value === "string" ? value : null);
      showNext();
    },
    [active, showNext],
  );


  useEffect(() => {
    mountedDialogApi = api;
    return () => {
      if (mountedDialogApi === api) mountedDialogApi = null;
    };
  }, [api]);
  return (
    <AppDialogContext.Provider value={api}>
      {children}
      {active ? <AppDialog key={active.id} request={active} onSettle={settle} /> : null}
    </AppDialogContext.Provider>
  );
}

function AppDialog({
  request,
  onSettle,
}: {
  request: DialogRequest;
  onSettle: (value: boolean | string | null | void) => void;
}) {
  const { options } = request;
  const [input, setInput] = useState(request.kind === "prompt" ? request.options.initialValue ?? "" : "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const isPrompt = request.kind === "prompt";
  const isAlert = request.kind === "alert";
  const canSubmit = !isPrompt || request.options.allowEmpty !== false || input.trim().length > 0;

  // Capture the invoker first, then move focus into the dialog; restore on
  // close so keyboard users never land back at <body>.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (isPrompt) inputRef.current?.focus();
    else sectionRef.current?.focus();
    return () => {
      if (document.activeElement === document.body) previous?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSettle(isAlert ? undefined : request.kind === "confirm" ? false : null);
        return;
      }
      // Trap Tab inside the dialog while it is open.
      if (event.key === "Tab" && sectionRef.current) {
        const focusables = sectionRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !sectionRef.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAlert, onSettle, request.kind]);

  const tone = options.tone ?? "default";
  const Icon = tone === "default" ? Info : AlertTriangle;
  const confirmVariant = tone === "danger" ? "danger" : "primary";

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onSettle(isAlert ? undefined : request.kind === "confirm" ? false : null);
        }
      }}
    >
      <section
        ref={sectionRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className="w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)] outline-none"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
          <div
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]"
            data-tone={tone}
          >
            <Icon
              className={
                tone === "danger"
                  ? "h-4 w-4 text-[var(--color-danger)]"
                  : tone === "warning"
                    ? "h-4 w-4 text-[var(--color-warning)]"
                    : "h-4 w-4 text-[var(--color-accent)]"
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="app-dialog-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
              {options.title}
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--color-text-secondary)]">
              {options.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSettle(isAlert ? undefined : request.kind === "confirm" ? false : null)}
            className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm"
            aria-label="Close dialog"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-3">
          {options.detail ? (
            <pre className="max-h-[42vh] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-3 font-mono text-[11px] leading-5 text-[var(--color-text-secondary)]">
              {options.detail}
            </pre>
          ) : null}
          {request.kind === "prompt" ? (
            <label className="block space-y-1.5 text-xs text-[var(--color-text-secondary)]">
              {request.options.inputLabel ? <span>{request.options.inputLabel}</span> : null}
              <Input
                ref={inputRef}
                value={input}
                placeholder={request.options.placeholder}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSubmit) onSettle(input);
                }}
              />
            </label>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/70 px-4 py-2.5">
          {!isAlert ? (
            <Button variant="ghost" onClick={() => onSettle(request.kind === "confirm" ? false : null)}>
              {options.cancelLabel ?? "Cancel"}
            </Button>
          ) : null}
          <Button
            variant={confirmVariant}
            disabled={!canSubmit}
            onClick={() => onSettle(isPrompt ? input : isAlert ? undefined : true)}
          >
            {options.confirmLabel ?? (isAlert ? "OK" : "Continue")}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
