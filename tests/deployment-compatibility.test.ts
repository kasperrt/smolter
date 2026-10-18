import { afterEach, expect, it, vi } from "vitest";
import { deploymentCheck } from "../packages/client/src/deployment-check.ts";

afterEach(() => vi.unstubAllGlobals());

it("compares route dependencies, shared code, missing routes and legacy manifests conservatively", async () => {
  vi.stubGlobal("location", { href: "https://app.test/admin/" });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const options = {
    version: "old",
    shared: "shell",
    routes: [{ path: "/admin/:id", fingerprint: "a" }],
    manifestURL: "/manifest",
    checkInterval: 0,
  };
  const check = deploymentCheck(options);
  for (const [manifest, expected] of [
    [
      {
        version: "new",
        shared: "shell",
        routes: [{ path: "/admin/:id", fingerprint: "a" }],
      },
      false,
    ],
    [
      {
        version: "new",
        shared: "shell",
        routes: [{ path: "/admin/:id", fingerprint: "b" }],
      },
      true,
    ],
    [{ version: "new", shared: "other", routes: options.routes }, true],
    [{ version: "new", shared: "shell", routes: [] }, true],
    [{ version: "new" }, true],
    [{ version: "old" }, false],
    [{ version: "new", shared: 2, routes: [] }, false],
    [{ version: "new", shared: "shell", routes: [{}] }, false],
    [null, false],
  ] as const) {
    fetcher.mockResolvedValueOnce(Response.json(manifest));
    expect(
      await check.changed(new URL("https://app.test/admin/user?q=2#hash")),
    ).toBe(expected);
  }
  check.dispose();
});

it("forces a fresh check for missing chunks even when compatible metadata is cached", async () => {
  vi.stubGlobal("location", { href: "https://app.test/" });
  const metadata = {
    version: "old",
    shared: "shell",
    routes: [{ path: "/", fingerprint: "home" }],
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(metadata))
    .mockResolvedValueOnce(Response.json({ ...metadata, version: "new" }));
  vi.stubGlobal("fetch", fetcher);
  const check = deploymentCheck({ ...metadata, manifestURL: "/manifest" });
  expect(await check.changed(new URL("https://app.test/"))).toBe(false);
  expect(await check.changed(new URL("https://app.test/"))).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await check.changed(new URL("https://app.test/"), true)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  check.dispose();
});
