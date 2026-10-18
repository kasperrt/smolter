import {
  type ErrorProps,
  Outlet,
  type Snapshot,
  useLoaderData,
} from "@smolter/preact";
import { mountApplication } from "@smolter/preact/client";
import { Document } from "@smolter/preact/document";
import { type ComponentChildren, createElement } from "preact";

interface LayoutProps {
  children?: ComponentChildren;
}

let reads = 0;
const output = document.querySelector("output");
const head = document.head.innerHTML;
const injected = document.createElement("meta");
injected.name = "injected";
injected.setAttribute("data-smolter-preserve", "");
document.head.prepend(injected);
const tail = injected.cloneNode() as HTMLMetaElement;
tail.name = "injected-tail";
document.head.append(tail);
const failed = location.pathname.endsWith("hydration-error.html");
const snapshot: Snapshot = {
  url: location.href,
  path: location.pathname,
  params: {},
  data: failed ? undefined : "Server data",
  loaded: !failed,
  state: "idle",
};
const payload = JSON.stringify({
  root: { deferred: { __smolterRejected: { message: "Deferred failure" } } },
  snapshot: {
    ...snapshot,
    ...(failed && {
      error: { name: "Error", message: "Server error", status: 503 },
    }),
  },
});
const script = document.createElement("script");

script.id = "smolter-data";
script.type = "application/json";
script.textContent = payload;
document.body.append(script);

function Page() {
  return createElement("output", null, useLoaderData<string>());
}

function ErrorPage({ error }: ErrorProps) {
  return createElement("output", null, error.message);
}

function Layout({ children }: LayoutProps) {
  return createElement(
    Document,
    { lang: "en" },
    createElement("head", { dangerouslySetInnerHTML: { __html: head } }),
    createElement(
      "body",
      null,
      children,
      createElement(
        "script",
        { id: "smolter-data", type: "application/json" },
        payload,
      ),
    ),
  );
}

const router = await mountApplication(
  [
    {
      path: location.pathname,
      loader: () => ++reads,
      default: Page,
      ErrorBoundary: ErrorPage,
    },
    { path: "/hydration-next", loader: () => "Next page", default: Page },
  ],
  { Layout, default: Outlet },
);

function report(type: string) {
  const error = router.getSnapshot().error;
  parent.postMessage(
    {
      type,
      reused: document.querySelector("output") === output,
      preserved:
        injected.parentNode === document.head &&
        tail.parentNode === document.head,
      reads,
      text: document.querySelector("output")?.textContent,
      ...(error && {
        error: {
          instance: error instanceof Error,
          message: error.message,
          status: "status" in error ? error.status : undefined,
        },
      }),
    },
    location.origin,
  );
}

await new Promise(requestAnimationFrame);
report("hydrated");

addEventListener("message", async (event) => {
  if (event.source !== parent || event.data !== "navigate") return;
  await router.navigate("/hydration-next");
  await new Promise(requestAnimationFrame);
  report("navigated");
});
addEventListener("pagehide", () => router.dispose());
