import { expect, it } from "vitest";
import { deferredHydration } from "../../src/deferred-hydration.ts";
import { streamDocument } from "../../src/stream-document.ts";

async function text(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text();
}

it("finalizes streamed hydration into the Smolter JSON script, not a clobbering element", async (context) => {
  const host = document.createElement("div");
  host.innerHTML =
    '<div id="smolter-data">Forged</div><script id="smolter-data" type="application/json"></script>';
  document.body.append(host);
  context.onTestFinished(() => host.remove());
  const html = await text(
    streamDocument(new Response("<p>Shell</p></body>").body!, {
      hydration: Promise.resolve({ root: "Server" }),
      signal: new AbortController().signal,
      dispose: () => {},
    }),
  );
  const tail = html.slice(html.indexOf('<script type="application/json">'));
  host.append(document.createRange().createContextualFragment(tail));
  const [forged, payload] = host.querySelectorAll("#smolter-data");
  expect(forged.textContent).toBe("Forged");
  expect(payload.textContent).toBe('{"root":"Server"}');
});

it("delivers deferred settlements when a named element shadows the queue", async (context) => {
  const host = document.createElement("div");
  const anchor = document.createElement("a");
  anchor.id = "__smolterDeferred";
  Reflect.deleteProperty(window, "__smolterDeferred");
  host.append(anchor);
  document.body.append(host);
  context.onTestFinished(() => {
    host.remove();
    Reflect.deleteProperty(window, "__smolterDeferred");
  });
  const { stream } = deferredHydration({ value: Promise.resolve("Late") });
  host.append(
    document.createRange().createContextualFragment(await text(stream)),
  );
  expect(Reflect.get(window, "__smolterDeferred")).toEqual([
    [0, "Late", null],
    [-1, null, null],
  ]);
});
