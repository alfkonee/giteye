import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { waitForViteUrl } from "../scripts/vite-readiness.mjs";

const coloredLocal = "  \u001b[32m➜\u001b[39m  \u001b[1mLocal:\u001b[22m   \u001b[36mhttp://localhost:\u001b[1m5173\u001b[22m/\u001b[39m\n";

function readiness() {
  const vite = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  const displayed = { stdout: "", stderr: "" };
  const ready = waitForViteUrl(vite, {
    stdout: { write: (chunk) => { displayed.stdout += chunk.toString(); } },
    stderr: { write: (chunk) => { displayed.stderr += chunk.toString(); } },
  });
  return { vite, displayed, ready };
}

describe("Vite launcher readiness", () => {
  test("recognizes an ANSI-colored Local URL without stripping the displayed output", async () => {
    const { vite, displayed, ready } = readiness();
    const banner = "\n  VITE v7.0.0  ready in 120 ms\n\n";
    const warning = "\u001b[33mVite warning\u001b[39m\n";
    vite.stdout.emit("data", Buffer.from(banner));
    vite.stderr.emit("data", Buffer.from(warning));
    vite.stdout.emit("data", Buffer.from(coloredLocal));

    expect(await ready).toBe("http://localhost:5173");
    vite.stdout.emit("data", Buffer.from("output after readiness\n"));
    vite.stderr.emit("data", Buffer.from("warning after readiness\n"));
    expect(displayed.stdout).toBe(banner + coloredLocal + "output after readiness\n");
    expect(displayed.stderr).toBe(warning + "warning after readiness\n");
  });

  test("recognizes the colored URL split at every boundary, including inside escape sequences and the URL", async () => {
    for (let boundary = 1; boundary < coloredLocal.length; boundary++) {
      const { vite, displayed, ready } = readiness();
      vite.stdout.emit("data", Buffer.from(coloredLocal.slice(0, boundary)));
      vite.stdout.emit("data", Buffer.from(coloredLocal.slice(boundary)));
      expect(await ready).toBe("http://localhost:5173");
      expect(displayed.stdout).toBe(coloredLocal);
    }
  });

  test("accumulates many small chunks and waits for the complete URL", async () => {
    const { vite, displayed, ready } = readiness();
    let resolved = false;
    ready.then(() => { resolved = true; });
    const partial = "\u001b[1mLocal:\u001b[22m \u001b[36mhttps://127.0.0.1:61";
    for (const character of partial) vite.stdout.emit("data", Buffer.from(character));
    await Promise.resolve();
    expect(resolved).toBe(false);

    const rest = "23/\u001b[39m\n";
    for (const character of rest) vite.stdout.emit("data", Buffer.from(character));
    expect(await ready).toBe("https://127.0.0.1:6123");
    expect(displayed.stdout).toBe(partial + rest);
  });

  test("rejects when Vite exits before printing a complete Local URL", async () => {
    const { vite, ready } = readiness();
    vite.stdout.emit("data", Buffer.from("Local: http://localhost:51"));
    const rejection = ready.catch((error) => error);
    vite.emit("exit", 1, null);
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Vite exited before becoming ready (1).");
  });

  test("reports a signal when Vite is terminated before readiness", async () => {
    const { vite, ready } = readiness();
    const rejection = ready.catch((error) => error);
    vite.emit("exit", null, "SIGTERM");
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Vite exited before becoming ready (SIGTERM).");
  });
});
