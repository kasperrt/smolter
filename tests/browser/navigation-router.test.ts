import { createRouter, defineRoute } from "@smolter/core";
import { expect, it, vi } from "vitest";

it("tracks history, hash changes and concurrent provider lifecycles", async (context) => {
  const original = location.href;
  const originalState = history.state;
  history.replaceState(null, "", "/");
  const router = createRouter(
    [defineRoute("/", {}), defineRoute("/tasks/:id", {})],
    { browser: true },
  );
  const changed = vi.fn();
  router.subscribe(changed);
  context.onTestFinished(() => {
    router.dispose();
    history.replaceState(originalState, "", original);
  });
  const stop = router.start();
  const stopSecond = router.start();
  const length = history.length;

  await router.navigate("/tasks/1", { state: { from: "home" } });
  expect(history.length).toBe(length + 1);
  expect(history.state).toEqual({ from: "home" });
  await router.navigate("/tasks/2", { replace: true });
  expect(history.length).toBe(length + 1);
  expect(router.getSnapshot().params.id).toBe("2");
  stop();

  history.replaceState(null, "", "/tasks/3#details");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  expect(router.getSnapshot().params.id).toBe("3");
  history.replaceState(null, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(router.getSnapshot().path).toBe("/");
  stopSecond();
  const before = router.getSnapshot();
  history.replaceState(null, "", "/tasks/4");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(router.getSnapshot()).toBe(before);

  const resume = router.start();
  expect(router.getSnapshot().params.id).toBe("4");
  resume();
  router.dispose();
  const calls = changed.mock.calls.length;
  await router.navigate("/tasks/5");
  expect(changed).toHaveBeenCalledTimes(calls);
});
