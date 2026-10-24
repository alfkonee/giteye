import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppCommandError, formatAppError, normalizeAppError } from "../src/lib/app-error";
import { ErrorCallout } from "../src/components/common/ErrorCallout";
import { clearInvokeTraces, getInvokeTraces, setInvokeTraceRecording, tracedInvoke } from "../src/lib/invoke-trace";

test("native errors retain their typed metadata and actionable display", () => {
  const error = normalizeAppError({
    code: "git_conflict",
    message: "Merge has conflicts.",
    command: "merge_branch",
    recoveryHint: "Resolve the conflicted files before continuing.",
    retryable: false,
  });

  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(AppCommandError);
  expect(error.code).toBe("git_conflict");
  expect(error.command).toBe("merge_branch");
  expect(error.retryable).toBe(false);
  expect(formatAppError(error)).toContain(error.message);
  expect(formatAppError(error)).toContain(error.recoveryHint!);
  expect(formatAppError(error)).toContain(error.command!);
  expect(normalizeAppError(error)).toBe(error);
});

test("local exceptions, legacy plugin errors and strings have readable messages", () => {
  const clipboardError = new DOMException("Clipboard permission denied", "NotAllowedError");
  expect(normalizeAppError(clipboardError).message).toBe(clipboardError.message);
  expect(formatAppError(clipboardError)).not.toContain("NotAllowedError:");
  expect(normalizeAppError("Repository is busy", "git_status").command).toBe("git_status");
  expect(formatAppError({ error: "Plugin unavailable" })).toBe("Plugin unavailable");

  const typedError = new AppCommandError("Fetch failed", {
    code: "network_error",
    recoveryHint: "Check the connection.",
    retryable: true,
  });
  const withCommand = normalizeAppError(typedError, "fetch_remote");
  expect(withCommand.code).toBe(typedError.code);
  expect(withCommand.recoveryHint).toBe(typedError.recoveryHint);
  expect(withCommand.retryable).toBe(true);
  expect(withCommand.command).toBe("fetch_remote");
});

test("unknown and hostile payloads never serialize private content", () => {
  const circular: Record<string, unknown> = { token: "private-token", args: { prompt: "private-prompt" } };
  circular.self = circular;
  const hostile = new Proxy({}, {
    get() { throw new Error("private-getter"); },
    getPrototypeOf() { throw new Error("private-prototype"); },
  });
  const fallback = formatAppError(null);
  for (const payload of [null, undefined, 42, false, {}, circular, hostile, { message: {}, error: [] }]) {
    const error = normalizeAppError(payload, "git_status");
    expect(error.message).toBe(fallback);
    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.command).toBe("git_status");
    expect(error.recoveryHint).toBeNull();
    expect(error.retryable).toBe(false);
    const formatted = formatAppError(payload);
    expect(formatted).not.toContain("private-");
    expect(formatted).not.toContain("[object Object]");
    expect(formatted).toBe(fallback);
  }
});

test("ErrorCallout formats typed errors and retains string caller support", () => {
  const error = new AppCommandError("Repository unavailable", {
    recoveryHint: "Open an existing repository.",
    command: "git_status",
  });
  const markup = renderToStaticMarkup(createElement(ErrorCallout, { error }));
  expect(markup).toContain('role="alert"');
  expect(markup).toContain(error.message);
  expect(markup).toContain(error.recoveryHint!);
  expect(markup).toContain(error.command!);
  expect(renderToStaticMarkup(createElement(ErrorCallout, { message: "Legacy message" }))).toContain("Legacy message");
});

test("IPC failures normalize with recording disabled or enabled, while traces redact display text", async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const scheduled: (() => void)[] = [];
  const payload = {
    code: "authentication_failed",
    message: "Fetch failed: token=private-token at /home/person/private-repo",
    command: null,
    recoveryHint: "Update password=private-password before fetching.",
    retryable: true,
    args: { prompt: "private-prompt" },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __TAURI_INTERNALS__: { invoke: () => Promise.reject(payload) },
      setTimeout(callback: () => void) {
        scheduled.push(callback);
        return scheduled.length;
      },
    },
  });

  try {
    for (const recording of [false, true]) {
      setInvokeTraceRecording(recording);
      clearInvokeTraces();
      const failure = await tracedInvoke("fetch_remote").catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AppCommandError);
      const error = failure as AppCommandError;
      expect(error.code).toBe(payload.code);
      expect(error.command).toBe("fetch_remote");
      expect(error.recoveryHint).toBe(payload.recoveryHint);
      expect(error.retryable).toBe(true);
      if (!recording) {
        expect(getInvokeTraces()).toHaveLength(0);
      } else {
        const trace = getInvokeTraces()[0];
        expect(trace.status).toBe("failed");
        expect(trace.error).toContain("fetch_remote");
        expect(trace.error).toContain("[REDACTED]");
        expect(trace.error).not.toContain("private-token");
        expect(trace.error).not.toContain("private-password");
        expect(trace.error).not.toContain("/home/person");
        expect(trace.error).not.toContain("private-prompt");
      }
    }
  } finally {
    setInvokeTraceRecording(false);
    clearInvokeTraces();
    for (const callback of scheduled) callback();
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
