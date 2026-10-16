import type { DataArgs } from "@kasperrt/smolter/react";
import { readDoc } from "@smolter/ui/docs";

export function loader({ params }: DataArgs) {
  return readDoc(params.page);
}
