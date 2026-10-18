import { createDataRouter } from "@smolter/core";
import { Outlet, RouterApplication } from "@smolter/preact";
import { createElement as h, render } from "preact";
import { expect, it } from "vitest";

for (const failure of [false, true]) {
  it(`invalidates only original outlet stream markers on ${failure ? "error" : "success"}`, async (context) => {
    const container = document.createElement("div");
    document.body.append(container);
    const markers: Comment[] = [];
    function Home() {
      return h(
        "p",
        {
          ref: (node: HTMLParagraphElement | null) => {
            if (!node || markers.length) return;
            const start = document.createComment("$s:route");
            const end = document.createComment("/$s:route");
            node.before(start);
            node.after(end);
            markers.push(start, end);
          },
        },
        "Home",
      );
    }
    function Destination() {
      return h("h1", null, "Destination");
    }
    function Failure() {
      return h("h1", null, "Destination failed");
    }
    function Root() {
      return h("main", null, h("input", { value: "retained" }), h(Outlet, {}));
    }
    const routes = [
      { path: "/", default: Home },
      { path: "/same", default: Home },
      {
        path: "/next",
        default: Destination,
        ErrorBoundary: Failure,
        loader: () => (failure ? new Error("Destination failed") : undefined),
      },
    ];
    const router = createDataRouter(routes);
    await router.navigate("/");
    context.onTestFinished(() => {
      render(null, container);
      router.dispose();
      container.remove();
    });
    render(
      h(RouterApplication, {
        router,
        routes,
        root: undefined,
        rootModule: { default: Root, Layout: ({ children }) => children },
      }),
      container,
    );
    expect(markers).toHaveLength(2);
    expect(markers.map((marker) => marker.data)).toEqual([
      "$s:route:smolter",
      "/$s:route:smolter",
    ]);
    const input = container.querySelector("input");
    const rootMarker = document.createComment("$s:root");
    container.querySelector("main")!.prepend(rootMarker);
    await router.navigate("/same");
    await expect.poll(() => router.getSnapshot().state).toBe("idle");
    expect(markers.every((marker) => marker.isConnected)).toBe(true);
    const nestedStart = document.createComment("$s:nested");
    const nestedEnd = document.createComment("/$s:nested");
    container.querySelector("p")!.before(nestedStart);
    container.querySelector("p")!.after(nestedEnd);
    await router.navigate("/next");
    await expect
      .poll(() => container.textContent)
      .toContain(failure ? "Destination failed" : "Destination");
    expect(markers.every((marker) => !marker.isConnected)).toBe(true);
    expect(nestedStart.isConnected).toBe(false);
    expect(nestedEnd.isConnected).toBe(false);
    expect(rootMarker.isConnected).toBe(true);
    expect(container.querySelector("input")).toBe(input);
    await router.navigate("/");
    await expect
      .poll(() => container.querySelector("p")?.textContent)
      .toBe("Home");
    expect(rootMarker.isConnected).toBe(true);
  });
}
