import { connectNavigation, scrollPositions } from "@smolter/core/navigation";
import { createDataRouter, Outlet, RouterApplication } from "@smolter/preact";
import { createElement } from "preact";
import { createRoot } from "preact/compat/client";
import { expect, it, vi } from "vitest";
import { ScrollRestoration } from "../../packages/preact/src/document.tsx";

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
