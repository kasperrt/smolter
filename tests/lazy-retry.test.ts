import { expect, it, vi } from "vitest";
import { lazyRoute as preactLazy } from "../packages/preact/src/lazy-route.ts";
import { lazyRoute as reactLazy } from "../packages/react/src/lazy-route.ts";

for (const [name, lazyRoute] of [
  ["react", reactLazy],
  ["preact", preactLazy],
] as const) {
  it(`${name} retries after module preparation throws`, async () => {
    const failure = new Error("Module preparation failed");
    const importer = vi
      .fn()
      .mockResolvedValueOnce({
        get clientLoader() {
          throw failure;
        },
      })
      .mockResolvedValue({ clientLoader: () => "ready" });
    const route = lazyRoute({ path: "/" }, importer);
    await expect(route.preload!()).rejects.toBe(failure);
    await expect(route.preload!()).resolves.toBeUndefined();
    expect(importer).toHaveBeenCalledTimes(2);
  });
}
