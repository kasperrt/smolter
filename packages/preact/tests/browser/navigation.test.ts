import { createDataRouter } from "@smolter/core";
import { configureApplication } from "@smolter/core/environment";
import { connectNavigation } from "@smolter/core/navigation";
import { Link, RouterProvider } from "@smolter/preact";
import { createElement } from "preact/compat";
import { createRoot } from "preact/compat/client";
import { expect, it } from "vitest";

it("hands configured Preact links to another application without running a local loader", async (context) => {
  const handoffs: string[] = [];
  const clicks: string[] = [];
  const intercepted: boolean[] = [];
  let reads = 0;
  const router = createDataRouter(
    [{ path: location.pathname, loader: () => ++reads }],
    { url: location.href },
  );
  const container = document.createElement("div");
  const root = createRoot(container);
  const preventBrowserNavigation = (event: MouseEvent) => {
    intercepted.push(event.defaultPrevented);
    event.preventDefault();
  };
  configureApplication({
    resolveURL: (url) =>
      url.pathname === "/join"
        ? new URL("https://remote.example/join?code=hello")
        : url,
    isDocumentHandoff: (_, destination) =>
      destination.origin === "https://remote.example",
    leaveDocument: (destination) => {
      handoffs.push(destination.href);
    },
  });
  document.body.append(container);
  document.addEventListener("click", preventBrowserNavigation);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
    document.removeEventListener("click", preventBrowserNavigation);
    configureApplication({});
  });
  await router.navigate(location.href);
  expect(reads).toBe(1);
  root.render(
    createElement(
      RouterProvider,
      { router },
      createElement(
        Link,
        { href: "/join", onClick: () => clicks.push("join") },
        "Join",
      ),
      createElement(
        Link,
        {
          href: "https://elsewhere.example/",
          onClick: () => clicks.push("external"),
        },
        "External",
      ),
    ),
  );
  await expect.poll(() => container.querySelectorAll("a").length).toBe(2);
  const links = container.querySelectorAll("a");
  expect(links[0].href).toBe("https://remote.example/join?code=hello");
  for (const link of links) {
    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  }
  expect(clicks).toEqual(["join", "external"]);
  expect(intercepted).toEqual([true, false]);
  expect(handoffs).toEqual(["https://remote.example/join?code=hello"]);
  expect(reads).toBe(1);
  expect(router.getSnapshot().url).toBe(location.href);
});

it("delegates ordinary nested anchor clicks and releases the handoff listener on disposal", (context) => {
  const handoffs: string[] = [];
  const router = createDataRouter([]);
  const anchor = document.createElement("a");
  const child = document.createElement("span");
  const intercepted: boolean[] = [];
  const preventBrowserNavigation = (event: MouseEvent) => {
    intercepted.push(event.defaultPrevented);
    event.preventDefault();
  };
  anchor.href = "https://remote.example/join";
  child.textContent = "Join";
  anchor.append(child);
  document.body.append(anchor);
  configureApplication({
    isDocumentHandoff: (_, destination) =>
      destination.origin === "https://remote.example",
    leaveDocument: (destination) => {
      handoffs.push(destination.href);
    },
  });
  connectNavigation(router);
  document.addEventListener("click", preventBrowserNavigation);
  context.onTestFinished(() => {
    router.dispose();
    anchor.remove();
    document.removeEventListener("click", preventBrowserNavigation);
    configureApplication({});
  });
  child.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  child.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    }),
  );
  router.dispose();
  child.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  expect(intercepted).toEqual([true, false, false]);
  expect(handoffs).toEqual(["https://remote.example/join"]);
});
