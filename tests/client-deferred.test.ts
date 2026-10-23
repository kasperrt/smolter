import { createDataRouter } from "@smolter/core";
import { prepareRoutes } from "@smolter/core/prepare-routes";
import { data } from "@smolter/core/responses";
import { expect, it, onTestFinished } from "vitest";
import { deferred } from "./helpers/deferred.ts";

it("commits client loader data without awaiting nested promises", async () => {
  const optional = deferred<string>();
  const payload = { optional: optional.promise, nested: [optional.promise] };
  const router = createDataRouter(
    prepareRoutes([{ path: "/", clientLoader: () => data(payload) }]),
  );
  const navigation = router.navigate("/");
  const committed = await Promise.race([
    navigation,
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
  ]);
  optional.resolve("ready");
  await navigation;
  expect(committed).not.toBe(false);
  expect(router.getSnapshot().data).toBe(payload);
  expect(await payload.optional).toBe("ready");
  router.dispose();
});

it.each(["loader", "clientLoader", "action", "clientAction"] as const)(
  "preserves returned Error identity and normalizes thrown Responses from %s",
  async (key) => {
    const failure = Error("Returned failure", {
      cause: Error("Earlier failure"),
    });
    let throwsResponse = false;
    const router = createDataRouter(
      prepareRoutes([
        {
          path: "/",
          [key]: () => {
            if (throwsResponse)
              throw new Response("Forbidden", { status: 403 });
            return failure;
          },
        },
      ]),
    );
    onTestFinished(router.dispose);
    const run = () =>
      key === "loader" || key === "clientLoader"
        ? router.navigate("/")
        : router.submit("/", new FormData());
    await run();
    expect(router.getSnapshot().error).toBe(failure);
    throwsResponse = true;
    await run();
    expect(router.getSnapshot().error).toMatchObject({
      message: "Forbidden",
      status: 403,
    });
  },
);

it("awaits required client work while preserving cycles and nested promise identity", async () => {
  const required = deferred<void>();
  const optional = deferred<{ child: Promise<string> }>();
  const child = deferred<string>();
  const payload: {
    optional: typeof optional.promise;
    self?: unknown;
    date: Date;
  } = {
    optional: optional.promise,
    date: new Date(),
  };
  payload.self = payload;
  const router = createDataRouter(
    prepareRoutes([
      {
        path: "/",
        clientLoader: async () => {
          await required.promise;
          return payload;
        },
      },
    ]),
  );
  const navigation = router.navigate("/");
  await Promise.resolve();
  expect(router.getSnapshot().loaded).toBe(false);
  required.resolve();
  await navigation;
  expect(router.getSnapshot().data).toBe(payload);
  optional.resolve({ child: child.promise });
  await optional.promise;
  child.resolve("nested");
  expect(await (await optional.promise).child).toBe("nested");
  router.dispose();
});

it("keeps late client rejections observable without restoring an abandoned route", async () => {
  let reject!: (error: Error) => void;
  const optional = new Promise<string>((_resolve, fail) => {
    reject = fail;
  });
  const router = createDataRouter(
    prepareRoutes([
      { path: "/", clientLoader: () => ({ optional }) },
      { path: "/next", loader: () => "next" },
    ]),
  );
  await router.navigate("/");
  const payload = router.getSnapshot().data as { optional: Promise<string> };
  expect(payload.optional).toBe(optional);
  await router.navigate("/next");
  reject(new Error("optional failed"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await expect(payload.optional).rejects.toThrow("optional failed");
  expect(router.getSnapshot().data).toBe("next");
  expect(router.getSnapshot().error).toBeUndefined();
  router.dispose();
});

it("preserves deferred client values for prefetch, fetchers and revalidation", async () => {
  const pending = deferred<string>();
  const payload = { optional: pending.promise };
  let loads = 0;
  const router = createDataRouter(
    prepareRoutes([
      {
        path: "/",
        clientLoader: () => {
          loads++;
          return payload;
        },
      },
    ]),
  );
  await router.prefetch("/");
  await router.navigate("/");
  expect(loads).toBe(1);
  expect(router.getSnapshot().data).toBe(payload);
  const fetcher = router.createFetcher();
  await fetcher.load("/");
  expect(fetcher.getSnapshot().data).toBe(payload);
  await router.revalidate();
  expect(router.getSnapshot().data).toBe(payload);
  expect(loads).toBe(4);
  pending.resolve("ready");
  fetcher.dispose();
  router.dispose();
});

it("keeps ordinary loaders and actions resolving nested data", async () => {
  for (const key of ["loader", "action", "clientAction"] as const) {
    const pending = deferred<string>();
    const router = createDataRouter(
      prepareRoutes([
        { path: "/", [key]: () => ({ optional: pending.promise }) },
      ]),
    );
    const operation =
      key === "loader"
        ? router.navigate("/")
        : router.submit("/", new FormData());
    pending.resolve("ready");
    await operation;
    expect(
      key === "loader"
        ? router.getSnapshot().data
        : router.getSnapshot().actionData,
    ).toEqual({ optional: "ready" });
    router.dispose();
  }
});

it("transfers a consumed prefetch signal to the navigation that owns its deferred data", async () => {
  let signal!: AbortSignal;
  const pending = deferred<string>();
  const router = createDataRouter(
    prepareRoutes([
      {
        path: "/",
        clientLoader: (args) => {
          signal = args.signal;
          return { optional: pending.promise };
        },
      },
      { path: "/next", loader: () => "next" },
    ]),
  );
  await router.prefetch("/");
  await router.navigate("/");
  expect(signal.aborted).toBe(false);
  await router.navigate("/next");
  expect(signal.aborted).toBe(true);
  pending.resolve("late");
  router.dispose();
});
