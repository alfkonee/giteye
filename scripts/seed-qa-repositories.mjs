#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".giteye-qa");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "GitEye QA",
      GIT_AUTHOR_EMAIL: "qa@giteye.local",
      GIT_COMMITTER_NAME: "GitEye QA",
      GIT_COMMITTER_EMAIL: "qa@giteye.local",
      GIT_ALLOW_PROTOCOL: "file",
    },
  });
}

function initRepo(name) {
  const repo = join(root, name);
  mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.name", "GitEye QA"]);
  git(repo, ["config", "user.email", "qa@giteye.local"]);
  writeFileSync(join(repo, "README.md"), `# ${name}\n`);
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "Initial commit"]);
  return repo;
}

function seedDirtyRepo() {
  const repo = initRepo("dirty-repo");
  writeFileSync(join(repo, "src.js"), "export const value = 1;\n");
  git(repo, ["add", "src.js"]);
  git(repo, ["commit", "-m", "Add source file"]);
  writeFileSync(join(repo, "src.js"), "export const value = 2;\n");
  writeFileSync(join(repo, "untracked.txt"), "untracked\n");
  writeFileSync(join(repo, "staged.txt"), "staged\n");
  git(repo, ["add", "staged.txt"]);
  return repo;
}

function seedStagedUnstagedSameFileRepo() {
  const repo = initRepo("staged-unstaged-same-file-repo");
  writeFileSync(join(repo, "same-file.txt"), "base\n");
  git(repo, ["add", "same-file.txt"]);
  git(repo, ["commit", "-m", "Add same-file fixture"]);
  writeFileSync(join(repo, "same-file.txt"), "staged change\n");
  git(repo, ["add", "same-file.txt"]);
  writeFileSync(join(repo, "same-file.txt"), "unstaged change\n");
  return repo;
}

function seedWorktreeRepo() {
  const repo = initRepo("worktree-repo");
  writeFileSync(join(repo, "feature.txt"), "base\n");
  git(repo, ["add", "feature.txt"]);
  git(repo, ["commit", "-m", "Add feature base"]);
  git(repo, ["branch", "feature/worktree"]);
  const worktree = join(root, "worktree-repo-feature");
  git(repo, ["worktree", "add", worktree, "feature/worktree"]);
  writeFileSync(join(worktree, "feature.txt"), "worktree dirty state\n");
  return repo;
}

function seedSubmoduleRepo() {
  const child = initRepo("submodule-child");
  writeFileSync(join(child, "lib.txt"), "library v1\n");
  git(child, ["add", "lib.txt"]);
  git(child, ["commit", "-m", "Add library file"]);

  const repo = initRepo("submodule-parent");
  git(repo, ["submodule", "add", child, "libs/child"]);
  git(repo, ["commit", "-m", "Add child submodule"]);

  writeFileSync(join(child, "lib.txt"), "library v2\n");
  git(child, ["add", "lib.txt"]);
  git(child, ["commit", "-m", "Update child library"]);
  git(join(repo, "libs/child"), ["fetch"]);
  return repo;
}

function seedConflictRepo() {
  const repo = initRepo("conflict-repo");
  writeFileSync(join(repo, "conflict.txt"), "base\n");
  git(repo, ["add", "conflict.txt"]);
  git(repo, ["commit", "-m", "Add conflict file"]);

  git(repo, ["checkout", "-b", "feature/conflict"]);
  writeFileSync(join(repo, "conflict.txt"), "feature change\n");
  git(repo, ["commit", "-am", "Feature change"]);

  git(repo, ["checkout", "main"]);
  writeFileSync(join(repo, "conflict.txt"), "main change\n");
  git(repo, ["commit", "-am", "Main change"]);
  git(repo, ["checkout", "feature/conflict"]);
  try {
    git(repo, ["rebase", "main"]);
  } catch {
    // Expected: leave repository in active rebase/conflict state for resolver QA.
  }
  return repo;
}

function assertRepoExists(label, repo) {
  if (!existsSync(join(repo, ".git"))) {
    throw new Error(`${label} repository was not seeded at ${repo}`);
  }
}

function assertStatusIncludes(label, repo, expectedLine) {
  const status = git(repo, ["status", "--short"]);
  if (!status.split("\n").includes(expectedLine)) {
    throw new Error(`${label} repository status did not include ${JSON.stringify(expectedLine)}.\nActual status:\n${status}`);
  }
}

function verifySeededRepos(repos) {
  for (const [label, repo] of Object.entries(repos)) {
    assertRepoExists(label, repo);
  }

  assertStatusIncludes("dirty", repos.dirty, " M src.js");
  assertStatusIncludes("dirty", repos.dirty, "A  staged.txt");
  assertStatusIncludes("dirty", repos.dirty, "?? untracked.txt");
  assertStatusIncludes("staged+unstaged", repos.stagedUnstaged, "MM same-file.txt");
  assertStatusIncludes("conflict", repos.conflict, "UU conflict.txt");
}

const repos = {
  clean: initRepo("clean-repo"),
  dirty: seedDirtyRepo(),
  stagedUnstaged: seedStagedUnstagedSameFileRepo(),
  worktree: seedWorktreeRepo(),
  submodule: seedSubmoduleRepo(),
  conflict: seedConflictRepo(),
};

verifySeededRepos(repos);

console.log("GitEye QA repositories seeded:");
for (const [state, repo] of Object.entries(repos)) {
  console.log(`- ${state}: ${repo}`);
}
console.log("\nOpen these paths from the Repo Hub to verify clean/dirty/staged+unstaged/worktree/submodule/rebase conflict states.");
