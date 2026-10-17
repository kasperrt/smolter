import { type ComponentType, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  createResourceRouter,
  Resource,
  ResourceForm,
  ResourceProvider,
  type ResourceRouteModule,
  useResourceData,
  useResourceFetcher,
  useResourceRouter,
  useResourceSubmit,
} from "../../packages/react/src/data.ts";

interface ContextCase {
  name: string;
  message: string;
  component: ComponentType;
  provider: boolean;
}

const cases: ContextCase[] = [
  {
    name: "router",
    message: "RouterProvider is missing.",
    component: MissingRouter,
    provider: false,
  },
  {
    name: "route",
    message: "This hook requires a parent Route.",
    component: MissingRoute,
    provider: true,
  },
  {
    name: "form",
    message: "useSubmit must be used inside Form.",
    component: MissingForm,
    provider: true,
  },
  {
    name: "form target",
    message: "Form requires an action or a parent Route.",
    component: MissingFormTarget,
    provider: true,
  },
  {
    name: "fetcher target",
    message: "useFetcher requires a routeId or a parent Route.",
    component: MissingFetcherTarget,
    provider: true,
  },
  {
    name: "unhandled render failure",
    message: "Broken render",
    component: BrokenResource,
    provider: true,
  },
];

for (const item of cases) {
  it(`reports ${item.name} errors to the application's error handler`, async (context) => {
    const errors: unknown[] = [];
    const router = createResourceRouter(
      new Map<string, ResourceRouteModule>([
        ["broken", { default: BrokenRender }],
      ]),
    );
    const container = document.createElement("div");
    const root = createRoot(container, {
      onUncaughtError: (error) => errors.push(error),
    });
    const child = h(item.component);

    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
    });
    root.render(item.provider ? h(ResourceProvider, { router }, child) : child);

    await expect.poll(() => errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe(item.message);
  });
}

function MissingRouter() {
  useResourceRouter();

  return null;
}

function MissingRoute() {
  useResourceData();

  return null;
}

function MissingForm() {
  useResourceSubmit();

  return null;
}

function MissingFormTarget() {
  return h(ResourceForm);
}

function MissingFetcherTarget() {
  useResourceFetcher();

  return null;
}

function BrokenResource() {
  return h(Resource, { routeId: "broken" });
}

function BrokenRender(): never {
  throw Error("Broken render");
}
