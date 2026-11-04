import { connectNavigation, scrollPositions } from "@smolter/core/navigation";
import { prepareRoutes } from "@smolter/core/prepare-routes";
import { retainRoute } from "@smolter/core/presentation";
import { createDataRouter, Outlet, RouterApplication } from "@smolter/preact";
import { createElement, Fragment } from "preact";
import { flushSync } from "preact/compat";
import { createRoot } from "preact/compat/client";
import { expect, it, vi } from "vitest";
import { ScrollRestoration } from "../../src/document.tsx";
import { lazyRoute } from "../../src/lazy-route.ts";

it("restores saved scroll, follows anchors, and honors preserved scroll", async (context) => {
  const originalURL = location.href;
  const originalState: unknown = history.state;
  const originalRestoration = history.scrollRestoration;
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const anchorScroll = vi
    .spyOn(Element.prototype, "scrollIntoView")
    .mockImplementation(() => {});
  const routes = [
    { path: "/", loader: () => "home" },
    { path: "/next", loader: () => "next" },
  ];
  const router = createDataRouter(routes, {
    browser: true,
    url: new URL("/#scroll-target", location.href).href,
  });
  const container = document.createElement("div");
  const anchor = document.createElement("div");
  const root = createRoot(container);
  anchor.id = "scroll-target";
  document.body.append(container, anchor);
  history.replaceState({ key: "start" }, "", "/#scroll-target");
  await router.navigate("/#scroll-target");
  connectNavigation(router);
  scrollPositions(router).set("start", [12, 34]);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
    anchor.remove();
    scroll.mockRestore();
    anchorScroll.mockRestore();
    history.replaceState(originalState, "", originalURL);
    history.scrollRestoration = originalRestoration;
  });
  root.render(
    createElement(RouterApplication, {
      router,
      routes,
      root: {},
      rootModule: { default: ScrollView, Layout: Outlet },
    }),
  );
  await expect
    .poll(() => scroll.mock.calls)
    .toEqual([[{ left: 12, top: 34, behavior: "instant" }]]);
  await expect.poll(() => history.scrollRestoration).toBe("manual");
  expect(anchorScroll).not.toHaveBeenCalled();
  await router.navigate("/next");
  await expect
    .poll(() => scroll.mock.lastCall)
    .toEqual([{ left: 0, top: 0, behavior: "instant" }]);
  expect(scroll).toHaveBeenCalledTimes(2);
  await router.navigate("/next#scroll-target");
  await expect.poll(() => anchorScroll.mock.calls.length).toBe(1);
  expect(anchorScroll.mock.contexts[0]).toBe(anchor);
  expect(scroll).toHaveBeenCalledTimes(2);
  await router.navigate("/?preserve=1", { preventScrollReset: true });
  await nextFrame();
  await nextFrame();
  expect(scroll).toHaveBeenCalledTimes(2);
  expect(anchorScroll).toHaveBeenCalledTimes(1);
  root.unmount();
  await expect.poll(() => history.scrollRestoration).toBe(originalRestoration);
});

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function ScrollView() {
  return createElement(ScrollRestoration, { nonce: "test-nonce" });
}

it("resets real scroll after a retained lazy destination commits", async (context) => {
  const originalURL = location.href;
  const originalState: unknown = history.state;
  const routes = prepareRoutes([
    lazyRoute({ path: "/" }, async () => ({ default: TallHome })),
    lazyRoute({ path: "/next" }, async () => ({ default: ShortPage })),
  ]);
  const router = createDataRouter(routes, {
    browser: true,
    url: new URL("/", location.href).href,
  });
  await router.navigate("/");
  retainRoute(router, flushSync);
  connectNavigation(router);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
    history.replaceState(originalState, "", originalURL);
  });
  root.render(
    createElement(RouterApplication, {
      router,
      routes,
      root: {},
      rootModule: { default: ScrollingRoot, Layout: Outlet },
    }),
  );
  await expect.poll(() => container.querySelector("#tall-home")).not.toBeNull();
  await nextFrame();
  await nextFrame();
  window.scrollTo({ top: 2000, behavior: "instant" });
  expect(window.scrollY).toBe(2000);
  await router.navigate("/next");
  await expect
    .poll(() => container.querySelector("#short-page"))
    .not.toBeNull();
  await nextFrame();
  await nextFrame();
  expect(window.scrollY).toBe(0);
});

function ScrollingRoot() {
  return createElement(
    Fragment,
    null,
    createElement(Outlet, null),
    createElement(ScrollRestoration, null),
  );
}

function TallHome() {
  return createElement(
    "main",
    { id: "tall-home", style: { height: "7000px" } },
    "Home",
  );
}

function ShortPage() {
  return createElement(
    "main",
    { id: "short-page", style: { height: "3500px" } },
    "Next",
  );
}
