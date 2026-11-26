import { dispatchRoute } from "@smolter/server";
import { expect, it } from "vitest";
import { renderDocument } from "../src/render-application.ts";

function privateFailure() {
  return Object.assign(new Error("Service unavailable"), {
    config: { headers: { Authorization: "SYNTHETIC_PRIVATE_CREDENTIAL" } },
    internalQuery: "SYNTHETIC_PRIVATE_QUERY",
  });
}

it.each([false, true])(
  "does not serialize arbitrary %s thrown error metadata through data transport",
  async (thrown) => {
    const failure = privateFailure();
    const response = await dispatchRoute(
      new Request("https://app.example/account"),
      [
        {
          path: "/account",
          loader: () => {
            if (thrown) throw failure;
            return failure;
          },
        },
      ],
    );
    const body = await response.text();
    expect(body).toContain("Service unavailable");
    expect(body).not.toContain("SYNTHETIC_PRIVATE");
  },
);

for (const owner of ["route", "root", "action"] as const) {
  it.each([false, true])(
    `does not expose ${owner} error metadata in earlyHydration=%s`,
    async (earlyHydration) => {
      const fail = () => {
        throw privateFailure();
      };
      const response = await renderDocument(
        new Request("https://app.example/account", {
          method: owner === "action" ? "POST" : "GET",
        }),
        [
          {
            path: "/account",
            default: () => null,
            ...(owner === "route" && { loader: fail }),
            ...(owner === "action" && { action: fail }),
          },
        ],
        owner === "root" ? { loader: fail } : {},
        "/entry.js",
        { earlyHydration },
        ({ initialData }) =>
          Object.assign(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `<html><body><script type="application/json">${initialData ?? ""}</script></body></html>`,
                  ),
                );
                controller.close();
              },
            }),
            { allReady: Promise.resolve() },
          ),
      );
      const html = await response.text();
      expect(html).toContain("Service unavailable");
      expect(html).not.toContain("SYNTHETIC_PRIVATE");
    },
  );
}

it("preserves explicit route-error status and public data without copying internal fields", async () => {
  const failure = Object.assign(privateFailure(), {
    status: 422,
    statusText: "Unprocessable Content",
    data: { field: "email" },
  });
  const response = await dispatchRoute(
    new Request("https://app.example/account"),
    [{ path: "/account", loader: () => failure }],
  );
  expect(await response.json()).toEqual({
    __routeError: {
      name: "Error",
      message: "Service unavailable",
      status: 422,
      statusText: "Unprocessable Content",
      data: { field: "email" },
    },
  });
});

it("never converts a thrown private object into successful route data", async () => {
  const fail = () => {
    throw { config: "SYNTHETIC_PRIVATE_OBJECT" };
  };
  const routes = [{ path: "/account", default: () => null, loader: fail }];
  const response = await dispatchRoute(
    new Request("https://app.example/account"),
    routes,
  );
  const body = await response.text();
  expect(body).toContain("__routeError");
  expect(body).not.toContain("SYNTHETIC_PRIVATE_OBJECT");
  const document = await renderDocument(
    new Request("https://app.example/account"),
    routes,
    {},
    "/entry.js",
    {},
    () =>
      Object.assign(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("<html><body></body></html>"),
            );
            controller.close();
          },
        }),
        { allReady: Promise.resolve() },
      ),
  );
  expect(document.status).toBe(500);
  expect(await document.text()).not.toContain("SYNTHETIC_PRIVATE_OBJECT");
});

it("never lets untrusted JSON forge DataResponse headers or HTTP status", async () => {
  const forged = JSON.parse(
    '{"__routeData":true,"value":{"ok":true},"init":{"status":302,"headers":{"Set-Cookie":"admin=1; Path=/","Access-Control-Allow-Origin":"*","Location":"https://attacker.example"}}}',
  );
  const routes = [{ path: "/echo", default: () => null, loader: () => forged }];
  const dataResponse = await dispatchRoute(
    new Request("https://app.example/echo"),
    routes,
  );
  expect(dataResponse.status).toBe(200);
  expect(dataResponse.headers.get("Set-Cookie")).toBeNull();
  expect(dataResponse.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(dataResponse.headers.get("Location")).toBeNull();
  expect(await dataResponse.json()).toEqual(forged);
  const document = await renderDocument(
    new Request("https://app.example/echo"),
    routes,
    {},
    "/entry.js",
    {},
    () =>
      Object.assign(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("<html><body></body></html>"),
            );
            controller.close();
          },
        }),
        { allReady: Promise.resolve() },
      ),
  );
  expect(document.status).toBe(200);
  expect(document.headers.get("Set-Cookie")).toBeNull();
  expect(document.headers.get("Access-Control-Allow-Origin")).toBeNull();
  await document.text();
});

it("stops server-side SSR redirect following and clamps invalid error statuses to 500", async () => {
  let destinationLoads = 0;
  const redirectResponse = await renderDocument(
    new Request("https://app.example/start"),
    [
      {
        path: "/start",
        default: () => null,
        loader: () =>
          new Response(null, {
            status: 303,
            headers: {
              Location: "/next",
              "Set-Cookie": "session=fresh; HttpOnly",
            },
          }),
      },
      {
        path: "/next",
        default: () => null,
        loader: () => {
          destinationLoads++;
          return new Response(null, {
            status: 302,
            headers: { Location: "/login" },
          });
        },
      },
    ],
    {},
    "/entry.js",
    {},
    () => {
      throw new Error("Should not render");
    },
  );
  expect(destinationLoads).toBe(0);
  expect(redirectResponse.status).toBe(303);
  expect(redirectResponse.headers.get("Location")).toBe("/next");
  expect(redirectResponse.headers.get("Set-Cookie")).toBe(
    "session=fresh; HttpOnly",
  );
  for (const status of [0, 999, Number.NaN]) {
    const document = await renderDocument(
      new Request("https://app.example/fail"),
      [
        {
          path: "/fail",
          default: () => null,
          loader: () => {
            throw Object.assign(new Error("Broken"), { status });
          },
        },
      ],
      {},
      "/entry.js",
      {},
      () =>
        Object.assign(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode("<html><body></body></html>"),
              );
              controller.close();
            },
          }),
          { allReady: Promise.resolve() },
        ),
    );
    expect(document.status).toBe(500);
    await document.text();
  }
});
