import type { ClientLoaderArgs } from "@kasperrt/smolter/preact/client";
import type { loader } from "./loader";

export async function clientLoader({
  serverLoader,
}: ClientLoaderArgs<typeof loader>) {
  return await serverLoader();
}
