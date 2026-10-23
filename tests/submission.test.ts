import { createDataRouter } from "@smolter/core";
import { expect, it } from "vitest";
import {
  readSubmission,
  submissionBody,
  submitValue,
} from "../packages/core/src/submission.ts";

it("round-trips structured action data through the browser form transport", async () => {
  const value = { intent: "update", enabled: true, items: [{ id: 1 }] };
  const body = submissionBody(value, "application/json");
  const request = new Request("https://example.com/tasks", {
    method: "PATCH",
    body,
  });
  expect(await readSubmission(request)).toEqual(value);
});

it("preserves existing FormData and converts ordinary form fields to strings", () => {
  const body = new FormData();
  body.append("tag", "first");
  body.append("tag", "second");
  expect(submissionBody(body)).toBe(body);
  expect([...submissionBody({ count: 2, enabled: false })]).toEqual([
    ["count", "2"],
    ["enabled", "false"],
  ]);
});

it("reads a JSON action request without requiring a form envelope", async () => {
  const value = { items: [1, 2], enabled: false };
  const request = new Request("https://example.com/tasks", {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(value),
  });
  expect(await readSubmission(request)).toEqual(value);
});

it("keeps page and fetcher GET submissions separate while encoding repeated controls", async () => {
  const requests: string[] = [];
  const router = createDataRouter(
    [{ path: "/items", loader: ({ request }) => requests.push(request.url) }],
    { url: "https://example.com/home" },
  );
  const body = new FormData();
  body.append("tag", "one");
  body.append("tag", "two");
  body.append("file", new File(["content"], "note.txt"));
  const fetcher = router.createFetcher();
  await submitValue(router, body, { method: "gEt" }, fetcher, "/items?old=1");
  expect(router.getSnapshot().url).toBe("https://example.com/home");
  await submitValue(router, body, { method: "get", action: "/items?old=2" });
  expect(requests).toEqual([
    "https://example.com/items?tag=one&tag=two&file=note.txt",
    "https://example.com/items?tag=one&tag=two&file=note.txt",
  ]);
  expect(router.getSnapshot().url).toBe(requests[1]);
  router.dispose();
});

it("honors explicit fetcher action targets and JSON encoding without replay", async () => {
  const calls: { method: string; value: unknown }[] = [];
  const router = createDataRouter(
    [
      {
        path: "/items",
        action: async ({ request }) => {
          calls.push({
            method: request.method,
            value: await readSubmission(request),
          });
          return "saved";
        },
      },
    ],
    { url: "https://example.com/items" },
  );
  const fetcher = router.createFetcher();
  await submitValue(
    router,
    { name: "value" },
    {
      action: "/items",
      method: "patch",
      encType: "application/json",
    },
    fetcher,
    "/wrong",
  );
  expect(calls).toEqual([{ method: "PATCH", value: { name: "value" } }]);
  expect(fetcher.getSnapshot().data).toBe("saved");
  router.dispose();
});
