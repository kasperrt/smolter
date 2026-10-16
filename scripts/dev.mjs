import { spawn } from "node:child_process";

const apps = ["react", "preact", "react-ssr", "preact-ssr"];
const basePort = Number(process.env.SMOLTER_PORT ?? 5173);
const children = apps.map((name, index) =>
  spawn(
    "pnpm",
    [
      "--filter",
      `@smolter/${name}`,
      "dev",
      "--port",
      String(basePort + index),
      "--strictPort",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, VITE_EXAMPLE_BASE_PORT: String(basePort) },
    },
  ),
);

function stop() {
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for (const child of children)
  child.on("exit", (code) => {
    if (code) {
      process.exitCode = code;
      stop();
    }
  });
