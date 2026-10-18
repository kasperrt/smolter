import { createDataRouter } from "@smolter/core";
import { type AppRoute, Outlet, RouterApplication } from "@smolter/react";
import { createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Links, Meta, Scripts } from "../../packages/react/src/document.tsx";

it("updates route metadata while preserving the original hydration payload", async (context) => {
  const originalTitle = document.title;
  const unsafeName = "</script><script>alert(1)</script>";
  const routes: AppRoute[] = [
    {
      path: "/tasks",
      loader: () => "Tasks",
      meta: ({ data }) => [
        { title: String(data) },
        { name: "description", content: "Task list" },
        {
          tagName: "link",
          rel: "canonical",
          href: "https://example.test/tasks",
        },
        { "script:ld+json": { name: unsafeName } },
      ],
    },
    { path: "/other", loader: () => "Other" },
  ];
  const router = createDataRouter(routes);
  const container = document.createElement("div");
  const root = createRoot(container);
  function Head() {
    return createElement(
      Fragment,
      {},
      createElement(Meta, {}),
      createElement(Links, {}),
      createElement(Scripts, { nonce: "test-nonce" }),
    );
  }
  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
    document.title = originalTitle;
  });
  await router.navigate("/tasks");
  root.render(
    createElement(RouterApplication, {
      router,
      routes,
      root: { user: "Ada" },
      rootModule: {
        default: Head,
        Layout: Outlet,
        meta: () => [{ title: "Fallback title" }],
        links: () => [{ rel: "author", href: "https://example.test/author" }],
      },
    }),
  );
  await expect.poll(() => document.title).toBe("Tasks");
  expect(
    document.querySelector('meta[name="description"]')?.getAttribute("content"),
  ).toBe("Task list");
  expect(
    document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
  ).toBe("https://example.test/tasks");
  expect(document.querySelector('link[rel="author"]')).not.toBeNull();
  const structuredData = container.querySelector(
    'script[type="application/ld+json"]',
  )!.textContent!;
  const payload = container.querySelector<HTMLScriptElement>("#smolter-data")!;
  const initialJSON = payload.textContent;
  expect(structuredData).not.toContain("<");
  expect(JSON.parse(structuredData)).toEqual({ name: unsafeName });
  expect(payload.nonce).toBe("test-nonce");
  expect(JSON.parse(initialJSON!)).toMatchObject({
    root: { user: "Ada" },
    snapshot: { data: "Tasks", path: "/tasks" },
  });
  await router.navigate("/other");
  await expect.poll(() => document.title).toBe("Fallback title");
  expect(document.querySelector('meta[name="description"]')).toBeNull();
  expect(payload.textContent).toBe(initialJSON);
  expect(container.querySelector("#smolter-data")).toBe(payload);
});
