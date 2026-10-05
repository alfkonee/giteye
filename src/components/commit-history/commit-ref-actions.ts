import { planBranchActivation } from "../../lib/branch-activation";
import type { Branch } from "../../types/git";
import type { DisplayRef } from "./commit-refs";

/** Branch choices on a commit; tags and HEAD are not merge/rebase sources. */
export function integrableRefs(refs: DisplayRef[] | undefined): DisplayRef[] {
  if (!refs?.length) return [];
  const seen = new Set<string>();
  const usable: DisplayRef[] = [];
  for (const ref of refs) {
    if (ref.isTag || ref.isHead || ref.label === "HEAD" || seen.has(ref.label)) continue;
    seen.add(ref.label);
    usable.push(ref);
    if (usable.length === 2) break;
  }
  return usable;
}

export type RemoteRefEntry =
  | { kind: "checkout"; refLabel: string; localName: string }
  | { kind: "fast-forward"; refLabel: string; localName: string; behind: number }
  | { kind: "synced"; refLabel: string; localName: string }
  | { kind: "diverged"; refLabel: string; localName: string; ahead: number; behind: number };

/** Remote branch controls require a real branch record; a tag decoration cannot activate one. */
export function remoteRefEntries(refs: DisplayRef[] | undefined, branches: Branch[] | undefined): RemoteRefEntry[] {
  if (!refs?.length || !branches?.length) return [];
  const entries: RemoteRefEntry[] = [];
  for (const ref of refs) {
    if (ref.isTag || !ref.isRemote) continue;
    const remote = branches.find((branch) => branch.isRemote && branch.shortName === ref.label);
    if (!remote) continue;

    const plan = planBranchActivation(remote, branches);
    switch (plan.kind) {
      case "create-tracking":
        entries.push({ kind: "checkout", refLabel: ref.label, localName: plan.localName });
        break;
      case "fast-forward":
        entries.push({ kind: "fast-forward", refLabel: ref.label, localName: plan.local.shortName, behind: plan.behind });
        break;
      case "already-synced":
        entries.push({ kind: "synced", refLabel: ref.label, localName: plan.local.shortName });
        break;
      case "diverged":
        entries.push({ kind: "diverged", refLabel: ref.label, localName: plan.local.shortName, ahead: plan.ahead, behind: plan.behind });
        break;
    }
  }
  return entries;
}
