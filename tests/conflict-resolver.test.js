import { beforeEach, expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import {
  applyRegion,
  conflictRegions,
  resultLineSeparator,
  resultPatch,
} from "../src/components/conflicts/conflict-text";
import {
  sessionHasDrafts,
  useConflictStore,
} from "../src/stores/conflict-store";

function operation(overrides = {}) {
  return {
    id: "merge-1",
    operation: "merge",
    phase: "conflicted",
    current: null,
    source: null,
    target: null,
    currentLabel: "Current branch",
    incomingLabel: "Incoming branch",
    allowedActions: ["continue", "abort"],
    conflicts: [
      { path: "file.txt", status: "UU", conflictType: "both modified" },
    ],
    rebase: {
      inProgress: false,
      headName: null,
      onto: null,
      origHead: null,
      rebaseDir: null,
      currentStep: null,
      totalSteps: null,
      todo: [],
      done: [],
      conflicts: [],
    },
    ...overrides,
  };
}

function content(overrides = {}) {
  const stage = {
    present: true,
    oid: "blob",
    mode: "100644",
    content: "side\n",
    label: "Side",
  };
  return {
    filePath: "file.txt",
    absolutePath: "/repo/file.txt",
    operationId: "merge-1",
    revision: "revision-1",
    kind: "text",
    base: stage,
    ours: stage,
    theirs: stage,
    result: "worktree\n",
    resultExists: true,
    regions: [],
    submodule: null,
    warning: null,
    ...overrides,
  };
}

beforeEach(() =>
  useConflictStore.setState({
    sessions: {},
    openRepositories: {},
    openRepoPath: null,
    autoOpened: {},
  }),
);

test("ordered region choices preserve CRLF, diff3 bases, Unicode offsets, and untouched regions", () => {
  const text =
    "😀 start\r\n<<<<<<< current\r\na\r\n||||||| base\r\nold\r\n=======\r\nb\r\n>>>>>>> incoming\r\nkeep\r\n<<<<<<< current\r\nx\r\n=======\r\ny\r\n>>>>>>> incoming\r\nlast";
  const regions = conflictRegions(text);
  expect(regions).toHaveLength(2);
  expect(regions[0].base).toBe("old\r\n");
  const first = applyRegion(text, regions[0], "incomingCurrent");
  expect(first).toStartWith("😀 start\r\nb\r\na\r\nkeep\r\n");
  const remaining = conflictRegions(first);
  expect(remaining).toHaveLength(1);
  expect(applyRegion(first, remaining[0], "currentIncoming")).toBe(
    "😀 start\r\nb\r\na\r\nkeep\r\nx\r\ny\r\nlast",
  );
});

test("editor serialization preserves BOM, CRLF and mixed-newline text", () => {
  for (const text of [
    "\uFEFFfirst\r\nsecond\r\n",
    "first\r\nsecond\nthird",
    "\uFEFF",
    "",
  ]) {
    const state = EditorState.create({
      doc: text,
      extensions: [EditorState.lineSeparator.of(resultLineSeparator(text))],
    });
    expect(state.sliceDoc()).toBe(text);
    const updated = state.update({
      changes: { from: state.doc.length, insert: "!" },
    }).state;
    expect(updated.sliceDoc()).toBe(`${text}!`);
  }
});

test("read-only review patches retain empty-file and missing-final-newline distinctions", () => {
  const patch = resultPatch("file.txt", "", "hello");
  expect(patch).toContain(
    "@@ -0,0 +1,1 @@\n+hello\n\\ No newline at end of file\n",
  );
  expect(resultPatch("file.txt", "hello\n", "hello")).toContain(
    "-hello\n+hello\n\\ No newline at end of file",
  );
});

test("dismissal and repository switching preserve drafts and independent selections", () => {
  const store = useConflictStore.getState();
  store.sync("/parent", operation());
  store.receive("/parent", content());
  store.setResolution("/parent", "file.txt", {
    kind: "text",
    content: "parent draft",
  });
  store.open("/parent");
  store.close("/parent");
  store.sync("/child", operation({ id: "child-operation" }));
  store.open("/child");
  store.open("/parent");
  expect(
    useConflictStore.getState().sessions["/parent"].files["file.txt"].resolution
      .content,
  ).toBe("parent draft");
  expect(useConflictStore.getState().sessions["/child"].operationId).toBe(
    "child-operation",
  );
  expect(
    sessionHasDrafts(useConflictStore.getState().sessions["/parent"]),
  ).toBe(true);
});

test("external changes preserve both versions until explicit reconciliation", () => {
  const store = useConflictStore.getState();
  store.sync("/repo", operation());
  store.receive("/repo", content());
  store.setResolution("/repo", "file.txt", {
    kind: "text",
    content: "my draft",
  });
  store.receive(
    "/repo",
    content({ revision: "external", result: "external edit" }),
  );
  let file = useConflictStore.getState().sessions["/repo"].files["file.txt"];
  expect(file.content.revision).toBe("revision-1");
  expect(file.resolution.content).toBe("my draft");
  expect(file.external.result).toBe("external edit");
  store.reconcile("/repo", "file.txt", true);
  file = useConflictStore.getState().sessions["/repo"].files["file.txt"];
  expect(file.content.revision).toBe("external");
  expect(file.resolution.content).toBe("my draft");
  expect(file.dirty).toBe(true);
});

test("late save responses never clear edits made while the write was running", () => {
  const store = useConflictStore.getState();
  store.sync("/repo", operation());
  store.receive("/repo", content());
  store.setResolution("/repo", "file.txt", {
    kind: "text",
    content: "first draft",
  });
  const savedVersion =
    useConflictStore.getState().sessions["/repo"].files["file.txt"].version;
  store.setResolution("/repo", "file.txt", {
    kind: "text",
    content: "later draft",
  });
  store.receive(
    "/repo",
    content({ revision: "saved", result: "first draft" }),
    savedVersion,
    true,
  );
  const file = useConflictStore.getState().sessions["/repo"].files["file.txt"];
  expect(file.resolution.content).toBe("later draft");
  expect(file.dirty).toBe(true);
  expect(file.external.result).toBe("first draft");
});

test("saved re-edits of resolved files block continuation until explicitly restaged", () => {
  const store = useConflictStore.getState();
  store.sync("/repo", operation({ conflicts: [], phase: "ready" }));
  store.receive("/repo", content());
  store.setResolution("/repo", "file.txt", {
    kind: "text",
    content: "new content",
  });
  const version =
    useConflictStore.getState().sessions["/repo"].files["file.txt"].version;
  store.receive(
    "/repo",
    content({ revision: "saved", result: "new content" }),
    version,
  );
  let session = useConflictStore.getState().sessions["/repo"];
  expect(session.files["file.txt"].dirty).toBe(false);
  expect(sessionHasDrafts(session)).toBe(true);
  store.receive(
    "/repo",
    content({ revision: "staged", result: "new content" }),
    session.files["file.txt"].version,
    true,
  );
  session = useConflictStore.getState().sessions["/repo"];
  expect(sessionHasDrafts(session)).toBe(false);
});

test("operation replacement retains dirty buffers until confirmed discard", () => {
  const store = useConflictStore.getState();
  store.sync("/repo", operation());
  store.receive("/repo", content());
  store.setResolution("/repo", "file.txt", { kind: "delete" });
  const replacement = operation({ id: "new-operation" });
  store.sync("/repo", replacement);
  expect(useConflictStore.getState().sessions["/repo"].operationId).toBe(
    "merge-1",
  );
  store.sync("/repo", replacement, true);
  expect(useConflictStore.getState().sessions["/repo"].operationId).toBe(
    "new-operation",
  );
  expect(
    useConflictStore.getState().sessions["/repo"].files["file.txt"],
  ).toBeUndefined();
});

test("queue cancellation and editor edits make prepared proposals ineligible", () => {
  const store = useConflictStore.getState();
  store.sync("/repo", operation());
  store.receive("/repo", content());
  store.updateFile("/repo", "file.txt", (file) => ({
    ...file,
    ai: { status: "running", version: file.version },
  }));
  const token = useConflictStore.getState().sessions["/repo"].queueToken;
  store.cancelQueue("/repo");
  let session = useConflictStore.getState().sessions["/repo"];
  expect(session.queueToken).not.toBe(token);
  expect(session.files["file.txt"].ai.status).toBe("cancelled");
  store.updateFile("/repo", "file.txt", (file) => ({
    ...file,
    ai: { status: "ready", version: file.version },
  }));
  store.setResolution("/repo", "file.txt", {
    kind: "text",
    content: "manual edit",
  });
  session = useConflictStore.getState().sessions["/repo"];
  expect(session.files["file.txt"].ai.status).toBe("stale");
  expect(session.files["file.txt"].version).not.toBe(
    session.files["file.txt"].ai.version,
  );
});
