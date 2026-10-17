import { expect, it } from "vitest";
import {
  readSubmission,
  submissionBody,
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
