import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const sizes = JSON.parse(readFileSync("packages/ui/src/size.json", "utf8"));
const basePort = Number(process.env.SMOLTER_TEST_PORT ?? 4173);
const examples = [
  { name: "React", port: basePort + 0, ssr: false, bytes: sizes.react },
  { name: "Preact", port: basePort + 1, ssr: false, bytes: sizes.preact },
  {
    name: "React SSR",
    port: basePort + 2,
    ssr: true,
    bytes: sizes.reactServer,
  },
  {
    name: "Preact SSR",
    port: basePort + 3,
    ssr: true,
    bytes: sizes.preactServer,
  },
];

for (const example of examples) {
  const origin = `http://127.0.0.1:${example.port}`;

  test(`${example.name}: counter, stable controls, and measured size`, async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(origin);

    await expect(page.getByTestId("count")).toHaveText("0");

    await expect(page.getByTestId("runs")).toHaveText("1");

    await expect(page.getByTestId("gzip-size")).toContainText(
      `${example.bytes} B`,
    );

    await page.evaluate(() => {
      document.documentElement.dataset.mounted = "once";
    });

    const button = page.getByRole("button", { name: "Add one" });
    const before = await button.boundingBox();

    await button.hover();

    expect(await button.boundingBox()).toEqual(before);
    await button.click();

    await expect(page.getByTestId("count")).toHaveText("1");

    await expect(page.getByTestId("runs")).toHaveText("2");

    expect(await button.boundingBox()).toEqual(before);

    expect(
      await page.evaluate(() => document.documentElement.dataset.mounted),
    ).toBe("once");

    expect(errors).toEqual([]);
  });

  test(`${example.name}: fetcher reads its own data without navigation or page revalidation`, async ({
    page,
  }) => {
    await page.goto(`${origin}/tasks`);

    await expect(
      page.getByRole("link", { name: "Read the route", exact: true }),
    ).toBeVisible();

    await expect(page.getByTestId("fetcher-data")).toHaveText(
      "Nothing fetched yet.",
    );

    const requests: string[] = [];

    page.on("request", (request) => {
      if (request.url().includes("/_smolter?"))
        requests.push(new URL(request.url()).searchParams.get("url")!);
    });

    await page.getByRole("button", { name: "Fetch task 1" }).click();

    await expect(page.getByTestId("fetcher-data")).toHaveText("Read the route");

    await expect(
      page.getByRole("link", { name: "Edit a task", exact: true }),
    ).toBeVisible();

    expect(page.url()).toBe(`${origin}/tasks`);

    expect(requests).toEqual(example.ssr ? ["/tasks/1"] : []);
  });

  test(`${example.name}: POST, PATCH, no-op revalidation, DELETE`, async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${origin}/tasks`);

    await page.getByLabel("New task").fill("A new task");

    await page.getByRole("button", { name: "Create task" }).click();

    await page.getByRole("link", { name: "A new task", exact: true }).click();

    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "A new task",
    );

    await page.getByLabel("Title", { exact: true }).fill("Renamed task");

    await page.getByRole("button", { name: "Save task" }).click();

    await expect(page.getByRole("status")).toHaveText("Task saved.");

    const requests: string[] = [];

    page.on("request", (request) => {
      if (request.url().includes("/_smolter?")) requests.push(request.method());
    });

    await page.getByRole("button", { name: "Save task" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "No changes. Loader skipped.",
    );

    expect(requests).toEqual(example.ssr ? ["PATCH"] : []);

    await page.getByRole("button", { name: "Delete task" }).click();

    await expect(page).toHaveURL(`${origin}/tasks`);

    await expect(
      page.getByRole("link", { name: "Renamed task", exact: true }),
    ).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  if (example.ssr) {
    test(`${example.name}: server HTML contains data and hydration does not reload`, async ({
      page,
    }) => {
      const dataRequests: string[] = [];

      page.on("request", (request) => {
        if (request.url().includes("/_smolter?"))
          dataRequests.push(request.url());
      });

      const response = await page.goto(origin);

      expect(await response!.text()).toContain('data-testid="count">0');

      await expect(page.getByTestId("runs")).toHaveText("1");

      await page
        .getByRole("button", { name: "Revalidate ↻", exact: true })
        .click();

      await expect(page.getByTestId("runs")).toHaveText("2");

      expect(dataRequests).toHaveLength(1);
    });
  }
}

test("all examples use the same branding and responsive geometry", async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });

    let expected: unknown;

    for (const example of examples) {
      await page.goto(`http://127.0.0.1:${example.port}/`);

      await page.evaluate(() => document.fonts.ready);

      await expect(page.getByRole("button", { name: "Add one" })).toBeEnabled();

      await expect(page.locator(".brand-mark")).toHaveText("s_");

      const layout = await page.evaluate(() =>
        ["header", ".intro", ".panel-tabs", ".playground", "aside"].map(
          (selector) => {
            const box = document
              .querySelector(selector)!
              .getBoundingClientRect();

            return { x: box.x, y: box.y, width: box.width, height: box.height };
          },
        ),
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

test("tabs switch between standalone apps and examples hide internal UI plumbing", async ({
  page,
}) => {
  await page.goto(`http://127.0.0.1:${basePort}/`);

  for (const example of [...examples.slice(1), examples[0]]) {
    await page
      .locator(".panel-tabs")
      .getByRole("link", { name: example.name, exact: true })
      .click();

    await expect(page).toHaveURL(`http://127.0.0.1:${example.port}/`);

    await expect(
      page.getByRole("button", { name: "Add one +", exact: true }),
    ).toBeEnabled();

    await expect(page.locator(".panel-tabs [aria-current]")).toHaveText(
      example.name,
    );

    const source = page.getByTestId("source-panel").locator("code");

    await expect(source).toContainText('value="increment"');

    await expect(source).toContainText('value="reset"');

    await expect(source).not.toContainText("ui.CounterPanel");

    await expect(source.locator(".syntax-keyword").first()).toBeVisible();

    await page
      .getByRole("button", { name: "Manual routes", exact: true })
      .click();

    await expect(source).toContainText('defineRoute("/tasks/:id", task)');

    await page
      .getByRole("button", { name: "File routes", exact: true })
      .click();

    await expect(source).toContainText("tasks.$id/route.ts");

    await expect(source).toContainText("RouterProvider");
  }
});
