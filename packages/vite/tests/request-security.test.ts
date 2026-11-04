import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { IncomingMessage, request, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeWrapAsync } from "@smolter/core";
import { createServer } from "vite";
import { expect, it, vi } from "vitest";
import { configureTransport } from "../src/transport.ts";

it.for(
  ["react", "preact"].flatMap((framework) =>
    ["file", "application", "middleware"].map((mode) => ({ framework, mode })),
  ),
)(
  "contains malformed request targets in $framework development ($mode)",
  async ({ framework, mode }, context) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-request-security-"));
    context.onTestFinished(() => rm(root, { recursive: true, force: true }));
    const entry = join(root, "server.mjs");
    await writeFile(
      entry,
      `
import { createServer } from ${JSON.stringify(import.meta.resolve("vite"))};
import { createServer as createHost } from "node:http";
import { once } from "node:events";
import { fileRouter, applicationPlugins } from ${JSON.stringify(new URL(`../../../dist/vite/${framework}.js`, import.meta.url).href)};
const server = await createServer({ root: ${JSON.stringify(root)}, configFile: false, logLevel: "silent", plugins: ${mode === "application" ? `applicationPlugins({ framework: ${JSON.stringify(framework)}, ssr: false })` : "[fileRouter()]"}, server: { port: 0, host: "127.0.0.1", middlewareMode: ${mode === "middleware"} } });
const host = ${mode === "middleware" ? "createHost(server.middlewares)" : "server.httpServer"};
${mode === "middleware" ? 'host.listen(0, "127.0.0.1"); await once(host, "listening");' : "await server.listen();"}
process.send(host.address().port);
process.on("message", async () => {
  await server.restart();
  process.send(${mode === "middleware" ? "host" : "server.httpServer"}.address().port);
});
`,
    );
    const child = fork(entry, { silent: true });
    context.onTestFinished(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit");
      child.kill();
      await exited;
    });
    let errors = "";
    child.stderr?.on("data", (chunk) => {
      errors += String(chunk);
    });
    let [port] = await once(child, "message");
    for (const restarted of [false, true]) {
      if (restarted) {
        const ready = once(child, "message");
        child.send("restart");
        [port] = await ready;
      }
      for (const path of ["http://[", "http://[::1", "https://["]) {
        const result = await safeWrapAsync(
          () =>
            new Promise<{
              status: number;
              body: string;
              cache?: string;
              connection?: string;
            }>((resolve, reject) => {
              const outgoing = request(
                {
                  hostname: "127.0.0.1",
                  port: Number(port),
                  path,
                  headers: { Connection: "close" },
                },
                (response) => {
                  let body = "";
                  response.on("data", (chunk) => {
                    body += String(chunk);
                  });
                  response.once("end", () =>
                    resolve({
                      status: response.statusCode!,
                      body,
                      cache: response.headers["cache-control"],
                      connection: response.headers.connection,
                    }),
                  );
                },
              );
              outgoing.once("error", reject);
              outgoing.end();
            }),
        );
        expect(result.error, errors).toBeUndefined();
        expect(result.data, path).toEqual({
          status: 400,
          body: "Bad request",
          cache: "no-store",
          connection: "close",
        });
        expect(child.exitCode).toBeNull();
        expect((await fetch(`http://127.0.0.1:${port}/healthy`)).status).toBe(
          404,
        );
      }
    }
  },
);

it.for([
  "malformed",
  "callback",
  "response",
  "destroyed",
  "ended",
  "headers",
] as const)(
  "handles an escaped development request failure (%s) without nesting guards",
  async (variant, context) => {
    const server = await createServer({
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true },
    });
    context.onTestFinished(() => server.close());
    const failure =
      variant === "malformed"
        ? new TypeError("SYNTHETIC_PRIVATE_URL")
        : new Error("SYNTHETIC_INTERNAL_FAILURE");
    server.middlewares.handle = () => {
      throw failure;
    };
    configureTransport(server, "virtual:unused");
    const guarded = server.middlewares.handle;
    configureTransport(server, "virtual:unused");
    expect(server.middlewares.handle).toBe(guarded);
    const incoming = new IncomingMessage(new Socket());
    incoming.url = variant === "malformed" ? "http://[" : "/";
    const outgoing = new ServerResponse(incoming);
    if (variant === "destroyed") outgoing.destroy();
    if (variant === "ended") outgoing.end();
    if (variant === "headers") outgoing.writeHead(200);
    const logger = vi.spyOn(server.config.logger, "error");
    const write = vi.spyOn(outgoing, "writeHead");
    const end = vi.spyOn(outgoing, "end");
    const callback = variant === "callback" ? vi.fn() : undefined;
    server.middlewares(incoming, outgoing, callback);
    await expect
      .poll(() =>
        variant === "malformed"
          ? end.mock.calls.length
          : callback
            ? callback.mock.calls.length
            : logger.mock.calls.length,
      )
      .toBe(1);
    if (callback) {
      expect(callback).toHaveBeenCalledWith(failure);
      expect(logger).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    } else if (variant === "malformed" || variant === "response") {
      expect(outgoing.statusCode).toBe(variant === "malformed" ? 400 : 500);
      expect(write).toHaveBeenCalledWith(
        outgoing.statusCode,
        expect.objectContaining({
          "Cache-Control": "no-store",
          Connection: "close",
        }),
      );
      expect(end).toHaveBeenCalledWith(
        variant === "malformed" ? "Bad request" : "Request failed",
      );
    } else {
      expect(write).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled();
      if (variant === "headers") expect(outgoing.destroyed).toBe(true);
    }
  },
);
