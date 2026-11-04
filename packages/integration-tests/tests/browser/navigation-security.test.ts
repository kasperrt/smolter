import { createDataRouter } from "@smolter/core";
import { configureApplication } from "@smolter/core/environment";
import { connectNavigation } from "@smolter/core/navigation";
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
