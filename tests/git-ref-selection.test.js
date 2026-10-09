import { afterEach, expect, test } from "bun:test";
import { useAppStore } from "../src/stores/app-store";

const initialState = useAppStore.getState();
afterEach(() => useAppStore.setState(initialState, true));

const stash = { kind: "stash", name: "stash@{1}", commitHash: "saved-work" };

test("saved ref inspection replaces commit comparison and file details without entering a commit range", () => {
  const store = useAppStore.getState();
  store.setActiveRepoPath("/selection-repo");
  store.setSelectedCommitRange(["base", "tip"]);
  store.setSelectedCommitFilePath("source.txt");
  store.setSelectedGitRef(stash);
  const selected = useAppStore.getState();
  expect(selected.selectedGitRef).toEqual(stash);
  expect(selected.selectedCommitRange).toEqual([]);
  expect(selected.selectedCommitHash).toBeNull();
  expect(selected.selectedCommitFilePath).toBeNull();
  expect(selected.selectedFilePath).toBeNull();
  expect(selected.selected.commitRange).toEqual([]);
});

test("selecting a commit or working file exits stash inspection", () => {
  const store = useAppStore.getState();
  store.setActiveRepoPath("/selection-repo");
  store.setSelectedGitRef(stash);
  store.setSelectedCommitRange(["base", "tip"]);
  expect(useAppStore.getState().selectedGitRef).toBeNull();
  expect(useAppStore.getState().selectedCommitRange).toEqual(["base", "tip"]);
  store.setSelectedGitRef(stash);
  store.setSelectedFile("source.txt", true);
  expect(useAppStore.getState().selectedGitRef).toBeNull();
  expect(useAppStore.getState().selectedFilePath).toBe("source.txt");
  expect(useAppStore.getState().selectedFileStaged).toBe(true);
});

test("transient ref selection is never restored under a changed repository or view", () => {
  const store = useAppStore.getState();
  store.setActiveRepoPath("/selection-repo");
  store.setSelectedGitRef(stash);
  store.setActiveRepoPath("/another-repo");
  expect(useAppStore.getState().selectedGitRef).toBeNull();
  store.setActiveRepoPath("/selection-repo");
  expect(useAppStore.getState().selectedGitRef).toBeNull();
  store.setSelectedGitRef({ kind: "tag", name: "v1", commitHash: "release" });
  store.setActiveView("branches");
  expect(useAppStore.getState().selectedGitRef).toBeNull();
});
