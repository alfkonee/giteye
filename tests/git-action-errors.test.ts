import { afterEach, expect, spyOn, test } from "bun:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { AppCommandError } from "../src/lib/app-error";
import { gitMutations } from "../src/lib/git-data";
import { gitApi } from "../src/lib/tauri-api";
import { useNoticeStore } from "../src/stores/notice-store";

const request = { commitHash: "1234567890abcdef", mode: "hard" as const, confirmDiscardChanges: true };

afterEach(() => {
  useNoticeStore.setState({ notices: [], operationTranscript: [] });
});

test("failed hard reset preserves native guidance and operation recovery in notice and transcript", async () => {
  const client = new QueryClient();
  const nativeHint = "Close the process holding the index lock before trying again.";
  const failure = new AppCommandError("The repository index is locked.", {
    code: "git_locked",
    command: "reset_to_commit",
    recoveryHint: nativeHint,
  });
  const reset = spyOn(gitApi, "resetToCommit").mockRejectedValue(failure);
  try {
    const mutation = new MutationObserver(client, gitMutations.resetToCommit(client, "/repo"));
    await expect(mutation.mutate(request)).rejects.toBe(failure);

    const notice = useNoticeStore.getState().notices[0]!;
    expect(notice.status).toBe("error");
    expect(notice.detail).toContain(failure.message);
    expect(notice.detail).toContain(failure.command!);
    expect(notice.detail).not.toContain(nativeHint);
    expect(notice.recoveryHint).toContain(nativeHint);
    expect(notice.recoveryHint).toMatch(/reflog/i);
    expect(notice.recoveryHint).toMatch(/overwrites.*working tree.*index/i);
    expect(notice.recoveryHint!.split(nativeHint)).toHaveLength(2);
    const transcript = useNoticeStore.getState().operationTranscript[0]!;
    expect(transcript.detail).toBe(notice.detail);
    expect(transcript.recoveryHint).toBe(notice.recoveryHint);
  } finally {
    reset.mockRestore();
    client.clear();
  }
});

test("identical native and operation recovery guidance is displayed only once", async () => {
  const client = new QueryClient();
  let operationHint = "";
  const reset = spyOn(gitApi, "resetToCommit").mockImplementation(async () => {
    operationHint = useNoticeStore.getState().notices[0]!.recoveryHint!;
    throw new AppCommandError("Reset failed.", { recoveryHint: `  ${operationHint}  ` });
  });
  try {
    const mutation = new MutationObserver(client, gitMutations.resetToCommit(client, "/repo"));
    await expect(mutation.mutate(request)).rejects.toThrow("Reset failed.");

    const notice = useNoticeStore.getState().notices[0]!;
    expect(operationHint.length).toBeGreaterThan(0);
    expect(notice.recoveryHint).toBe(operationHint);
    expect(notice.detail).not.toContain(operationHint);
    expect(useNoticeStore.getState().operationTranscript[0]!.recoveryHint).toBe(operationHint);
  } finally {
    reset.mockRestore();
    client.clear();
  }
});
