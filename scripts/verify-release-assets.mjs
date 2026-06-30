#!/usr/bin/env node
const [tagArg] = process.argv.slice(2);
const tag = tagArg ?? process.env.GITHUB_REF_NAME;
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const releaseId = process.env.GITHUB_EVENT_RELEASE_ID;

if (!tag) {
  throw new Error("Usage: verify-release-assets.mjs <semver-tag>");
}

if (!token) {
  throw new Error("GITHUB_TOKEN is required");
}

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required");
}

const version = tag.startsWith("v") ? tag.slice(1) : tag;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

if (!semverPattern.test(version)) {
  throw new Error(`Release tag ${tag} does not contain a valid semver version`);
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const versionPattern = escapeRegExp(version);
const isPrerelease = version.includes("-");
const expectedAssetFamilies = [
  { name: "Linux AppImage", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*\\.AppImage$`) },
  { name: "Linux Debian package", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*\\.deb$`) },
  { name: "Linux RPM package", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*\\.rpm$`) },
  { name: "Windows NSIS installer", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*\\.exe$`) },
  ...(
    isPrerelease
      ? []
      : [{ name: "Windows MSI installer", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*\\.msi$`) }]
  ),
  { name: "macOS Apple Silicon app archive", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*aarch64.*\\.app\\.tar\\.gz$`) },
  { name: "macOS Intel app archive", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*(x64|x86_64).*\\.app\\.tar\\.gz$`) },
  { name: "macOS Apple Silicon DMG", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*aarch64.*\\.dmg$`) },
  { name: "macOS Intel DMG", pattern: new RegExp(`^GitEye[_-].*${versionPattern}.*(x64|x86_64).*\\.dmg$`) },
];
const expectedAssetPatterns = expectedAssetFamilies.map((family) => family.pattern);

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

const [owner, repo] = repository.split("/");
const release = releaseId
  ? { id: releaseId }
  : await github(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
const assets = await github(`/repos/${owner}/${repo}/releases/${release.id}/assets?per_page=100`);
const renamedAssets = [];

for (const asset of assets) {
  const match = /^GitEye_(aarch64|x64)\.app\.tar\.gz$/.exec(asset.name);
  if (!match) {
    continue;
  }

  const renamed = `GitEye_${version}_${match[1]}.app.tar.gz`;
  await github(`/repos/${owner}/${repo}/releases/assets/${asset.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: renamed }),
  });
  renamedAssets.push(`${asset.name} -> ${renamed}`);
  asset.name = renamed;
}

const invalidAssets = assets
  .map((asset) => asset.name)
  .filter((name) => name.startsWith("GitEye") && !name.includes(version));

if (invalidAssets.length > 0) {
  throw new Error(`Release assets missing version ${version}: ${invalidAssets.join(", ")}`);
}

const gitEyeAssets = assets.map((asset) => asset.name).filter((name) => name.startsWith("GitEye"));

if (gitEyeAssets.length === 0) {
  throw new Error(`Release has no GitEye assets for ${version}`);
}

const missingFamilies = expectedAssetFamilies
  .filter((family) => !gitEyeAssets.some((name) => family.pattern.test(name)))
  .map((family) => family.name);

if (missingFamilies.length > 0) {
  throw new Error(`Release is missing expected GitEye asset families for ${version}: ${missingFamilies.join(", ")}`);
}

const unexpectedAssets = gitEyeAssets.filter((name) => !expectedAssetPatterns.some((pattern) => pattern.test(name)));

if (unexpectedAssets.length > 0) {
  throw new Error(`Release contains unexpected GitEye assets for ${version}: ${unexpectedAssets.join(", ")}`);
}

for (const renamed of renamedAssets) {
  console.log(`Renamed ${renamed}`);
}

console.log(`Verified ${assets.length} release assets for ${version}`);
