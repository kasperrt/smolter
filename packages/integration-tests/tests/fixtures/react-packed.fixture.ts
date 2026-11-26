import {
  defineRoute,
  RouterProvider,
  Routes,
  useLoaderData,
} from "@kasperrt/smolter/react";
import {
  dispatchRoute,
  loadRouter,
  renderApplication,
} from "@kasperrt/smolter/react/server";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";

interface LayoutProps {
  children?: ReactNode;
}

test("react-packed consumer", async () => {
  const route = defineRoute("/", {
    loader: () => "packed package works",
    default: Page,
  });
  function Page() {
    return createElement("p", null, useLoaderData());
  }
  const router = await loadRouter([route], "https://example.com/");
  const html = renderToString(
    createElement(RouterProvider, { router }, createElement(Routes, {})),
  );
  expect(html).toMatch(/packed package works/);
  const response = await dispatchRoute(new Request("https://example.com/"), [
    route,
  ]);
  expect(await response.json()).toBe("packed package works");
  const { version } = await import("react");
  if (version.startsWith("18.")) {
    await expect(
      renderApplication(
        new Request("https://example.com/"),
        [route],
        { default: Routes, Layout: () => null },
        "/entry.js",
      ),
    ).rejects.toThrow(/React DOM 19/);
    return;
  }
  const { Document, Scripts } = await import(
    "@kasperrt/smolter/react/document"
  );
  const root = {
    default: Routes,
    Layout: ({ children }: LayoutProps) =>
      createElement(
        Document,
        null,
        createElement("head"),
        createElement("body", null, children, createElement(Scripts)),
      ),
  };
  const documentHTML = await (
    await renderApplication(
      new Request("https://example.com/"),
      [route],
      root,
      "/entry.js",
    )
  ).text();
  expect(documentHTML).toMatch(/packed package works/);
  expect(documentHTML).toMatch(/smolter-data/);
});
