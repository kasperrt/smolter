import type { ViteDevServer } from "vite";

export function configureTransport(
  server: ViteDevServer,
  publicId: string,
  framework: "react" | "preact" = "react",
  dataEndpoint = "/_smolter",
): void {
  server.middlewares.use((incoming, outgoing, next) => {
    if (!incoming.url?.startsWith(`${dataEndpoint}?`)) return next();

    outgoing.setHeader("Cache-Control", "private, no-store");

    const dispatch = async () => {
      const origin = `http://${incoming.headers.host}`;
      const target = new URL(incoming.url!, origin).searchParams.get("url");

      if (!target?.startsWith("/") || target.startsWith("//")) {
        outgoing.statusCode = 400;
        outgoing.end("Invalid route URL");

        return;
      }

      const headers = new Headers();

      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value)
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }

      const chunks: Uint8Array[] = [];

      for await (const chunk of incoming) chunks.push(chunk);

      const controller = new AbortController();

      outgoing.once("close", () => controller.abort());

      const request = new Request(new URL(target, origin), {
        signal: controller.signal,
        method: incoming.method,
        headers,
        ...(incoming.method !== "GET" && {
          body: new Uint8Array(Buffer.concat(chunks)),
        }),
      });
      const [{ default: routes }, { handleRequest }] = await Promise.all([
        server.ssrLoadModule(publicId),
        server.ssrLoadModule(`@kasperrt/smolter/${framework}/server`),
      ]);
      const response: Response = await handleRequest(routes, request);

      outgoing.statusCode = response.status;

      response.headers.forEach((value, name) =>
        outgoing.setHeader(name, value),
      );
      outgoing.end(new Uint8Array(await response.arrayBuffer()));
    };

    void dispatch().catch(next);
  });
}
