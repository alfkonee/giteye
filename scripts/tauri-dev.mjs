import { spawn } from "node:child_process";

function start(command, args, options = {}) {
  const child = spawn(command, args, options);

  child.once("error", (error) => {
    throw error;
  });

  return child;
}

function waitForViteUrl(vite) {
  return new Promise((resolve, reject) => {
    let output = "";

    const read = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      output += text;

      const match = output.match(/Local:\s+(https?:\/\/[^\s/]+:\d+)\//);
      if (match) {
        resolve(match[1]);
      }
    };

    vite.stdout.on("data", read);
    vite.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
    vite.once("exit", (code, signal) => {
      reject(new Error(`Vite exited before becoming ready (${signal ?? code}).`));
    });
  });
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
