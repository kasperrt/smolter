import { expect, it, vi } from "vitest";
import { lazyRoute as preactLazy } from "../packages/preact/src/lazy-route.ts";
import { lazyRoute as reactLazy } from "../packages/react/src/lazy-route.ts";
import { deferred } from "./helpers/deferred.ts";

for (const [name, lazyRoute] of [
  ["react", reactLazy],
  ["preact", preactLazy],
] as const) {
  it(`${name} shares its pending import with reentrant preload`, async () => {
    const module = { default: () => null };
    const gate = deferred<typeof module>();
    const started = deferred<void>();
    let calls = 0;
    let reentered: Promise<void> | undefined;
    const route = lazyRoute({ path: "/lazy" }, () => {
      calls++;
      if (calls === 1) reentered = route.preload!();
      started.resolve(undefined);
      return gate.promise;
    });
    const first = route.preload!();
    await started.promise;
    expect(route.resolveComponent()).toBeUndefined();
    gate.resolve(module);
    await first;
    await reentered;
    expect(calls).toBe(1);
    expect(reentered).toBe(first);
    expect(route.resolveComponent()).toBe(module.default);
    await route.preload!();
    expect(calls).toBe(1);
  });
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
