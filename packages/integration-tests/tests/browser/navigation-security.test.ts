import { createDataRouter } from "@smolter/core";
import { configureApplication } from "@smolter/core/environment";
import { connectNavigation } from "@smolter/core/navigation";
import {
  Form as PreactForm,
  RouterProvider as PreactProvider,
} from "@smolter/preact";
import {
  Form as ReactForm,
  RouterProvider as ReactProvider,
} from "@smolter/react";
import { createElement as hPreact, render as renderPreact } from "preact";
import { createElement as hReact } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

it("rejects executable navigation before history, loaders or document handoff", async (context) => {
  const handoff = vi.fn();
  const loader = vi.fn();
  const router = createDataRouter([{ path: location.pathname, loader }], {
    url: location.href,
  });
  connectNavigation(router);
  configureApplication({ leaveDocument: handoff });
  context.onTestFinished(() => {
    router.dispose();
    configureApplication({});
  });
  const before = router.getSnapshot();
  const url = location.href;
  for (const href of [
    "javascript:document.title='unsafe'",
    "java\nscript:document.title='unsafe'",
  ]) {
    await expect(router.navigate(href)).rejects.toThrow(
      "JavaScript navigation",
    );
    expect(router.getSnapshot()).toBe(before);
    expect(location.href).toBe(url);
  }
  expect(loader).not.toHaveBeenCalled();
  expect(handoff).not.toHaveBeenCalled();
});

it("rejects executable Form actions during React and Preact render", (context) => {
  const router = createDataRouter([{ path: "/" }], { url: location.href });
  const container = document.createElement("div");
  document.body.append(container);
  context.onTestFinished(() => {
    renderPreact(null, container);
    container.remove();
    router.dispose();
  });
  for (const unsafe of [
    "javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
  ]) {
    expect(() =>
      renderToStaticMarkup(
        hReact(
          ReactProvider,
          { router },
          hReact(ReactForm, { action: unsafe }),
        ),
      ),
    ).toThrow("JavaScript navigation");
    expect(() =>
      renderPreact(
        hPreact(
          PreactProvider,
          { router },
          hPreact(PreactForm, { action: unsafe }),
        ),
        container,
      ),
    ).toThrow("JavaScript navigation");
  }
});
