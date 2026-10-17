import { createDataRouter } from "@smolter/core";
import { type AppRoute, Outlet, RouterApplication } from "@smolter/preact";
import { createElement, Fragment } from "preact";
import { createRoot, hydrateRoot } from "preact/compat/client";
import { expect, it } from "vitest";
import {
  Document,
  Links,
  Meta,
  Scripts,
} from "../../packages/preact/src/document.tsx";

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
    container
      .querySelector('meta[name="description"]')
      ?.getAttribute("content"),
  ).toBe("Task list");
  expect(
    container.querySelector('link[rel="canonical"]')?.getAttribute("href"),
  ).toBe("https://example.test/tasks");
  expect(container.querySelector('link[rel="author"]')).not.toBeNull();

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
  expect(container.querySelector('meta[name="description"]')).toBeNull();
  expect(payload.textContent).toBe(initialJSON);
  expect(container.querySelector("#smolter-data")).toBe(payload);
});

it("preserves browser theme classes during hydration and reconciles document prop changes", async (context) => {
  const html = document.documentElement;
  const originalClass = html.className;
  const originalLang = html.lang;
  const originalDebug = html.getAttribute("data-debug");
  const container = document.createElement("div");

  html.className = "server-layout dark";
  container.innerHTML = "<main>Server content</main>";
  document.body.append(container);

  const root = hydrateRoot(
    container,
    createElement(
      Document,
      { className: "server-layout", lang: "nb", "data-debug": true },
      createElement("main", {}, "Server content"),
    ),
  );

  context.onTestFinished(() => {
    root.unmount();
    container.remove();
    html.className = originalClass;
    html.lang = originalLang;

    if (originalDebug === null) {
      html.removeAttribute("data-debug");

      return;
    }

    html.setAttribute("data-debug", originalDebug);
  });

  await expect.poll(() => html.lang).toBe("nb");
  expect(html.className).toBe("server-layout dark");
  expect(html.dataset.debug).toBe("true");
  expect(container.textContent).toBe("Server content");

  root.render(
    createElement(
      Document,
      { className: "next-layout wide", lang: "en", "data-debug": false },
      createElement("main", {}, "Client content"),
    ),
  );

  await expect.poll(() => html.classList.contains("next-layout")).toBe(true);
  expect([...html.classList]).toEqual(["dark", "next-layout", "wide"]);
  expect(html.lang).toBe("en");
  expect(html.dataset.debug).toBe("false");
  expect(container.textContent).toBe("Client content");
});
