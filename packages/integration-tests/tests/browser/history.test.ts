import { configureApplication } from "@smolter/core/environment";
import {
  connectNavigation,
  navigationStore,
  scrollPositions,
} from "@smolter/core/navigation";
import { createDataRouter, defineRoute } from "@smolter/preact";
import { expect, it } from "vitest";

it("restores history metadata and hands external navigation to the deployment", async (context) => {
  const originalURL = location.href;
  const originalState: unknown = history.state;
  const handedOff: string[] = [];
  const router = createDataRouter(
    [
      defineRoute("/", { loader: () => "home" }),
      defineRoute("/tasks", { loader: () => "tasks" }),
    ],
    { browser: true, url: new URL("/", location.href).href },
  );
  history.replaceState({ key: "home", state: { source: "reload" } }, "", "/");
  await router.navigate("/");
  const stop = router.start();
  connectNavigation(router);
  configureApplication({
    leaveDocument: (destination) => handedOff.push(destination.href),
  });
  context.onTestFinished(() => {
    stop();
    router.dispose();
    configureApplication({});
    history.replaceState(originalState, "", originalURL);
  });
  const store = navigationStore(router);
  await router.navigate("/tasks", {
    replace: true,
    state: { source: "navigation" },
    preventScrollReset: true,
  });
  expect(store.getSnapshot()).toMatchObject({
    type: "REPLACE",
    state: { source: "navigation" },
    preventScrollReset: true,
  });
  const taskKey = store.getSnapshot().key;
  history.replaceState({ key: "home", state: { source: "reload" } }, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  await expect.poll(() => router.getSnapshot().data).toBe("home");
  expect(store.getSnapshot()).toMatchObject({
    type: "POP",
    key: "home",
    state: { source: "reload" },
    preventScrollReset: false,
  });
  expect(scrollPositions(router).has(taskKey)).toBe(true);
  const beforeHandoff = router.getSnapshot();
  await router.navigate("https://remote.example/join?code=hello#form");
  expect(handedOff).toEqual(["https://remote.example/join?code=hello#form"]);
  expect(router.getSnapshot()).toBe(beforeHandoff);
  expect(store.getSnapshot().key).toBe("home");
});
