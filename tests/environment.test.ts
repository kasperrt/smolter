import { afterEach, expect, it, vi } from "vitest";
import {
  configureApplication,
  leaveDocument,
} from "../packages/core/src/environment.ts";

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
