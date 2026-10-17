import { expect, it } from "vitest";
import { pageSupport } from "../packages/ui/src/docs/support";

const page = {
  slug: "Document",
  title: "Document",
  summary: "",
  kind: "API",
  sections: [],
};
it("distinguishes renderer, browser, server and partial integration support", () => {
  expect(
    pageSupport({ ...page, entries: ["preact/document"] }).map((s) => s.level),
  ).toEqual(["no", "no", "yes", "yes"]);
  expect(
    pageSupport({ ...page, entries: ["preact/server"] }).map((s) => s.level),
  ).toEqual(["no", "no", "no", "yes"]);
  expect(
    pageSupport({ ...page, entries: ["react", "preact"] }).every(
      (s) => s.level === "yes",
    ),
  ).toBe(true);
  expect(
    pageSupport({ ...page, entries: ["react/client", "preact/client"] }).map(
      (s) => s.level,
    ),
  ).toEqual(["yes", "partial", "yes", "partial"]);
  expect(pageSupport({ ...page, slug: "server-rendering" })[1].level).toBe(
    "partial",
  );
});
