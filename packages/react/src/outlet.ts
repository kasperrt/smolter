import { useRouter, useSnapshot } from "./context.ts";
import { Routes } from "./routes.ts";
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
} from "./runtime.ts";

const OutletContext = createContext<unknown>(undefined);

/** Optional children and context shared with descendants through useOutletContext. */
export interface OutletProps {
  context?: unknown;
  children?: ReactNode;
}

/** Render the active route under a layout's shared context. */
export function Outlet({ context, children }: OutletProps): ReactNode {
  const inherited = useContext(OutletContext);
  return createElement(
    OutletContext.Provider,
    { value: context ?? inherited },
    children ??
      createElement(Routes, {
        fallback: createElement("p", { role: "status" }, "Loading…"),
      }),
  );
}

/** Read the nearest Outlet's context. */
export function useOutletContext<T>(): T {
  return useContext(OutletContext) as T;
}

/** Read the active flat route match; this is not a nested layout match chain. */
export function useMatches(): {
  id: string;
  data: unknown;
  params: import("@smolter/core").Params;
}[] {
  const router = useRouter();
  const snapshot = useSnapshot();
  const route = router.routes.find((item) => item.path === snapshot.path);
  return [
    { id: route?.id ?? "", data: snapshot.data, params: snapshot.params },
  ];
}
