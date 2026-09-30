#!/usr/bin/env node
// Seeds a realistic, offline demo workspace for presenting GitEye.
// See docs/demo.md for the talk track that uses these repositories.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? join(homedir(), "giteye-demo"));
const marker = join(root, ".giteye-demo");

if (existsSync(root) && readdirSync(root).length > 0 && !existsSync(marker)) {
  console.error(`Refusing to replace ${root}: it is not empty and was not created by this script.`);
  process.exit(1);
}
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
writeFileSync(marker, "Created by scripts/seed-demo-repositories.mjs\n");

const people = {
  alice: ["Alice Mensah", "alice@acme.example"],
  bob: ["Bob Okafor", "bob@acme.example"],
  carol: ["Carol Adeyemi", "carol@acme.example"],
  dave: ["Dave Boateng", "dave@acme.example"],
};

// Deterministic, spread-out history so the graph and blame look lived-in.
let clock = Date.parse("2026-09-01T09:00:00Z");
let author = people.alice;

function git(cwd, args) {
  const date = new Date(clock).toISOString();
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_EDITOR: "true",
      GIT_AUTHOR_NAME: author[0],
      GIT_AUTHOR_EMAIL: author[1],
      GIT_COMMITTER_NAME: author[0],
      GIT_COMMITTER_EMAIL: author[1],
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_ALLOW_PROTOCOL: "file",
    },
  });
}

function write(repo, path, content) {
  const full = join(repo, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function commit(repo, who, message, files) {
  author = people[who];
  clock += 7 * 60 * 60 * 1000;
  for (const [path, content] of Object.entries(files)) write(repo, path, content);
  git(repo, ["add", "--", ...Object.keys(files)]);
  git(repo, ["commit", "-m", message]);
}

const products = (extra = "", price = "12.5") => `export const products = [
  { id: "mug", name: "Enamel mug", price: ${price} },
  { id: "tee", name: "Logo tee", price: 24 },
  { id: "cap", name: "Trucker cap", price: 18 },
  { id: "tote", name: "Canvas tote", price: 15 },
  { id: "pin", name: "Enamel pin", price: 6 },
  { id: "hoodie", name: "Zip hoodie", price: 55 },
  { id: "socks", name: "Crew socks", price: 9 },
  { id: "bottle", name: "Steel bottle", price: 22 },
  { id: "sticker", name: "Sticker pack", price: 4 },
  { id: "poster", name: "Launch poster", price: 14 },
];

export function findProduct(id) {
  return products.find((product) => product.id === id);
}

export function inStock(id) {
  return Boolean(findProduct(id));
}
${extra}`;

const cart = ({ taxRate = "0.15", total = "return subtotal + tax;" } = {}) => `import { findProduct } from "./catalog.js";

export const TAX_RATE = ${taxRate};

export function subtotal(items) {
  return items.reduce((sum, item) => sum + findProduct(item.id).price * item.qty, 0);
}

export function total(items) {
  const sub = subtotal(items);
  const tax = sub * TAX_RATE;
  ${total}
}
`;

const discounts = (typo) => `const codes = {
  WELCOME10: 0.1,
  ${typo ? "LAUNCH20" : "LAUNCH25"}: 0.25,
};

export function discountFor(code) {
  return codes[code?.toUpperCase()] ?? 0;
}
`;

// --- Shared "GitHub" remote (a local bare repository) -----------------------
const origin = join(root, "remotes", "acme-shop.git");
mkdirSync(origin, { recursive: true });
git(origin, ["init", "--bare", "-b", "main"]);

// --- acme-shop: the main demo repository ------------------------------------
const repo = join(root, "acme-shop");
mkdirSync(repo);
git(repo, ["init", "-b", "main"]);
git(repo, ["remote", "add", "origin", origin]);

commit(repo, "alice", "Initial storefront scaffold", {
  "README.md": "# Acme Shop\n\nA tiny storefront used to demo GitEye.\n",
  "package.json": '{\n  "name": "acme-shop",\n  "version": "1.0.0",\n  "type": "module"\n}\n',
  "src/index.js": 'import { products } from "./catalog.js";\n\nconsole.log(`${products.length} products loaded`);\n',
  "src/catalog.js": "export const products = [];\n",
});
commit(repo, "bob", "Add product catalog", { "src/catalog.js": products() });
commit(repo, "alice", "Add cart with subtotal", { "src/cart.js": cart({ total: "return sub;" }) });
commit(repo, "carol", "Add TAX_RATE and tax calculation", { "src/cart.js": cart() });
git(repo, ["tag", "-a", "v1.0.0", "-m", "Acme Shop 1.0.0"]);
commit(repo, "bob", "Add shipping estimates", {
  "src/shipping.js":
    "export function shippingFor(subtotal) {\n  if (subtotal >= 50) return 0;\n  return subtotal * 0.0833;\n}\n",
});
commit(repo, "alice", "Document checkout flow", {
  "README.md":
    "# Acme Shop\n\nA tiny storefront used to demo GitEye.\n\n## Checkout\n\n1. Add items to the cart.\n2. Apply a discount code.\n3. Pay.\n",
});
const forkPoint = git(repo, ["rev-parse", "HEAD"]).trim();

// Feature branch that will conflict with main in src/cart.js.
git(repo, ["switch", "-c", "feature/checkout-redesign"]);
commit(repo, "bob", "Redesign cart totals formatting", {
  "src/cart.js": cart({ total: "return Number((subtotal + tax).toFixed(2));" }),
});
commit(repo, "bob", "Add checkout summary component", {
  "src/summary.js":
    'import { total } from "./cart.js";\n\nexport function summary(items) {\n  return `Total: ${total(items)}`;\n}\n',
});

// Messy branch for interactive rebase + autosquash.
git(repo, ["switch", "-c", "feature/discounts", forkPoint]);
commit(repo, "carol", "Add discount codes", { "src/discounts.js": discounts(true) });
commit(repo, "carol", "fixup! Add discount codes", { "src/discounts.js": discounts(false) });
commit(repo, "carol", "Add discount tests", {
  "tests/discounts.test.js":
    'import { discountFor } from "../src/discounts.js";\n\nconsole.assert(discountFor("welcome10") === 0.1);\n',
});
commit(repo, "carol", "fixup! Add discount tests", {
  "tests/discounts.test.js":
    'import { discountFor } from "../src/discounts.js";\n\nconsole.assert(discountFor("welcome10") === 0.1);\nconsole.assert(discountFor("nope") === 0);\n',
});
commit(repo, "carol", "WIP: debug logging", {
  "src/debug.js": 'export const DEBUG = true;\nconsole.log("discounts loaded");\n',
});

// Single hotfix commit for a cherry-pick demo.
git(repo, ["switch", "-c", "hotfix/free-shipping-threshold", forkPoint]);
commit(repo, "dave", "Lower free-shipping threshold to 40", {
  "src/shipping.js":
    "export function shippingFor(subtotal) {\n  if (subtotal >= 40) return 0;\n  return subtotal * 0.0833;\n}\n",
});

// Main keeps moving: pickaxe target + the conflicting change.
git(repo, ["switch", "main"]);
commit(repo, "carol", "Raise TAX_RATE for 2026", { "src/cart.js": cart({ taxRate: "0.16" }) });
commit(repo, "alice", "Show totals with currency symbol", {
  "src/cart.js": cart({ taxRate: "0.16", total: "return `GHS ${(subtotal + tax).toFixed(2)}`;" }),
});
git(repo, ["tag", "-a", "v1.1.0", "-m", "Acme Shop 1.1.0"]);
// Empty feature branch at main's tip: the demo's uncommitted catalog work was
// "started on main by mistake" and is moved here with "Move changes and switch".
git(repo, ["branch", "feature/catalog-pricing"]);
git(repo, ["push", "-u", "origin", "main", "feature/checkout-redesign", "--tags"]);

// A teammate pushes to origin, so acme-shop is one commit behind after fetch.
const teammate = join(root, "teammate-clone");
git(root, ["clone", origin, teammate]);
commit(teammate, "dave", "Add contributing guide", {
  "CONTRIBUTING.md": "# Contributing\n\nOpen a pull request against main.\n",
});
git(teammate, ["push", "origin", "main"]);
rmSync(teammate, { recursive: true, force: true });

// A "lost" commit: branch deleted, commit only reachable through the reflog.
git(repo, ["switch", "-c", "experiment/search"]);
commit(repo, "bob", "Prototype product search", {
  "src/search.js":
    'import { products } from "./catalog.js";\n\nexport const search = (q) => products.filter((p) => p.name.toLowerCase().includes(q));\n',
});
git(repo, ["switch", "main"]);
git(repo, ["branch", "-D", "experiment/search"]);

// A stash entry.
write(repo, "README.md", "# Acme Shop\n\nA tiny storefront used to demo GitEye.\n\n![screenshot](docs/shot.png)\n");
git(repo, ["stash", "push", "-m", "WIP: README screenshots"]);

// A linked worktree for a release branch.
const worktree = join(root, "acme-shop-release-1.1");
git(repo, ["worktree", "add", "-b", "release/1.1", worktree, "v1.1.0"]);

// Dirty working tree: two separate hunks in one file (partial staging) + a new file.
write(
  repo,
  "src/catalog.js",
  products('\nexport function priceOf(id) {\n  return findProduct(id)?.price ?? 0;\n}\n', "14"),
);
write(repo, "src/reviews.js", "export const reviews = [];\n");

// --- Verification ------------------------------------------------------------
function expect(label, condition, detail) {
  if (!condition) throw new Error(`Demo seed check failed: ${label}\n${detail ?? ""}`);
}

const status = git(repo, ["status", "--short"]).split(/\r?\n/);
expect("dirty catalog", status.includes(" M src/catalog.js"), status.join("\n"));
expect("untracked reviews", status.includes("?? src/reviews.js"), status.join("\n"));
const hunks = git(repo, ["diff", "--", "src/catalog.js"]).match(/^@@/gm)?.length ?? 0;
expect("catalog has two hunks", hunks === 2, `found ${hunks}`);

let conflicts = false;
try {
  git(repo, ["merge-tree", "--write-tree", "main", "feature/checkout-redesign"]);
} catch {
  conflicts = true;
}
expect("checkout-redesign conflicts with main", conflicts);

git(repo, ["fetch", "origin"]);
const behind = git(repo, ["rev-list", "--count", "main..origin/main"]).trim();
expect("main is behind origin by one", behind === "1", `behind=${behind}`);
expect("stash present", git(repo, ["stash", "list"]).includes("WIP: README screenshots"));
expect("lost commit in reflog", git(repo, ["log", "-g", "--format=%s"]).includes("Prototype product search"));

console.log(`GitEye demo workspace seeded at ${root}\n`);
console.log(`- main repo:  ${repo}`);
console.log(`- worktree:   ${worktree}`);
console.log(`- remote:     ${origin}`);
console.log("\nOpen it with:  giteye " + repo);
