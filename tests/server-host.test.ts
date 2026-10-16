import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const children: ChildProcess[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;

      const exited = once(child, "exit");

      child.kill();
      await exited;
    }),
  );
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

it.each(["react", "preact"])(
  "%s production host aborts SSR work when the HTTP client disconnects",
  async (framework) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-host-"));

    directories.push(root);

    await mkdir(join(root, "server"));
    await mkdir(join(root, "dist/server"), { recursive: true });

    const source = await readFile(
      `apps/${framework}-ssr/server/start.mjs`,
      "utf8",
    );
    const entry = join(root, "server/start.mjs");

    await Promise.all([
      writeFile(join(root, "package.json"), '{"type":"module"}'),
      writeFile(join(root, "dist/index.html"), "Host fixture"),
      writeFile(
        entry,
        `${source.replace("createServer((incoming", "const server = createServer((incoming")}\nserver.on("listening", () => process.send(server.address().port));\n`,
      ),
      writeFile(
        join(root, "dist/server/server.js"),
        `let started = false;
let aborted = false;

export const data = () => Response.json(null);

export async function render(request) {
  if (new URL(request.url).pathname === "/status") {
    return JSON.stringify({ started, aborted });
  }

  started = true;

  await new Promise((resolve) => {
    request.signal.addEventListener("abort", () => {
      aborted = true;
      resolve();
    });
  });

  return "Cancelled";
}
`,
      ),
    ]);

    const child = fork(entry, {
      env: { ...process.env, PORT: "0" },
      silent: true,
    });

    children.push(child);

    const [port] = await once(child, "message");
    const origin = `http://127.0.0.1:${port}`;
    const controller = new AbortController();
    const pending = fetch(origin, { signal: controller.signal }).catch(
      (error: Error) => error,
    );
    const status = async () => (await fetch(`${origin}/status`)).json();

    await expect.poll(async () => (await status()).started).toBe(true);

    controller.abort();

    expect(await pending).toBeInstanceOf(Error);
    await expect.poll(async () => (await status()).aborted).toBe(true);
  },
);
