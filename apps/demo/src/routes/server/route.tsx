import { useLoaderData, useRevalidator } from "smolter";
import { Button } from "../../components/button";
import type { loader } from "./loader";

export { HydrateFallback } from "../home/components/hydrate-fallback";
export { loader } from "./loader";
export default function ServerPage() {
  const data = useLoaderData<typeof loader>();
  const revalidate = useRevalidator();
  return (
    <main>
      <h1>{data?.message}</h1>
      <p>
        Hydrated without fetching again. Loader runs:{" "}
        <span data-testid="runs">{data?.runs}</span>
      </p>
      <Button onClick={() => void revalidate()}>Revalidate</Button>
      <p>
        <a href="/">← Playground</a>
      </p>
    </main>
  );
}
