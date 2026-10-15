import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = (() => fileURLToPath(new URL("../", import.meta.url)))();
const STOP_TIMEOUT_MS = (() => 5_000)();

// Direct Node children keep shutdown under this process's control (no shell tree).
export const runDevelopment = (
  commands,
  {
    spawnChild = spawn,
    signals = process,
    stopTimeoutMs = STOP_TIMEOUT_MS,
  } = {},
) =>
  new Promise((resolve) => {
    const children = new Set();
    let stopping = false;
    let exitCode = 0;
    let killTimer;
    const finish = () => {
      if (!stopping || children.size) return;
      clearTimeout(killTimer);
      signals.removeListener("SIGINT", interrupt);
      signals.removeListener("SIGTERM", terminate);
      resolve(exitCode);
    };
    const stop = (code) => {
      if (stopping) return;
      stopping = true;
      exitCode = code;
      for (const child of children) child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        for (const child of children) child.kill("SIGKILL");
      }, stopTimeoutMs);
      finish();
    };
    const interrupt = () => stop(130);
    const terminate = () => stop(143);
    signals.once("SIGINT", interrupt);
    signals.once("SIGTERM", terminate);
    try {
      for (const command of commands) {
        const child = spawnChild(command.executable, command.args, {
          cwd: ROOT,
          stdio: "inherit",
        });
        children.add(child);
        child.once("error", (error) => {
          console.error(`Development process failed: ${error.message}`);
          children.delete(child);
          stop(1);
          finish();
        });
        child.once("exit", (code) => {
          children.delete(child);
          stop(code ?? 1);
          finish();
        });
      }
    } catch (error) {
      console.error(error);
      stop(1);
    }
    if (!children.size) {
      stop(1);
      finish();
    }
  });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDevelopment([
    {
      executable: process.execPath,
      args: ["packages/server/dist/main.js"],
    },
    {
      executable: process.execPath,
      args: [
        "packages/client/node_modules/vite/bin/vite.js",
        "packages/client",
      ],
    },
  ]);
}
