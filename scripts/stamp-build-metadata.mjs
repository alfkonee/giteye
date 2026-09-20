#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const packageVersion = JSON.parse(read("package.json")).version;
const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
if (tauriConfig.identifier !== "com.giteye.app") {
  throw new Error("Production application identifier must be com.giteye.app");
}
const versions = {
  "package.json": packageVersion,
  "src-tauri/tauri.conf.json": tauriConfig.version,
  "src-tauri/Cargo.toml": read("src-tauri/Cargo.toml").match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1],
  "src-tauri/Cargo.lock": read("src-tauri/Cargo.lock").match(/^\[\[package\]\]\r?\nname = "giteye"\r?\nversion = "([^"]+)"/m)?.[1],
};
const version = process.argv[2]?.replace(/^v/, "") ?? packageVersion;
if (typeof version !== "string" || !version) throw new Error("Build version is missing");
for (const [path, actual] of Object.entries(versions)) {
  if (actual !== version) throw new Error(`${path} version ${actual ?? "missing"} does not match build version ${version}`);
}

// Use the actual checkout, not GITHUB_SHA: release tags and PR merge checkouts
// may differ from a workflow's source/event commit.
const commit = execFileSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error("Build commit is not a full Git commit ID");
if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `GITEYE_BUILD_COMMIT=${commit}\nGITEYE_BUILD_VERSION=${version}\n`);
}
console.log(`Verified build metadata: version ${version}, commit ${commit}`);
