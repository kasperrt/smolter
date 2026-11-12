import type { CommitOptions, Snapshot } from "@smolter/core";
import { configureApplication } from "@smolter/core/environment";
import { createDataRouter, Link, RouterProvider } from "@smolter/react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

it("presents a handoff through the leaving page's viewTransition before leaving the document", async (context) => {
  const handoffs: string[] = [];
  const commits: ((options?: CommitOptions) => void)[] = [];
  const leaving: (true | undefined)[] = [];
  const optedIn: boolean[] = [];
  const router = createDataRouter(
    [
      {
        path: location.pathname,
        viewTransition: (
          commit: (options?: CommitOptions) => void,
          _: Snapshot,
          next: Snapshot,
        ) => {
          commits.push(commit);
          leaving.push(next.leaving);
        },
      },
    ],
    { url: location.href },
  );
  const container = document.createElement("div");
  const root = createRoot(container);
  configureApplication({
    isDocumentHandoff: (_, destination) =>
      destination.origin === "https://remote.example",
    leaveDocument: (destination) => {
      handoffs.push(destination.href);
      optedIn.push(
        [...document.head.querySelectorAll("style")].some((style) =>
          style.textContent?.includes("@view-transition"),
        ),
      );
    },
  });
  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
    configureApplication({});
    for (const style of document.head.querySelectorAll("style"))
      if (style.textContent?.includes("@view-transition")) style.remove();
  });
  await router.navigate(location.href);
  root.render(
    createElement(
      RouterProvider,
      { router },
      createElement(Link, { href: "https://remote.example/join" }, "Join"),
    ),
  );
  await expect.poll(() => container.querySelector("a")).not.toBeNull();
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  container.querySelector("a")?.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(leaving).toEqual([true]);
  expect(handoffs).toEqual([]);
  commits[0]({ crossDocument: ["handoff"] });
  commits[0]();
  await expect.poll(() => handoffs).toEqual(["https://remote.example/join"]);
  expect(optedIn).toEqual([true]);
});
