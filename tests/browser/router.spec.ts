import { expect, test } from "@playwright/test";

for (const path of ["/", "/preact.html"]) {
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
    page.getByRole("heading", { name: "Less router." }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("count")).toHaveText("1");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByTestId("count")).toHaveText("0");
});
test("SSR produces HTML and hydrates without loading again", async ({
  page,
  request,
}) => {
  const response = await request.get("/ssr");
  expect(await response.text()).toContain("Rendered on the server");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ssr");
  await expect(page.getByTestId("runs")).toHaveText("1");
  await page.getByRole("button", { name: "Revalidate" }).click();
  await expect(page.getByTestId("runs")).toHaveText("2");
  expect(errors).toEqual([]);
});
for (const path of ["/", "/preact.html"]) {
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
    await expect(logo.locator("span")).toHaveText("s.");
    const box = await logo.boundingBox();
    const html = await logo.innerHTML();
    if (!expected) {
      expected = box;
      markup = html;
      continue;
    }
    expect(box).toEqual(expected);
    expect(html).toBe(markup);
  }
});
