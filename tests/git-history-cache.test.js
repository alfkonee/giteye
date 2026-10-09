import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  gitQueries,
  invalidateGitState,
  invalidateGitStateByReason,
} from "../src/lib/git-data";

const repoPath = "/history-cache-repo";
const otherRepoPath = "/other-history-cache-repo";

function historyQueries(path) {
  return [
    gitQueries.refHistory(path, "main", 20),
    gitQueries.refHistory(path, "main", 100),
    gitQueries.refHistory(path, "origin/main", 20),
    gitQueries.mergeBase(path, "main", "feature"),
    gitQueries.mergeBase(path, "origin/main", "feature"),
    gitQueries.revision(path, "HEAD"),
    gitQueries.revision(path, "origin/main"),
  ];
}

const refreshes = [
  ...["refs", "remote", "rebase", "reflog", "bisect"].map((reason) => ({
    name: reason,
    run: (client) => invalidateGitStateByReason(client, repoPath, reason),
  })),
  { name: "explicit refresh", run: (client) => invalidateGitState(client, repoPath) },
];

for (const refresh of refreshes) {
  test(`${refresh.name} invalidates every cached history/ref variant only in the affected repository`, async () => {
    const client = new QueryClient();
    let version = "old-ref";
    const cachedQueries = historyQueries(repoPath).map((options) => ({
      ...options,
      staleTime: Infinity,
      queryFn: async () => version,
    }));
    const otherQueries = historyQueries(otherRepoPath).map((options) => ({
      ...options,
      staleTime: Infinity,
      queryFn: async () => version,
    }));
    try {
      await Promise.all([...cachedQueries, ...otherQueries].map((options) => client.fetchQuery(options)));
      version = "new-ref";
      await refresh.run(client);

      for (const options of cachedQueries) {
        expect(client.getQueryState(options.queryKey).isInvalidated).toBe(true);
        // Reopening a cached popup must read the moved refs, despite its infinite stale time.
        expect(await client.fetchQuery(options)).toBe("new-ref");
      }
      for (const options of otherQueries) {
        expect(client.getQueryState(options.queryKey).isInvalidated).toBe(false);
        expect(await client.fetchQuery(options)).toBe("old-ref");
      }
    } finally {
      client.clear();
    }
  });

  test(`${refresh.name} refetches histories and resolved refs while their consumers are active`, async () => {
    const client = new QueryClient();
    let version = "old-ref";
    const options = historyQueries(repoPath).map((query) => ({
      ...query,
      staleTime: Infinity,
      queryFn: async () => version,
    }));
    const unsubscribe = [];
    try {
      await Promise.all(options.map((query) => client.fetchQuery(query)));
      for (const query of options) {
        const observer = new QueryObserver(client, query);
        unsubscribe.push(observer.subscribe(() => {}));
      }
      version = "new-ref";
      await refresh.run(client);
      for (const query of options) {
        expect(client.getQueryData(query.queryKey)).toBe("new-ref");
        expect(client.getQueryState(query.queryKey).isInvalidated).toBe(false);
      }
    } finally {
      for (const stop of unsubscribe) stop();
      client.clear();
    }
  });
}

test("worktree-only changes retain cached histories and resolved refs", async () => {
  const client = new QueryClient();
  let version = "old-ref";
  const options = historyQueries(repoPath).map((query) => ({
    ...query,
    staleTime: Infinity,
    queryFn: async () => version,
  }));
  try {
    await Promise.all(options.map((query) => client.fetchQuery(query)));
    version = "new-ref";
    await invalidateGitStateByReason(client, repoPath, "worktree");
    for (const query of options) {
      expect(client.getQueryState(query.queryKey).isInvalidated).toBe(false);
      expect(await client.fetchQuery(query)).toBe("old-ref");
    }
  } finally {
    client.clear();
  }
});
