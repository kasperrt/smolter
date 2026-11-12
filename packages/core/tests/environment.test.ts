import { afterEach, expect, it, vi } from "vitest";
import {
  configureApplication,
  leaveDocument,
  resolveApplicationURL,
} from "../src/environment.ts";
import { defineRoute } from "../src/match.ts";
import { createDataRouter } from "../src/router.ts";
import type { CommitOptions, Snapshot } from "../src/types.ts";

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
  vi.stubGlobal("addEventListener", vi.fn());
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

interface PageSwap {
  viewTransition: { types: Set<string>; skipTransition: () => void } | null;
}

async function departure(options?: CommitOptions) {
  const order: string[] = [];
  const pageswap: ((event: PageSwap) => void)[] = [];
  const style = { textContent: "", remove: vi.fn() };
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) =>
    frames.push(callback),
  );
  vi.stubGlobal("location", { assign: () => order.push("assign") });
  vi.stubGlobal("document", {
    createElement: () => style,
    head: { appendChild: () => (order.push("opt-in"), style) },
  });
  vi.stubGlobal(
    "addEventListener",
    (type: string, listener: (event: PageSwap) => void) => {
      order.push(type);
      pageswap.push(listener);
    },
  );
  const router = createDataRouter(
    [defineRoute("/", { viewTransition: (commit) => commit(options) })],
    { url: "https://app.example/" },
  );
  await router.navigate("https://app.example/");
  leaveDocument(new URL("https://app.example/platform"), router);
  if (options?.crossDocument) {
    expect(order).not.toContain("assign");
    frames[0]();
  }
  router.dispose();
  const types = new Set<string>();
  const skipTransition = vi.fn();
  pageswap[0]({ viewTransition: { types, skipTransition } });
  return { order, style, types, skipTransition };
}

it("skips the browser's cross-document transition when a departure commits without one", async () => {
  const { order, types, skipTransition } = await departure();
  expect(order).toEqual(["pageswap", "assign"]);
  expect(skipTransition).toHaveBeenCalledOnce();
  expect([...types]).toEqual([]);
});

it("opts the leaving document into a typed cross-document transition only for that departure", async () => {
  const { order, style, types, skipTransition } = await departure({
    crossDocument: ["handoff", "spinner"],
  });
  expect(order).toEqual(["opt-in", "pageswap", "assign"]);
  expect(style.textContent).toBe("@view-transition{navigation:auto}");
  expect(style.remove).toHaveBeenCalledOnce();
  expect([...types]).toEqual(["handoff", "spinner"]);
  expect(skipTransition).not.toHaveBeenCalled();
});

it("keeps an untyped cross-document transition", async () => {
  const { types, skipTransition } = await departure({ crossDocument: [] });
  expect([...types]).toEqual([]);
  expect(skipTransition).not.toHaveBeenCalled();
});

it("ignores pageswap without a transition", async () => {
  const pageswap: ((event: PageSwap) => void)[] = [];
  vi.stubGlobal("location", { assign: vi.fn() });
  vi.stubGlobal(
    "addEventListener",
    (_: string, listener: (event: PageSwap) => void) => pageswap.push(listener),
  );
  const router = createDataRouter(
    [defineRoute("/", { viewTransition: (commit) => commit() })],
    { url: "https://app.example/" },
  );
  await router.navigate("https://app.example/");
  leaveDocument(new URL("https://remote.example/"), router);
  router.dispose();
  expect(() => pageswap[0]({ viewTransition: null })).not.toThrow();
});
