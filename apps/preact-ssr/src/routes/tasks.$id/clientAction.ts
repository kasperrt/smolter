import type { ClientActionArgs } from "@kasperrt/smolter/preact/client";
import type { action } from "./action";

export async function clientAction({
  serverAction,
}: ClientActionArgs<typeof action>) {
  return await serverAction();
}
