import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  createResourceRouter,
  Resource,
  ResourceProvider,
  type ResourceRouteModule,
  useResourceData,
  useResourceFetcher,
} from "../../packages/react/src/data.ts";

it("routes an unexpected fetcher failure to its owning resource and retries it", async (context) => {
  let loads = 0;
  let fetcher: ReturnType<typeof useResourceFetcher>;
  const routes = new Map<string, ResourceRouteModule>([
    [
      "page",
      {
        default: Screen,
        ErrorBoundary: Retry,
        loader: async () => ({ data: ++loads, error: "" }),
      },
    ],
    ["broken", { loader: () => Promise.reject(Error("private failure")) }],
  ]);
  const router = createResourceRouter(routes);
  const container = document.createElement("div");
  const root = createRoot(container);

  function Screen() {
    const data = useResourceData<number>();
    fetcher = useResourceFetcher();

    return h("output", null, String(data));
  }

  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
  });
  root.render(
    h(ResourceProvider, { router }, h(Resource, { routeId: "page" })),
  );
  await expect.poll(() => container.textContent).toBe("1");

  const result = await fetcher![1].load({ routeId: "broken" });

  expect(result.unexpected).toBe(true);
  expect(result.error).not.toContain("private");
  await expect.poll(() => container.textContent).toBe("Retry");
  expect(router.getSnapshot("page", {}).unexpectedError).toBe(true);

  container.querySelector("button")!.click();
  await expect.poll(() => container.textContent).toBe("2");
  expect(router.getSnapshot("page", {}).unexpectedError).toBe(false);
});

interface RetryProps {
  retry: () => void;
}

function Retry({ retry }: RetryProps) {
  return h("button", { onClick: retry }, "Retry");
}
