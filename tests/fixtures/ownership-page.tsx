/** @jsxImportSource preact */
import {
  Await,
  Outlet,
  useLoaderData,
  useRevalidator,
  useRootData,
  useRouter,
} from "@kasperrt/smolter/preact";
import { Document, Scripts } from "@kasperrt/smolter/preact/document";
import type { ComponentChildren } from "preact";
import { Suspense, useState } from "preact/compat";

interface Detail {
  nested: Promise<string>;
}

interface Data {
  optional: string | Promise<string | Detail>;
  second?: Promise<string>;
}

interface RootData {
  optional?: string | Promise<string>;
}

interface LayoutProps {
  children?: ComponentChildren;
}

export function Home() {
  const data = useLoaderData<Data>();
  return (
    <>
      <Suspense fallback={<p>Optional data pending</p>}>
        <Await
          resolve={data!.optional}
          errorElement={<p role="alert">Optional failed</p>}
        >
          {(value) =>
            typeof value === "string" ? (
              <p>{value}</p>
            ) : (
              <Suspense fallback={<p>Nested data pending</p>}>
                <Await
                  resolve={value.nested}
                  errorElement={<p role="alert">Nested failed</p>}
                >
                  {(nested) => <p>{nested}</p>}
                </Await>
              </Suspense>
            )
          }
        </Await>
      </Suspense>
      {data?.second && (
        <Suspense fallback={<p>Second data pending</p>}>
          <Await resolve={data.second}>{(value) => <p>{value}</p>}</Await>
        </Suspense>
      )}
    </>
  );
}

export function Destination() {
  return <h2>Destination ready</h2>;
}

function Root() {
  const router = useRouter();
  const revalidate = useRevalidator();
  const [count, setCount] = useState(0);
  const data = useRootData<RootData>();
  return (
    <main>
      <input aria-label="Persistent draft" />
      <button onClick={() => setCount(count + 1)}>Count {count}</button>
      <button onClick={() => router.navigate("/destination?pending=1#scope")}>
        Navigate
      </button>
      <button onClick={() => router.navigate("/")}>Return</button>
      <button onClick={() => revalidate({ route: "root" })}>
        Refresh root
      </button>
      {data?.optional && (
        <Suspense fallback={<p>Root data pending</p>}>
          <Await resolve={data.optional}>{(value) => <p>{value}</p>}</Await>
        </Suspense>
      )}
      <Outlet />
    </main>
  );
}

export const root = {
  default: Root,
  loaderPath: "/root-data",
  Layout: ({ children }: LayoutProps) => (
    <Document>
      <head>
        <title>Ownership fixture</title>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </Document>
  ),
};
