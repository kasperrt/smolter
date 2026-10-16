import { store } from "./store";
export async function loader() {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return { count: store.count, reads: ++store.reads };
}
export type LoaderData = Awaited<ReturnType<typeof loader>>;
