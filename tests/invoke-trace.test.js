import { expect, test } from "bun:test";
import { redactTraceText } from "../src/lib/invoke-trace";

test("redacts credentials embedded in trace strings", () => {
  const embeddedCredential = ["octocat", "ghp_", "secret"].join(":");
  const queryToken = ["query", "secret"].join("-");
  const bearerToken = ["bearer", "secret"].join("-");
  const value = redactTraceText(
    `git clone https://${embeddedCredential}@github.com/example/repo?access_token=${queryToken} Authorization: Bearer ${bearerToken}`,
  );

  expect(value).toBe(
    "git clone https://[REDACTED]@github.com/example/repo?access_token=[REDACTED] Authorization: [REDACTED]",
  );
  expect(value).not.toContain(embeddedCredential);
  expect(value).not.toContain(queryToken);
  expect(value).not.toContain(bearerToken);
});

test("redacts credential assignments in error text", () => {
  const value = redactTraceText("request failed: api_key=api-secret; password: password-secret");

  expect(value).toBe("request failed: api_key=[REDACTED]; password: [REDACTED]");
});
