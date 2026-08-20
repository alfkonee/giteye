import { describe, expect, test } from "bun:test";
import {
  findPullRequestFilePatch,
  mergePullRequestDiffFiles,
  splitPullRequestDiff,
  summarizePullRequestDiffFiles,
} from "../src/lib/pr-diff";

const MULTI_FILE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,3 @@
-old line
+new line
+added line
diff --git a/img.bin b/img.bin
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/img.bin differ
`;

describe("splitPullRequestDiff", () => {
  test("splits multi-file diffs and parses paths and line counts", () => {
    const patches = splitPullRequestDiff(MULTI_FILE_DIFF);

    expect(patches).toHaveLength(2);

    const text = patches[0];
    expect(text.path).toBe("src/foo.ts");
    expect(text.additions).toBe(2);
    expect(text.deletions).toBe(1);
    expect(text.status).toBe("modified");
    expect(text.isBinary).toBe(false);
  });

  test("flags binary patches and zeroes their line counts", () => {
    const patches = splitPullRequestDiff(MULTI_FILE_DIFF);

    const binary = patches[1];
    expect(binary.path).toBe("img.bin");
    expect(binary.status).toBe("added");
    expect(binary.isBinary).toBe(true);
    expect(binary.additions).toBe(0);
    expect(binary.deletions).toBe(0);
  });

  test("returns an empty list for nullish or empty diffs", () => {
    expect(splitPullRequestDiff(null)).toEqual([]);
    expect(splitPullRequestDiff(undefined)).toEqual([]);
    expect(splitPullRequestDiff("")).toEqual([]);
  });
});

describe("summarizePullRequestDiffFiles", () => {
  test("projects patches to file summaries", () => {
    const patches = splitPullRequestDiff(MULTI_FILE_DIFF);
    expect(summarizePullRequestDiffFiles(patches)).toEqual([
      { path: "src/foo.ts", additions: 2, deletions: 1, status: "modified" },
      { path: "img.bin", additions: 0, deletions: 0, status: "added" },
    ]);
  });
});

describe("mergePullRequestDiffFiles", () => {
  test("keeps api files first and appends only unseen parsed files", () => {
    const apiFiles = [
      { path: "a.ts", additions: 1, deletions: 0, status: "modified" },
    ];
    const parsed = [
      { path: "a.ts", additions: 1, deletions: 0, status: "modified" },
      { path: "b.ts", additions: 2, deletions: 1, status: "modified" },
    ];

    const merged = mergePullRequestDiffFiles(apiFiles, parsed);

    expect(merged.map((file) => file.path)).toEqual(["a.ts", "b.ts"]);
    // The api entry is authoritative and kept in place.
    expect(merged[0]).toBe(apiFiles[0]);
  });

  test("falls back to parsed files when api files are absent", () => {
    const parsed = [{ path: "x.ts", additions: 1, deletions: 1, status: "modified" }];
    expect(mergePullRequestDiffFiles(null, parsed)).toEqual(parsed);
  });
});

describe("findPullRequestFilePatch", () => {
  test("matches by current or old path", () => {
    const patches = [
      {
        path: "new.ts",
        oldPath: "old.ts",
        additions: 1,
        deletions: 0,
        status: "renamed",
        patchText: "",
        isBinary: false,
      },
    ];

    expect(findPullRequestFilePatch(patches, "new.ts").path).toBe("new.ts");
    expect(findPullRequestFilePatch(patches, "old.ts").path).toBe("new.ts");
    expect(findPullRequestFilePatch(patches, "missing.ts")).toBeNull();
    expect(findPullRequestFilePatch(patches, null)).toBeNull();
  });
});
