import { useFetcher, useLoaderData, useRevalidator } from "smolter";
import { Button } from "../../components/button";
import type { clientAction } from "./action";
import type { clientLoader } from "./loader";

export { clientAction } from "./action";
export { ErrorBoundary } from "./components/error-boundary";
export { HydrateFallback } from "./components/hydrate-fallback";
export { clientLoader } from "./loader";
export default function Home() {
  const data = useLoaderData<typeof clientLoader>();
  const fetcher = useFetcher<typeof clientAction>();
  const revalidate = useRevalidator();
  return (
    <section className="playground">
      <div className="window-bar">
        <span>counter.demo</span>
        <span className="live-indicator">Live</span>
      </div>
      <div className="counter-body">
        <div className="counter-label">
          <h2>Counter</h2>
          <span className="pill">{fetcher.state}</span>
        </div>
        <div className="counter">
          <span data-testid="count">{data?.count ?? 0}</span>
        </div>
        <fetcher.Form>
          <Button
            type="submit"
            name="intent"
            value="increment"
            disabled={fetcher.state !== "idle"}
            aria-busy={fetcher.state !== "idle"}
          >
            Add one +
          </Button>
          <Button
            className="secondary"
            type="submit"
            name="intent"
            value="reset"
            disabled={fetcher.state !== "idle"}
            aria-busy={fetcher.state !== "idle"}
          >
            Reset
          </Button>
        </fetcher.Form>
        <div className="status">
          <span role="status">
            {fetcher.data?.message ?? "POST /api/counter → GET /api/counter"}
          </span>
        </div>
      </div>
      <div className="demo-footer">
        <span>
          Loader runs: <strong>{data?.reads ?? 0}</strong>
        </span>
        <Button className="text-button" onClick={() => void revalidate()}>
          Revalidate ↻
        </Button>
      </div>
    </section>
  );
}
