import { afterEach, expect, it, vi } from "vitest";
import {
  configureApplication,
  leaveDocument,
  resolveApplicationURL,
} from "../src/environment.ts";

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
