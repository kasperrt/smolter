/** @jsxImportSource react */
import {
  Outlet,
  type RootModule,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRootData,
} from "@kasperrt/smolter/react";
import {
  Document,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
} from "@kasperrt/smolter/react/document";
import { Suspense, use, useState } from "react";

function Optional({ value }: { value: Promise<string> }) {
  return <p>{use(value)}</p>;
}
export function Home() {
  const data = useLoaderData<{ optional: Promise<string> }>();
  return (
    <Suspense fallback={<p>Optional data pending</p>}>
      <Optional value={data.optional} />
    </Suspense>
  );
}
export function Destination() {
  return <h2>Destination ready</h2>;
}
function Shell() {
  const navigate = useNavigate();
  const { submit } = useFetcher();
  const root = useRootData<{ revision: number }>();
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>Persistent shell</h1>
      <button onClick={() => setCount(count + 1)}>Count {count}</button>
      <input aria-label="Draft" />
      <button onClick={() => navigate("/destination?pending=1#scope")}>
        Navigate
      </button>
      <button
        onClick={() => void submit({}, { action: "/save", method: "post" })}
      >
        Save
      </button>
      <output aria-label="Root revision">{root?.revision ?? 0}</output>
      <Outlet />
    </main>
  );
}
export const root: RootModule = {
  default: Shell,
  loaderPath: "/session",
  meta: () => [
    { title: "React application" },
    { name: "description", content: "SSR parity" },
  ],
  links: () => [{ rel: "stylesheet", href: "/style.css" }],
  Layout: ({ children }) => (
    <Document lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts nonce="react-fixture" />
      </body>
    </Document>
  ),
};
