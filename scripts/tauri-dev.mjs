import { spawn } from "node:child_process";
import { waitForViteUrl } from "./vite-readiness.mjs";

function start(command, args, options = {}) {
  const child = spawn(command, args, options);

  child.once("error", (error) => {
    throw error;
  });

  return child;
}

const vite = start("bun", ["run", "dev"], {
  env: { ...process.env, GITEYE_AUTO_SELECT_DEV_PORT: "1" },
  stdio: ["inherit", "pipe", "pipe"],
});
const devUrl = await waitForViteUrl(vite);
const config = JSON.stringify({
  build: {
    beforeDevCommand: "bun -e \"process.exit()\"",
    devUrl,
  },
  // Shipped builds set withGlobalTauri to false. The debug-only MCP bridge plugin returns
  // results through window.__TAURI__, so dev runs re-enable the global for live verification.
  app: {
    withGlobalTauri: true,
  },
});

console.log(`Starting GitEye against ${devUrl}`);

const tauri = start("bunx", ["tauri", "dev", "--config", config, ...process.argv.slice(2)], {
  stdio: "inherit",
});

let stopping = false;
function stop(signal) {
  if (stopping) {
    return;
  }

  stopping = true;
  tauri.kill(signal);
  vite.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(signal));
}

vite.once("exit", (code, signal) => {
  if (!stopping) {
    stop("SIGTERM");
    process.exitCode = code ?? (signal ? 1 : 0);
  }
});

tauri.once("exit", (code, signal) => {
  stop("SIGTERM");
  process.exitCode = code ?? (signal ? 1 : 0);
});
