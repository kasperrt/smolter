/** @jsxImportSource preact */
import {
  Await,
  Outlet,
  useFetcher,
  useLoaderData,
  useRouter,
} from "@kasperrt/smolter/preact";
import { Document, Scripts } from "@kasperrt/smolter/preact/document";
import type { ComponentChildren } from "preact";
import { Suspense } from "preact/compat";
import { useEffect, useState } from "preact/hooks";

interface HomeData {
  mode: string;
  strategy: "stream" | "request";
  stats?: Promise<number>;
}

function RequestedStats({ mode }: { mode: string }) {
  const [value, setValue] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setValue(null);
    setFailed(false);

    void fetch(`/stats?mode=${encodeURIComponent(mode)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Statistics unavailable");
        const result: unknown = await response.json();
        if (typeof result !== "number" || !Number.isFinite(result))
          throw new Error("Invalid statistics");
        if (current) setValue(result);
      })
      .catch(() => {
        if (current) setFailed(true);
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [mode, attempt]);

  if (failed)
    return (
      <p>
        Statistics unavailable{" "}
        <button onClick={() => setAttempt(attempt + 1)}>
          Retry statistics
        </button>
      </p>
    );

  return <p>{value === null ? "Statistics pending" : `Total ${value}`}</p>;
}

export function OptionalHome() {
  const data = useLoaderData<HomeData>()!;

  return (
    <>
      <h1>Find a room</h1>
      <a href="/destination">Featured room</a>
      <section aria-label="Statistics" style={{ minHeight: "4rem" }}>
        {data.strategy === "stream" ? (
          <Suspense fallback={<p>Statistics pending</p>}>
            <Await
              resolve={data.stats!}
              errorElement={<p>Statistics unavailable</p>}
            >
              {(value) => <p>Total {value}</p>}
            </Await>
          </Suspense>
        ) : (
          <RequestedStats key={data.mode} mode={data.mode} />
        )}
      </section>
    </>
  );
}

export function OptionalDestination() {
  return <h1>Destination ready</h1>;
}

function Shell() {
  const router = useRouter();
  const [settings, setSettings] = useState(false);
  const fetcher = useFetcher<number>();

  return (
    <main>
      <button onClick={() => setSettings(!settings)}>Settings</button>
      <button onClick={() => router.navigate("/destination?pending=1#scope")}>
        Navigate
      </button>
      <button onClick={() => router.navigate("/?mode=watch")}>Watch</button>
      {settings && (
        <fetcher.Form action="/profile" method="post">
          <input name="name" aria-label="Profile name" />
          <button>Save profile</button>
          {fetcher.data && <output>Profile saved</output>}
        </fetcher.Form>
      )}
      <Outlet />
    </main>
  );
}

export const optionalRoot = {
  default: Shell,
  Layout: ({ children }: { children?: ComponentChildren }) => (
    <Document>
      <head>
        <title>Optional data experiment</title>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </Document>
  ),
};
