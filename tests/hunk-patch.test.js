import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildHunkPatch } from "../src/lib/hunk-patch";

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd, args, stdin) {
  const result = Bun.spawnSync(["git", "-c", "diff.mnemonicPrefix=false", ...args], {
    cwd,
    stdin: stdin === undefined ? undefined : new TextEncoder().encode(stdin),
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

// Mirrors the diff viewers: split on "\n", collect file headers, one patch per hunk.
function hunkPatches(diff) {
  const patches = [];
  const header = [];
  let hunk = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      if (hunk) patches.push(buildHunkPatch(header, hunk));
      hunk = [line];
    } else if (hunk) {
      hunk.push(line);
    } else {
      header.push(line);
    }
  }
  if (hunk) patches.push(buildHunkPatch(header, hunk));
  return patches;
}

describe("buildHunkPatch", () => {
  test("every hunk of a multi-hunk diff applies to the index on its own", () => {
    const repo = mkdtempSync(join(tmpdir(), "giteye-hunk-"));
    dirs.push(repo);
    const original = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    git(repo, ["init", "-q"]);
    writeFileSync(join(repo, "file.txt"), `${original.join("\n")}\n`);
    git(repo, ["add", "file.txt"]);
    git(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base"]);
    const edited = [...original];
    edited[1] = "line 2 changed";
    edited[18] = "line 19 changed";
    writeFileSync(join(repo, "file.txt"), `${edited.join("\n")}\n`);

    const patches = hunkPatches(git(repo, ["diff", "--", "file.txt"]).stdout);
    expect(patches).toHaveLength(2);
    for (const patch of patches) {
      expect(patch.endsWith("\n")).toBe(true);
      expect(patch.endsWith("\n\n")).toBe(false);
      expect(git(repo, ["apply", "--cached", "--recount", "--check"], patch)).toMatchObject({ code: 0, stderr: "" });
    }
  });
});
