import { expect, test } from "@playwright/test";

for (const path of ["/", "/preact.html", "/ssr"]) {
  test(`${path} submits without refresh and revalidates`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(path);
    await expect(page.getByTestId("count")).toHaveText("0");
    await page.evaluate(() => {
      document.documentElement.dataset.loaded = "once";
    });
    await page.getByRole("button", { name: "Add one" }).click();
    await expect(page.getByTestId("count")).toHaveText("1");
    await expect(page.getByRole("status")).toContainText("Saved");
    expect(
      await page.evaluate(() => document.documentElement.dataset.loaded),
    ).toBe("once");
    expect(new URL(page.url()).pathname).toBe(path);
    expect(errors).toEqual([]);
  });
}
test("React navigation and back preserve SPA state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("count")).toHaveText("0");
  await page.getByRole("button", { name: "Add one" }).click();
  await expect(page.getByTestId("count")).toHaveText("1");
  await page.getByRole("link", { name: "The idea" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep data out of components." }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("count")).toHaveText("1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByTestId("count")).toHaveText("0");
});
test("SSR produces HTML and hydrates without loading again", async ({
  page,
}) => {
  const response = await page.request.get("/ssr");
  expect(await response.text()).toContain('data-testid="count"');
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().clearCookies();
  await page.goto("/ssr");
  await expect(page.getByTestId("runs")).toHaveText("1");
  await page.getByRole("button", { name: "Revalidate" }).click();
  await expect(page.getByTestId("runs")).toHaveText("2");
  expect(errors).toEqual([]);
});
for (const path of ["/", "/preact.html", "/ssr"]) {
  test(`${path} makes real requests and keeps controls still while submitting`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByTestId("count")).toHaveText("0");
    await expect(page.getByText("Loader runs:")).toContainText("1");
    const button = page.getByRole("button", { name: "Add one" });
    const reset = page.getByRole("button", { name: "Reset", exact: true });
    const before = await button.boundingBox();
    const resetBefore = await reset.boundingBox();
    await button.hover();
    expect(await button.boundingBox()).toEqual(before);
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/counter", async (route) => {
      if (route.request().method() === "POST") await barrier;
      await route.continue();
    });
    const post = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/counter") && request.method() === "POST",
    );
    const get = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/counter") && request.method() === "GET",
    );
    await button.click();
    await post;
    await expect(button).toBeDisabled();
    expect(await button.boundingBox()).toEqual(before);
    expect(await reset.boundingBox()).toEqual(resetBefore);
    release();
    await get;
    await expect(page.getByTestId("count")).toHaveText("1");
    await expect(button).toBeEnabled();
    expect(await button.boundingBox()).toEqual(before);
  });
}
test("the original logo and header stay identical across every page", async ({
  page,
}) => {
  let expected: Awaited<
    ReturnType<ReturnType<typeof page.locator>["boundingBox"]>
  > = null;
  let markup: string | undefined;
  for (const path of ["/", "/about", "/preact.html", "/ssr"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const logo = page.locator(".wordmark");
    await expect(logo.locator(".brand-mark")).toHaveText("s_");
    const box = await logo.boundingBox();
    const html = await logo.evaluate((element) =>
      JSON.stringify(
        Array.from(element.querySelectorAll("*")).map((node) => ({
          tag: node.tagName,
          attributes: Array.from(node.attributes)
            .map((attr) => [attr.name, attr.value])
            .sort(),
          text: node.textContent,
        })),
      ),
    );
    if (!expected) {
      expected = box;
      markup = html;
      continue;
    }
    expect(box).toEqual(expected);
    expect(html).toBe(markup);
  }
});

test("all renderers share the same layout on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    let expected: unknown;
    for (const path of ["/", "/preact.html", "/ssr"]) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("button", { name: "Add one" })).toBeEnabled();
      const layout = await page.evaluate(() =>
        [
          "header",
          ".intro",
          ".panel-tabs",
          ".playground",
          "aside",
          "footer",
        ].map((selector) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return (
            box && { x: box.x, y: box.y, width: box.width, height: box.height }
          );
        }),
      );
      if (!expected) expected = layout;
      expect(layout).toEqual(expected);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
