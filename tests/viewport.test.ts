import { expect, it, vi } from "vitest";
import { viewportRef } from "../packages/core/src/viewport.ts";

it("observes once and releases forwarded callback/object refs without late work", () => {
  let callback!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(fn: IntersectionObserverCallback) {
        callback = fn;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const element = {} as HTMLAnchorElement;
  const notify = (visible: boolean) =>
    callback(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  const load = vi.fn();
  const forwarded = { current: null as HTMLAnchorElement | null };
  const ref = viewportRef(load, forwarded);
  ref(element);
  expect(forwarded.current).toBe(element);
  notify(false);
  expect(load).not.toHaveBeenCalled();
  notify(true);
  notify(true);
  expect(load).toHaveBeenCalledTimes(1);
  ref(null);
  expect(forwarded.current).toBeNull();
  notify(true);
  expect(load).toHaveBeenCalledTimes(1);
  const release = vi.fn();
  const forward = vi.fn(() => release);
  const next = viewportRef(load, forward);
  next(element);
  next(null);
  expect(forward).toHaveBeenCalledExactlyOnceWith(element);
  expect(release).toHaveBeenCalledTimes(1);
  notify(true);
  expect(load).toHaveBeenCalledTimes(1);
  const legacy = vi.fn();
  const last = viewportRef(load, legacy);
  last(element);
  last(null);
  expect(legacy).toHaveBeenLastCalledWith(null);
  expect(disconnect).toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("does not eagerly load when IntersectionObserver is unavailable", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const load = vi.fn();
  const ref = viewportRef(load);
  ref({} as HTMLAnchorElement);
  ref(null);
  expect(load).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
