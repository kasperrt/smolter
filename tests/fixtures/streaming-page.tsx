/** @jsxImportSource preact */
import { Outlet, useLoaderData } from "@smolter/preact";
import { Suspense, useState } from "preact/compat";
import { Await } from "../../packages/preact/src/await.tsx";
import { Document, Scripts } from "../../packages/preact/src/document.tsx";
import type { RootModule } from "../../packages/preact/src/route-types.ts";

export function StreamingPage() {
  const data = useLoaderData<{ detail: string | Promise<string> }>();
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>Immediate shell</h1>
      <Suspense fallback={<p>Pending detail</p>}>
        <Await resolve={data!.detail} errorElement={<p>Detail unavailable</p>}>
          {(detail) => <p>{detail}</p>}
        </Await>
      </Suspense>
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
          dangerouslySetInnerHTML={{
            __html: "window.appRuns = (window.appRuns || 0) + 1",
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </Document>
  ),
};
