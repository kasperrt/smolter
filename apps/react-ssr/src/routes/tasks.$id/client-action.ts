import type { ClientActionArgs } from "@kasperrt/smolter/react/client";
import type { action } from "./action";

export async function clientAction({
  serverAction,
}: ClientActionArgs<typeof action>) {
  return await serverAction();
}
