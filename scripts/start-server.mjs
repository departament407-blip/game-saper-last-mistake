import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = process.env.PORT || "3000";
const serveEntrypoint = join(root, "node_modules", "serve", "build", "main.js");
const listenEndpoint = `tcp://0.0.0.0:${port}`;

const server = spawn(process.execPath, [serveEntrypoint, "--single", "--listen", listenEndpoint, "dist"], {
  cwd: root,
  stdio: "inherit",
  shell: false
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
