#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF?.replace(/^refs\/tags\//, "");

if (!tag) {
  throw new Error("Usage: sync-release-version.mjs <semver-tag>");
}

const version = tag.startsWith("v") ? tag.slice(1) : tag;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

if (!semverPattern.test(version)) {
  throw new Error(`Release tag ${tag} does not contain a valid semver version`);
}

function updateJson(path, updater) {
  const absolutePath = resolve(repoRoot, path);
  const data = JSON.parse(readFileSync(absolutePath, "utf8"));
  updater(data);
  writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`);
}

function replaceRequired(path, pattern, replacement) {
  const absolutePath = resolve(repoRoot, path);
  const input = readFileSync(absolutePath, "utf8");

  if (!pattern.test(input)) {
    throw new Error(`Did not update ${path}; expected version pattern was not found`);
  }

  const output = input.replace(pattern, replacement);

  writeFileSync(absolutePath, output);
}

updateJson("package.json", (data) => {
  data.version = version;
});

updateJson("src-tauri/tauri.conf.json", (data) => {
  data.version = version;
});

replaceRequired(
  "src-tauri/Cargo.toml",
  /(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m,
  `$1"${version}"`,
);

const cargoLockPath = "src-tauri/Cargo.lock";
if (existsSync(resolve(repoRoot, cargoLockPath))) {
  replaceRequired(
    cargoLockPath,
    /(^\[\[package\]\]\nname = "giteye"\nversion = )"[^"]+"/m,
    `$1"${version}"`,
  );
}

console.log(`Synced release version ${version} from tag ${tag}`);
