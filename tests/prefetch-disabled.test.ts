import { expect, it, vi } from "vitest";
import { createDataRouter } from "../packages/core/src/router.ts";

vi.mock("../packages/core/src/prefetch.ts", () => ({
  dataPrefetch: undefined,
}));

it("keeps ordinary navigation and mutations working when Vite omits data prefetch", async () => {
  const loader = vi.fn(() => "loaded");
  const action = vi.fn(() => "saved");
  const router = createDataRouter([{ path: "/", loader, action }]);
  expect((await router.prefetch("/")).error?.message).toContain(
    "excluded from this build",
  );
  expect(loader).not.toHaveBeenCalled();
  await router.navigate("/");
  await router.submit("/", new FormData());
  expect(action).toHaveBeenCalledOnce();
  expect(router.getSnapshot().data).toBe("loaded");
  router.dispose();
});
