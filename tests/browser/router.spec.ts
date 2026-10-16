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
