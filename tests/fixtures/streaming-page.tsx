/** @jsxImportSource preact */
import { Link, Outlet, useFetcher, useLoaderData } from "@smolter/preact";
import { useState } from "preact/compat";
import { Await } from "../../packages/preact/src/await.tsx";
import { Document, Scripts } from "../../packages/preact/src/document.tsx";
import type { RootModule } from "../../packages/preact/src/route-types.ts";

export function StreamingPage() {
  const data = useLoaderData<{
    detail: string | Promise<string>;
    later?: Promise<string>;
  }>();
  const [count, setCount] = useState(0);
  const fetcher = useFetcher<number>();

  return (
    <main>
      <h1>Immediate shell</h1>

      <Await
        fallback={<p>Pending detail</p>}
        resolve={data!.detail}
        errorElement={<p>Detail unavailable</p>}
      >
        {(detail) => <p>{detail}</p>}
      </Await>

      {data?.later && (
        <Await fallback={<p>Pending later</p>} resolve={data.later}>
          {(value) => <p>{value}</p>}
        </Await>
      )}
      <Link to="/other">Other route</Link>
      <fetcher.Form method="post" action="/">
        <button>Save</button>
        <output aria-label="Saved">{fetcher.data ?? 0}</output>
      </fetcher.Form>
      <input aria-label="Draft" defaultValue="" />
      <button onClick={() => setCount(count + 1)}>Count {count}</button>
    </main>
  );
}

export const streamingRoot: RootModule = {
  default: Outlet,
  Layout: ({ children }) => (
    <Document>
      <head>
        <title>Streaming fixture</title>
        <style id="app-style">{"main { color: rgb(20, 30, 40); }"}</style>
        <script
          id="app-script"
          nonce="stream-test"
          dangerouslySetInnerHTML={{
            __html: "window.appRuns = (window.appRuns || 0) + 1",
          }}
        />
      </head>
      <body>
        {children}
        <Scripts nonce="stream-test" />
      </body>
    </Document>
  ),
};
