import { createDataRouter } from "@smolter/core";
import { retainRoute } from "@smolter/core/presentation";
import { createStore } from "@smolter/core/store";
import {
  Outlet,
  RouterApplication,
  RouterProvider,
  useMatches,
  useNavigation,
  useNavigationType,
  useOutletContext,
  useRootData,
  useRouteError,
  useRouteLoaderData,
} from "@smolter/react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { deferred } from "../helpers/deferred.ts";

it("keeps root data and outlet context while pending route data commits and errors propagate", async (context) => {
  const pending = deferred<string>();
  const failure = new Error("Route unavailable");
  const routes = [
    { id: "tasks", path: "/tasks", loader: () => "tasks data" },
    { id: "other", path: "/other", loader: () => pending.promise },
    { id: "broken", path: "/broken", loader: () => failure },
  ];
  const router = createDataRouter(routes);
  const rootStore = createStore({ user: "Ada" });
  const container = document.createElement("div");
  const root = createRoot(container);
  let read: () => unknown = () => undefined;
  let currentNavigation: ReturnType<typeof useNavigation> | undefined;

  function Probe() {
    const root = useRootData();
    const rootById = useRouteLoaderData("root");
    const tasks = useRouteLoaderData("tasks");
    const other = useRouteLoaderData("other");
    const missing = useRouteLoaderData("missing");
    const matches = useMatches();
    const outlet = useOutletContext();
    const navigation = useNavigation();
    const navigationType = useNavigationType();
    const error = useRouteError();

    currentNavigation = navigation;
    read = () => ({
      root,
      rootById,
      tasks,
      other,
      missing,
      matches,
      outlet,
      navigation,
      navigationType,
      error,
    });

    return null;
  }

  function Root() {
    return createElement(
      Outlet,
      { context: "shared layout" },
      createElement(Probe, {}),
    );
  }

  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
  });

  await router.navigate("/tasks");
  retainRoute(router, (commit) => commit());
  root.render(
    createElement(RouterApplication, {
      router,
      routes,
      root: rootStore.getSnapshot(),
      rootStore,
      rootModule: { default: Root, ErrorBoundary: Root, Layout: Outlet },
    }),
  );

  await expect
    .poll(() => read())
    .toMatchObject({
      root: { user: "Ada" },
      rootById: { user: "Ada" },
      tasks: "tasks data",
      other: undefined,
      missing: undefined,
      matches: [{ id: "tasks", data: "tasks data", params: {} }],
      outlet: "shared layout",
      navigationType: "POP",
    });

  const navigation = router.navigate("/other");

  await expect
    .poll(() => read())
    .toMatchObject({
      tasks: "tasks data",
      other: undefined,
      navigation: { state: "loading", location: { pathname: "/other" } },
    });

  const previousNavigation = currentNavigation;

  rootStore.update({ user: "Grace" });

  await expect
    .poll(() => read())
    .toMatchObject({ root: { user: "Grace" }, rootById: { user: "Grace" } });

  expect(currentNavigation).toBe(previousNavigation);

  pending.resolve("other data");
  await navigation;

  await expect
    .poll(() => read())
    .toMatchObject({
      tasks: undefined,
      other: "other data",
      matches: [{ id: "other", data: "other data", params: {} }],
      navigation: { state: "idle", location: undefined },
      outlet: "shared layout",
    });

  await router.navigate("/broken");

  await expect
    .poll(() => read())
    .toMatchObject({ error: failure, root: { user: "Grace" } });
});

it("only rerenders route-error readers when the error changes", async (context) => {
  const pending = deferred<string>();
  const failure = new Error("Route unavailable");
  const router = createDataRouter([
    { path: "/", loader: () => "ready" },
    { path: "/pending", loader: () => pending.promise },
    { path: "/broken", loader: () => failure },
  ]);
  const container = document.createElement("div");
  const root = createRoot(container);
  let renders = 0;

  function ErrorReader() {
    const error = useRouteError();

    renders++;

    return createElement("output", {}, error?.message ?? "No error");
  }

  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
  });

  await router.navigate("/");
  root.render(
    createElement(RouterProvider, { router }, createElement(ErrorReader, {})),
  );
  await expect.poll(() => container.textContent).toBe("No error");

  const initialRenders = renders;
  const navigation = router.navigate("/pending");

  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);

  expect(renders).toBe(initialRenders);

  pending.resolve("loaded");
  await navigation;
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);

  expect(renders).toBe(initialRenders);

  await router.navigate("/broken");
  await expect.poll(() => container.textContent).toBe(failure.message);

  await router.navigate("/");
  await expect.poll(() => container.textContent).toBe("No error");
});
