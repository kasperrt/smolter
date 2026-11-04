import { dispatchRoute, handleRequest } from "@smolter/server";
import { expect, it, vi } from "vitest";
import { renderDocument } from "../src/render-application.ts";

for (const dispatch of [
  (request: Request, action: () => unknown) =>
    dispatchRoute(request, [{ path: "/account", action }]),
  (request: Request, action: () => unknown) =>
    dispatchRoute(request, [{ path: "/account", action }], true),
  (request: Request, action: () => unknown) =>
    handleRequest([{ path: "/account", action }], request),
]) {
  it("rejects foreign, opaque and malformed origins without executing actions", async () => {
    const action = vi.fn(() => "saved");
    for (const origin of [
      "https://attacker.example",
      "https://app.example:444",
      "null",
      "invalid",
      "https://app.example.attacker.example",
    ]) {
      const response = await dispatch(
        new Request("https://app.example/account", {
          method: "POST",
          headers: { Origin: origin },
        }),
        action,
      );
      expect(response.status).toBe(403);
    }
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects cross-site metadata without Origin and unsupported mutation methods", async () => {
    const action = vi.fn(() => "saved");
    const crossSite = await dispatch(
      new Request("https://app.example/account", {
        method: "POST",
        headers: { "Sec-Fetch-Site": "cross-site" },
      }),
      action,
    );
    expect(crossSite.status).toBe(403);
    for (const method of ["OPTIONS", "PROPFIND"]) {
      const response = await dispatch(
        new Request("https://app.example/account", { method }),
        action,
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toContain("POST");
    }
    expect(action).not.toHaveBeenCalled();
  });
  it("preserves same-origin browser mutations and headerless server clients", async () => {
    const action = vi.fn(() => "saved");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const headers of [
        new Headers({ Origin: "https://app.example" }),
        new Headers(),
      ]) {
        const response = await dispatch(
          new Request("https://app.example/account", { method, headers }),
          action,
        );
        expect(response.status).toBe(200);
      }
    }
    expect(action).toHaveBeenCalledTimes(8);
  });
}

it("rejects document mutations before route preparation, root loaders and rendering", async () => {
  const loader = vi.fn();
  const action = vi.fn();
  const render = vi.fn();
  const response = await renderDocument(
    new Request("https://app.example/account", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    }),
    [{ path: "/account", default: () => null, action }],
    { loader },
    "/entry.js",
    {},
    render,
  );
  expect(response.status).toBe(403);
  expect(loader).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
});

it("keeps HEAD on the read path and allows ordinary cross-origin reads", async () => {
  const loader = vi.fn(() => "read");
  const action = vi.fn(() => "mutated");
  const routes = [{ path: "/account", loader, action }];
  for (const method of ["GET", "HEAD"]) {
    const request = new Request("https://app.example/account", {
      method,
      headers: { Origin: "https://other.example" },
    });
    expect((await handleRequest(routes, request)).status).toBe(200);
    expect((await dispatchRoute(request, routes)).status).toBe(200);
  }
  expect(loader).toHaveBeenCalledTimes(4);
  expect(action).not.toHaveBeenCalled();
});
