import { useLoaderData } from "@smolter/react";
import { mountApplication } from "@smolter/react/client";
import { createElement } from "react";
import { expect, it } from "vitest";

for (const hash of [false, true]) {
  it(`mounts and navigates a React application (${hash ? "hash" : "browser"} history)`, async (context) => {
    const original = location.href;
    const container = document.createElement("div");
    const calls: string[] = [];
    expect(document.getElementById("root")).toBeNull();
    container.id = "root";
    document.body.append(container);
    history.replaceState(
      null,
      "",
      hash ? "/mount-shell#/mount-first" : "/mount-first",
    );
    function Page() {
      return createElement("output", null, useLoaderData<string>());
    }
    const router = await mountApplication(
      [
        {
          path: "/mount-first",
          preload: async () => {
            calls.push("preload");
          },
          loader: () => {
            calls.push("loader");
            return "First";
          },
          default: Page,
        },
        { path: "/mount-second", loader: () => "Second", default: Page },
      ],
      undefined,
      hash,
    );
    context.onTestFinished(() => {
      router.dispose();
      container.remove();
      history.replaceState(null, "", original);
    });
    await expect.poll(() => container.textContent).toBe("First");
    expect(calls).toEqual(["preload", "loader"]);
    await router.navigate("/mount-second");
    await expect.poll(() => container.textContent).toBe("Second");
    expect(hash ? location.hash : location.pathname).toBe(
      hash ? "#/mount-second" : "/mount-second",
    );
    if (hash) {
      history.replaceState(null, "", "/mount-shell#/mount-first");
      dispatchEvent(new HashChangeEvent("hashchange"));
      await expect.poll(() => container.textContent).toBe("First");
    }
  });
}

interface HydratedError {
  instance: boolean;
  message: string;
  status: number;
}

interface HydrationResult {
  type: string;
  classes: string;
  reused: boolean;
  preserved: boolean;
  reads: number;
  text: string | null;
  error?: HydratedError;
}

for (const scenario of [
  { file: "react-hydration", text: "Server data" },
  {
    file: "react-hydration-error",
    text: "Server error",
    error: { instance: true, message: "Server error", status: 503 },
  },
]) {
  it(`hydrates ${scenario.file} without replacing markup or rerunning the loader`, async (context) => {
    const frame = document.createElement("iframe");
    const messages: HydrationResult[] = [];
    const receive = (event: MessageEvent<HydrationResult>) => {
      if (event.source === frame.contentWindow) messages.push(event.data);
    };
    addEventListener("message", receive);
    context.onTestFinished(() => {
      removeEventListener("message", receive);
      frame.remove();
    });
    frame.src = new URL(
      `../fixtures/${scenario.file}.html`,
      import.meta.url,
    ).href;
    document.body.append(frame);
    await expect
      .poll(() => messages.find((message) => message.type === "hydrated"))
      .toEqual({
        type: "hydrated",
        classes: "server-layout dark",
        reused: true,
        preserved: true,
        reads: 0,
        text: scenario.text,
        ...(scenario.error && { error: scenario.error }),
      });
    frame.contentWindow!.postMessage("navigate", location.origin);
    await expect
      .poll(
        () => messages.find((message) => message.type === "navigated")?.text,
      )
      .toBe("Next page");
    expect(
      messages.find((message) => message.type === "navigated")?.preserved,
    ).toBe(true);
    expect(
      messages.find((message) => message.type === "navigated")?.classes,
    ).toBe("dark next-layout wide");
  });
}

it("commits action redirects to hash history and restores the route on Back", async (context) => {
  const original = location.href;
  const container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
  history.replaceState(null, "", "/hash-audit#/join");
  const router = await mountApplication(
    [
      {
        path: "/join",
        default: () => createElement("p", null, "Join"),
        action: () =>
          new Response(null, { status: 303, headers: { Location: "/room" } }),
      },
      { path: "/room", default: () => createElement("p", null, "Room") },
      { path: "/next", default: () => createElement("p", null, "Next") },
    ],
    undefined,
    { hash: true },
  );
  context.onTestFinished(() => {
    router.dispose();
    container.remove();
    history.replaceState(null, "", original);
  });
  await expect.poll(() => container.textContent).toBe("Join");
  await router.createFetcher().submit("/join", new FormData());
  expect(location.hash).toBe("#/room");
  await expect.poll(() => container.textContent).toBe("Room");
  await router.navigate("/next");
  history.back();
  await expect.poll(() => location.hash).toBe("#/room");
  await expect.poll(() => container.textContent).toBe("Room");
});

it("checks deployment metadata when the initial route import fails", async (context) => {
  const { vi } = await import("vitest");
  const original = location.href;
  history.replaceState(null, "", "/bootstrap-audit");
  const reload = vi.fn();
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ version: "new" }));
  context.onTestFinished(() => {
    fetcher.mockRestore();
    history.replaceState(null, "", original);
    sessionStorage.clear();
  });
  await expect(
    mountApplication(
      [
        {
          path: "/bootstrap-audit",
          preload: () => Promise.reject(new Error("Chunk missing")),
        },
      ],
      undefined,
      {
        deployment: {
          version: "bootstrap-old",
          manifestURL: "/manifest.json",
          reload,
        },
      },
    ),
  ).rejects.toThrow("Chunk missing");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});
