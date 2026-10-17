import {
  data,
  isRouteErrorResponse,
  normalizeResult,
  redirect,
} from "@smolter/core/responses";
import { expect, it } from "vitest";

it("normalizes JSON responses and preserves redirect responses", async () => {
  expect(await normalizeResult(Response.json({ count: 3 }))).toEqual({
    count: 3,
  });

  const response = redirect("/done", {
    status: 303,
    headers: { "Set-Cookie": "saved=1; HttpOnly" },
  });

  expect(await normalizeResult(response)).toBe(response);
  expect(response.status).toBe(303);
  expect(response.headers.get("Set-Cookie")).toBe("saved=1; HttpOnly");
});

it("retains HTTP error details and distinguishes ordinary errors", async () => {
  const error = await normalizeResult(
    new Response("Room not found", { status: 404, statusText: "Not Found" }),
  );

  expect(isRouteErrorResponse(error)).toBe(true);
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    message: "Room not found",
    status: 404,
    statusText: "Not Found",
  });
  expect(isRouteErrorResponse(Error("offline"))).toBe(false);
  expect(isRouteErrorResponse({ status: 404 })).toBe(false);
  expect(isRouteErrorResponse(null)).toBe(false);
});

it("resolves deferred arrays inside route data without flattening values", async () => {
  const created = new Date("2026-01-01T00:00:00.000Z");
  const result = await normalizeResult(
    data({
      items: Promise.resolve([
        Promise.resolve({ count: Promise.resolve(3) }),
        null,
        [Promise.resolve("nested")],
      ]),
      created,
    }),
  );

  expect(result).toEqual({
    items: [{ count: 3 }, null, ["nested"]],
    created,
  });
  expect(result).toHaveProperty("created", created);
});

it("propagates deferred and malformed JSON failures to the caller", async () => {
  const error = Error("Unavailable");

  await expect(normalizeResult(data([Promise.reject(error)]))).rejects.toBe(
    error,
  );
  await expect(normalizeResult(new Response("{"))).rejects.toBeInstanceOf(
    SyntaxError,
  );
});
