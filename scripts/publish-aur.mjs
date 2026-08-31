#!/usr/bin/env node
/**
 * Publishes/updates the giteye-bin AUR package for a release tag.
 *
 * Usage: node scripts/publish-aur.mjs <release-tag>   (e.g. v0.0.2-beta.6)
 * Requires: curl, git, ssh; env AUR_SSH_KEY with an AUR-registered private key.
 *
 * Steps: download the release .deb, pin its sha256 into the PKGBUILD,
 * regenerate .SRCINFO, clone the AUR repo (creating it on first push),
 * commit and push.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_URL = "https://github.com/alfkonee/giteye";
const AUR_URL = process.env.AUR_URL_OVERRIDE ?? "ssh://aur@aur.archlinux.org/giteye-bin.git";
const PKG_DIR = fileURLToPath(new URL("../packaging/aur/giteye-bin", import.meta.url));

// aur.archlinux.org OpenSSH host keys (ssh-keyscan, cross-check with AUR docs).
const AUR_KNOWN_HOSTS = [
  "aur.archlinux.org ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEuBKrPzbawxA/k2g6NcyV5jmqwJ2s+zpgZGZ7tpLIcN",
  "aur.archlinux.org ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDKF9vAFWdgm9Bi8uc+tYRBmXASBb5cB5iZsB7LOWWFeBrLp3r14w0/9S2vozjgqY5sJLDPONWoTTaVTbhe3vwO8CBKZTEt1AcWxuXNlRnk9FliR1/eNB9uz/7y1R0+c1Md+P98AJJSJWKN12nqIDIhjl2S1vOUvm7FNY43fU2knIhEbHybhwWeg+0wxpKwcAd/JeL5i92Uv03MYftOToUijd1pqyVFdJvQFhqD4v3M157jxS5FTOBrccAEjT+zYmFyD8WvKUa9vUclRddNllmBJdy4NyLB8SvVZULUPrP3QOlmzemeKracTlVOUG1wsDbxknF1BwSCU7CmU6UFP90kpWIyz66bP0bl67QAvlIc52Yix7pKJPbw85+zykvnfl2mdROsaT8p8R9nwCdFsBc9IiD0NhPEHcyHRwB8fokXTajk2QnGhL+zP5KnkmXnyQYOCUYo3EKMXIlVOVbPDgRYYT/XqvBuzq5S9rrU70KoI/S5lDnFfx/+lPLdtcnnEPk=",
].join("\n") + "\n";

const tag = process.argv[2] ?? process.env.AUR_TAG;
const invokedDirectly =
  Boolean(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main(tag).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function main(tag) {
  if (!tag) throw new Error("usage: publish-aur.mjs <release-tag>");
  if (!/^v\d/.test(tag)) throw new Error(`unexpected tag format: ${tag}`);
const upstream = tag.slice(1);
const pkgver = toPkgver(upstream);
  const asset = `GitEye_${upstream}_amd64.deb`;
  const assetUrl = `${REPO_URL}/releases/download/${tag}/${asset}`;

  const workdir = mkdtempSync(join(tmpdir(), "aur-publish-"));
  try {
    const debPath = join(workdir, asset);
    console.log(`Downloading ${assetUrl}`);
    execFileSync("curl", ["-fSL", "--retry", "3", "-o", debPath, assetUrl], { stdio: "inherit" });
    const sha256 = createHash("sha256").update(readFileSync(debPath)).digest("hex");

    const pkgbuildPath = join(PKG_DIR, "PKGBUILD");
    let pkgbuild = readFileSync(pkgbuildPath, "utf8");
    pkgbuild = pkgbuild
      .replace(/^_upstream=.*$/m, `_upstream=${upstream}`)
      .replace(/^pkgver=.*$/m, `pkgver=${pkgver}`)
      .replace(/^sha256sums=.*$/m, `sha256sums=('${sha256}')`);
    writeFileSync(pkgbuildPath, pkgbuild);
    console.log(`PKGBUILD updated: pkgver=${pkgver}`);

    writeFileSync(join(PKG_DIR, ".SRCINFO"), renderSrcinfo(pkgbuild));

    pushToAur(workdir);
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function pkgString(pkgbuild, field) {
  const match = pkgbuild.match(new RegExp(`^${field}=(?:"(.*)"|([^\\s#]+))`, "m"));
  if (!match) throw new Error(`PKGBUILD is missing ${field}`);
  return match[1] ?? match[2];
}

/**
 * Converts upstream semver to a vercmp-safe AUR pkgver.
 * "0.0.2-beta.5" -> "0.0.2beta05": the pre-release marker must live in the
 * same segment as the patch version so it sorts BELOW the stable "0.0.2"
 * (a dotted "0.0.2.beta.5" segment would sort ABOVE it), and the counter is
 * zero-padded so beta05 < beta10 under vercmp's string comparison.
 */
export function toPkgver(upstream) {
  const match = upstream.match(/^(\d+(?:\.\d+){2})-([a-z]+)\.(\d+)$/);
  if (!match) return upstream;
  const [, base, phase, count] = match;
  return `${base}${phase}${count.padStart(2, "0")}`;
}

/** Expands ${var} references using the PKGBUILD's own string variables, like makepkg does. */
function expandVars(pkgbuild, value) {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => pkgString(pkgbuild, name));
}

function pkgArray(pkgbuild, field) {
  const match = pkgbuild.match(new RegExp(`^${field}=\\(([\\s\\S]*?)\\)`, "m"));
  if (!match) throw new Error(`PKGBUILD is missing ${field}`);
  return [...match[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(
    (entry) => expandVars(pkgbuild, entry[1] ?? entry[2]),
  );
}

/** Renders .SRCINFO in makepkg --printsrcinfo field order (verified against makepkg). */
export function renderSrcinfo(pkgbuild) {
  const pkgname = pkgString(pkgbuild, "pkgname");
  const t = (field, value) => `\t${field} = ${value}`;
  const lines = [
    `pkgbase = ${pkgname}`,
    t("pkgdesc", pkgString(pkgbuild, "pkgdesc")),
    t("pkgver", pkgString(pkgbuild, "pkgver")),
    t("pkgrel", pkgString(pkgbuild, "pkgrel")),
    t("url", pkgString(pkgbuild, "url")),
    ...pkgArray(pkgbuild, "arch").map((v) => t("arch", v)),
    ...pkgArray(pkgbuild, "license").map((v) => t("license", v)),
    ...pkgArray(pkgbuild, "depends").map((v) => t("depends", v)),
    ...pkgArray(pkgbuild, "optdepends").map((v) => t("optdepends", v)),
    ...pkgArray(pkgbuild, "provides").map((v) => t("provides", v)),
    ...pkgArray(pkgbuild, "conflicts").map((v) => t("conflicts", v)),
    ...pkgArray(pkgbuild, "options").map((v) => t("options", v)),
    ...pkgArray(pkgbuild, "source").map((v) => t("source", v)),
    ...pkgArray(pkgbuild, "sha256sums").map((v) => t("sha256sums", v)),
    "",
    `pkgname = ${pkgname}`,
    "",
  ];
  return lines.join("\n");
}

function pushToAur(workdir) {
  const keyFile = join(workdir, "aur_key");
  const knownHosts = join(workdir, "known_hosts");
  writeFileSync(keyFile, process.env.AUR_SSH_KEY ?? "", { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  writeFileSync(knownHosts, AUR_KNOWN_HOSTS);
  const sshCommand = `ssh -i ${keyFile} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${knownHosts}`;

  const aurDir = join(workdir, "aur");
  try {
    execFileSync("git", ["clone", AUR_URL, aurDir], {
      env: { ...process.env, GIT_SSH_COMMAND: sshCommand, GIT_TERMINAL_PROMPT: "0" },
      stdio: "inherit",
    });
  } catch (error) {
    if (existsSync(aurDir)) throw error;
    console.log("AUR package does not exist yet; creating it");
    mkdirSync(aurDir);
    // The AUR publishes packages from the master branch only.
    run("git", ["init", "-b", "master"], aurDir);
    run("git", ["remote", "add", "origin", AUR_URL], aurDir, { GIT_SSH_COMMAND: sshCommand });
  }

  for (const file of ["PKGBUILD", ".SRCINFO"]) {
    writeFileSync(join(aurDir, file), readFileSync(join(PKG_DIR, file)));
  }
  run("git", ["add", "PKGBUILD", ".SRCINFO"], aurDir, { GIT_SSH_COMMAND: sshCommand });

  const status = run("git", ["status", "--porcelain"], aurDir);
  if (!status.trim()) {
    console.log("AUR already up to date; nothing to push");
    return;
  }

  run(
    "git",
    [
      "-c", "user.name=GitEye Release Bot",
      "-c", "user.email=3909521+alfkonee@users.noreply.github.com",
      "commit", "-m", `Update to ${tag}`,
    ],
    aurDir,
    { GIT_SSH_COMMAND: sshCommand },
  );
  run("git", ["push", "origin", "HEAD"], aurDir, { GIT_SSH_COMMAND: sshCommand });
  console.log(`AUR package updated to ${tag}`);
}

function run(cmd, args, cwd, extraEnv = {}) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...extraEnv },
  });
}
