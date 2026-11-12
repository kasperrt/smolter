import { afterEach, expect, it, vi } from "vitest";
import {
  configureApplication,
  leaveDocument,
  resolveApplicationURL,
} from "../src/environment.ts";
import { defineRoute } from "../src/match.ts";
import { createDataRouter } from "../src/router.ts";
import type { Snapshot } from "../src/types.ts";

afterEach(() => {
  configureApplication({});
  vi.unstubAllGlobals();
});

it("uses browser navigation unless the current deployment provides a handoff", () => {
  const assign = vi.fn();
  const handoff = vi.fn();
  const destination = new URL("https://remote.example/join?code=hello#form");
  vi.stubGlobal("location", { assign });
  leaveDocument(destination);
  expect(assign).toHaveBeenCalledExactlyOnceWith(destination.href);
  configureApplication({ leaveDocument: handoff });
  leaveDocument(destination);
  expect(handoff).toHaveBeenCalledExactlyOnceWith(destination);
  expect(assign).toHaveBeenCalledTimes(1);
  configureApplication({});
  leaveDocument(destination);
  expect(assign).toHaveBeenCalledTimes(2);
  expect(handoff).toHaveBeenCalledTimes(1);
});

it.each([
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "\tjava\nscript:alert(1)",
])("rejects executable navigation targets: %s", (href) => {
  const assign = vi.fn();
  const handoff = vi.fn();
  vi.stubGlobal("location", { assign });
  const destination = new URL(href);
  expect(() => resolveApplicationURL(destination)).toThrow(
    "JavaScript navigation",
  );
  expect(() => leaveDocument(destination)).toThrow("JavaScript navigation");
  configureApplication({
    resolveURL: () => destination,
    leaveDocument: handoff,
  });
  expect(() => resolveApplicationURL(new URL("https://app.example/"))).toThrow(
    "JavaScript navigation",
  );
  expect(() => leaveDocument(destination)).toThrow("JavaScript navigation");
  expect(assign).not.toHaveBeenCalled();
  expect(handoff).not.toHaveBeenCalled();
});

it.each([
  "https://external.example/",
  "mailto:hello@example.com",
  "tel:+4712345678",
])("preserves non-executable external targets: %s", (href) => {
  expect(resolveApplicationURL(new URL(href)).href).toBe(href);
});

it("lets the leaving route present a document departure before navigating once", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });
  const destination = new URL("https://remote.example/join");
  const commits: (() => void)[] = [];
  const presented: Snapshot[][] = [];
  const router = createDataRouter(
    [
      defineRoute("/", {}),
      defineRoute("/about", {
        viewTransition: (commit, previous, next) => {
          commits.push(commit);
          presented.push([previous, next]);
        },
      }),
    ],
    { url: "https://app.example/about" },
  );
  await router.navigate("https://app.example/about");
  leaveDocument(destination, router);
  expect(assign).not.toHaveBeenCalled();
  expect(presented).toEqual([
    [
      router.getSnapshot(),
      { url: destination.href, params: {}, state: "loading", leaving: true },
    ],
  ]);
  commits[0]();
  commits[0]();
  expect(assign).toHaveBeenCalledExactlyOnceWith(destination.href);
  router.dispose();
});

it("leaves immediately when the current route has no presentation", async () => {
  const assign = vi.fn();
  const handoff = vi.fn();
  const presented = vi.fn();
  vi.stubGlobal("location", { assign });
  configureApplication({ leaveDocument: handoff });
  const destination = new URL("https://remote.example/join");
  const router = createDataRouter(
    [
      defineRoute("/", { viewTransition: presented }),
      defineRoute("/about", {}),
    ],
    { url: "https://app.example/about" },
  );
  await router.navigate("https://app.example/about");
  leaveDocument(destination, router);
  expect(handoff).toHaveBeenCalledExactlyOnceWith(destination);
  expect(assign).not.toHaveBeenCalled();
  expect(presented).not.toHaveBeenCalled();
  router.dispose();
});
