import { createDataRouter } from "@smolter/core";
import { readSubmission } from "@smolter/core/submission";
import {
  RouterProvider,
  useFetcher,
  useNavigate,
  useSearchParams,
  useSubmit,
  useURLLocation,
} from "@smolter/react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

it("submits structured JSON actions and repeated GET fields through the route hook", async (context) => {
  const router = createDataRouter([
    {
      path: "/tasks",
      loader: ({ request }) => [...new URL(request.url).searchParams],
      action: async ({ request }) => ({
        method: request.method,
        value: await readSubmission(request),
      }),
    },
  ]);
  const container = document.createElement("div");
  const root = createRoot(container);
  let submit: ReturnType<typeof useSubmit> | undefined;

  function Probe() {
    submit = useSubmit();

    return null;
  }

  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
  });

  await router.navigate("/tasks");
  root.render(
    createElement(RouterProvider, { router }, createElement(Probe, {})),
  );

  await expect.poll(() => submit).toBeTypeOf("function");

  const value = { items: [{ id: 7 }], enabled: true };

  await submit!(value, { method: "patch", encType: "application/json" });

  expect(router.getSnapshot().actionData).toEqual({ method: "PATCH", value });

  const fields = new FormData();
  fields.append("tag", "one");
  fields.append("tag", "two");
  fields.append("file", new File(["content"], "notes.txt"));

  await submit!(fields, { method: "get", action: "/tasks?old=value" });

  expect(router.getSnapshot().data).toEqual([
    ["tag", "one"],
    ["tag", "two"],
    ["file", "notes.txt"],
  ]);
  expect(router.getSnapshot().actionData).toBeUndefined();
});

interface NavigationHooks {
  navigate: ReturnType<typeof useNavigate>;
  search: ReturnType<typeof useSearchParams>;
  location: ReturnType<typeof useURLLocation>;
}

it("preserves partial URL fields and search identity through search updates and history navigation", async (context) => {
  const router = createDataRouter([
    { path: "/tasks", loader: () => "tasks" },
    { path: "/other", loader: () => "other" },
  ]);
  const container = document.createElement("div");
  const root = createRoot(container);
  const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
  let hooks: NavigationHooks | undefined;

  function Probe() {
    hooks = {
      navigate: useNavigate(),
      search: useSearchParams(),
      location: useURLLocation(),
    };

    return null;
  }

  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    go.mockRestore();
  });

  await router.navigate("/tasks?first=1#section");
  root.render(
    createElement(RouterProvider, { router }, createElement(Probe, {})),
  );

  await expect.poll(() => hooks?.location.hash).toBe("#section");

  const originalSearch = hooks!.search[0];

  hooks!.navigate({ hash: "#next" });

  await expect.poll(() => hooks?.location.hash).toBe("#next");
  expect(hooks!.location.pathname).toBe("/tasks");
  expect(hooks!.search[0]).toBe(originalSearch);

  hooks!.navigate({ search: "?q=one" });

  await expect.poll(() => hooks?.search[0].get("q")).toBe("one");
  expect(hooks!.location.hash).toBe("#next");

  hooks!.search[1](
    new URLSearchParams([
      ["tag", "one"],
      ["tag", "two"],
    ]),
    { replace: true },
  );

  await expect
    .poll(() => hooks?.search[0].getAll("tag"))
    .toEqual(["one", "two"]);
  expect(hooks!.location.pathname).toBe("/tasks");

  hooks!.navigate("/other");

  await expect.poll(() => hooks?.location.pathname).toBe("/other");
  expect(router.getSnapshot().data).toBe("other");

  hooks!.navigate(-1);

  expect(go).toHaveBeenCalledExactlyOnceWith(-1);
});

it("loads a fetcher GET target without navigating or calling its action", async (context) => {
  const action = vi.fn(() => "unexpected mutation");
  const router = createDataRouter([
    { path: "/", loader: () => "page data" },
    {
      path: "/search",
      loader: ({ request }) => [...new URL(request.url).searchParams],
      action,
    },
  ]);
  const root = createRoot(document.createElement("div"));
  let fetcher: ReturnType<typeof useFetcher> | undefined;

  function Probe() {
    fetcher = useFetcher();

    return null;
  }

  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
  });

  await router.navigate("/");
  root.render(
    createElement(RouterProvider, { router }, createElement(Probe, {})),
  );
  await expect.poll(() => fetcher).toBeDefined();

  const fields = new FormData();
  fields.append("tag", "one");
  fields.append("tag", "two");

  await fetcher!.submit(fields, { action: "/search?old=value", method: "get" });

  await expect
    .poll(() => fetcher!.data)
    .toEqual([
      ["tag", "one"],
      ["tag", "two"],
    ]);
  expect(fetcher!.state).toBe("idle");
  expect(action).not.toHaveBeenCalled();
  expect(router.getSnapshot().url).toBe("http://localhost/");
  expect(router.getSnapshot().data).toBe("page data");
});
