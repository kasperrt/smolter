import type { Route } from "@smolter/core";
import { loadRouter } from "@smolter/server";
import { expect, it, vi } from "vitest";
import { deferred } from "../../integration-tests/tests/helpers/deferred.ts";

it("isolates credential-bearing SSR requests using the same route definitions", async () => {
  const started = deferred<void>();
  const release = deferred<void>();
  const routes: Route[] = [
    {
      path: "/account",
      loader: async ({ request }) => {
        const authorization = request.headers.get("Authorization");
        if (authorization === "Bearer SYNTHETIC_A") {
          started.resolve();
          await release.promise;
        }
        return { authorization, cookie: request.headers.get("Cookie") };
      },
    },
  ];
  const first = loadRouter(
    routes,
    new Request("https://app.example/account", {
      headers: { Authorization: "Bearer SYNTHETIC_A", Cookie: "session=A" },
    }),
  );
  await started.promise;
  const second = await loadRouter(
    routes,
    new Request("https://app.example/account", {
      headers: { Authorization: "Bearer SYNTHETIC_B", Cookie: "session=B" },
    }),
  );
  expect(second.getSnapshot().data).toEqual({
    authorization: "Bearer SYNTHETIC_B",
    cookie: "session=B",
  });
  release.resolve();
  const completed = await first;
  expect(completed.getSnapshot().data).toEqual({
    authorization: "Bearer SYNTHETIC_A",
    cookie: "session=A",
  });
  expect(second.getSnapshot().data).toEqual({
    authorization: "Bearer SYNTHETIC_B",
    cookie: "session=B",
  });
  completed.dispose();
  second.dispose();
});

it("does not forward SSR credentials into an external redirect's matching route", async () => {
  const destination = vi.fn(() => "unexpected");
  const router = await loadRouter(
    [
      {
        path: "/",
        loader: () => Response.redirect("https://attacker.example/account"),
      },
      { path: "/account", loader: destination },
    ],
    new Request("https://app.example/", {
      headers: {
        Authorization: "Bearer SYNTHETIC_PRIVATE",
        Cookie: "session=private",
      },
    }),
  );
  expect(destination).not.toHaveBeenCalled();
  expect(router.getSnapshot().error?.message).toBe("External URL");
  router.dispose();
});
