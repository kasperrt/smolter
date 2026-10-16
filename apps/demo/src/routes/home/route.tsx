import { useFetcher, useLoaderData, useRevalidator } from "smolter";
import { Button } from "../../components/button";
import type { action } from "./action";
import type { loader } from "./loader";

export { action } from "./action";
export { ErrorBoundary } from "./components/error-boundary";
export { HydrateFallback } from "./components/hydrate-fallback";
export { loader } from "./loader";
export default function Home() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidate = useRevalidator();
  return (
    <section className="playground">
      <div className="section-heading">
        <span className="eyebrow">01 / LIVE PLAYGROUND</span>
        <span className="pill">React adapter</span>
      </div>
      <div className="counter-row">
        <div>
          <h2>
            A tiny form.
            <br />A complete data flow.
          </h2>
          <p>
            Submit an action. Refresh the loader.
            <br />
            Keep your place on the page.
          </p>
        </div>
        <div className="counter">
          <span data-testid="count">{data?.count ?? 0}</span>
          <small>THINGS COUNTED</small>
        </div>
      </div>
      <fetcher.Form>
        <Button
          type="submit"
          name="intent"
          value="increment"
          disabled={fetcher.state !== "idle"}
        >
          {fetcher.state === "idle" ? "Add one ↗" : "Saving…"}
        </Button>
        <Button
          className="secondary"
          type="submit"
          name="intent"
          value="reset"
          disabled={fetcher.state !== "idle"}
        >
          Reset
        </Button>
      </fetcher.Form>
      <div className="status">
        <span className="status-dot" />
        <span role="status">
          {fetcher.data?.message ?? "Ready when you are."}
        </span>
        <span className="reads">Loader runs: {data?.reads ?? 0}</span>
      </div>
      <Button className="text-button" onClick={() => void revalidate()}>
        Revalidate manually ↻
      </Button>
    </section>
  );
}
