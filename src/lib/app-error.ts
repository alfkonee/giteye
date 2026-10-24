interface AppCommandErrorDetails {
  code?: string;
  command?: string | null;
  recoveryHint?: string | null;
  retryable?: boolean;
}

const UNKNOWN_ERROR_MESSAGE = "An unexpected error occurred.";

export class AppCommandError extends Error {
  readonly code: string;
  readonly command: string | null;
  readonly recoveryHint: string | null;
  readonly retryable: boolean;

  constructor(message: string, details: AppCommandErrorDetails = {}) {
    super(message);
    this.name = "AppCommandError";
    this.code = details.code ?? "UNKNOWN_ERROR";
    this.command = details.command ?? null;
    this.recoveryHint = details.recoveryHint ?? null;
    this.retryable = details.retryable ?? false;
  }
}

function property(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try {
    return Reflect.get(value, key);
  } catch {
    // Unknown rejection payloads can contain getters or proxies that throw.
    return undefined;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeAppError(error: unknown, command?: string): AppCommandError {
  const suppliedCommand = text(command);
  // Read only the public error contract. Never serialize unknown payloads: they
  // may contain arguments, credentials, circular references, or private data.
  const message = text(error) ?? text(property(error, "message")) ?? text(property(error, "error")) ?? UNKNOWN_ERROR_MESSAGE;
  const errorCommand = text(property(error, "command")) ?? suppliedCommand;
  const code = text(property(error, "code")) ?? "UNKNOWN_ERROR";
  const recoveryHint = text(property(error, "recoveryHint"));
  const retryable = property(error, "retryable") === true;
  try {
    if (error instanceof AppCommandError && error.command === errorCommand) return error;
  } catch {
    // Even prototype access can fail on an unknown proxy payload.
  }
  return new AppCommandError(message, { code, command: errorCommand, recoveryHint, retryable });
}

export function formatAppError(error: unknown): string {
  const normalized = normalizeAppError(error);
  const parts = [normalized.message];
  if (normalized.recoveryHint && normalized.recoveryHint !== normalized.message) {
    parts.push(normalized.recoveryHint);
  }
  if (normalized.command) parts.push(`Command: ${normalized.command}.`);
  return parts.join("\n");
}
