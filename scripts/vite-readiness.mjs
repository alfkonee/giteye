import { stripVTControlCharacters } from "node:util";

// Keep the displayed chunks unchanged; only strip terminal controls from the accumulated URL scan.
export function waitForViteUrl(vite, { stdout = process.stdout, stderr = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    let output = "";

    const read = (chunk) => {
      const text = chunk.toString();
      stdout.write(text);
      output += text;

      const match = stripVTControlCharacters(output).match(/Local:\s+(https?:\/\/[^\s/]+:\d+)\//);
      if (match) {
        resolve(match[1]);
      }
    };

    vite.stdout.on("data", read);
    vite.stderr.on("data", (chunk) => {
      stderr.write(chunk);
    });
    vite.once("exit", (code, signal) => {
      reject(new Error(`Vite exited before becoming ready (${signal ?? code}).`));
    });
  });
}
