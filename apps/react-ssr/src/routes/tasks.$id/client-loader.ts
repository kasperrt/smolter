import type { ClientLoaderArgs } from "smolter/client";
import type { loader } from "./loader";

export async function clientLoader({
  serverLoader,
}: ClientLoaderArgs<typeof loader>) {
  return await serverLoader();
}
