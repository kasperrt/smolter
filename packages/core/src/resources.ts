import { safeWrapAsync } from "./errors.ts";
import type {
  DataResult,
  Params,
  ResourceModule,
  RouteState,
} from "./resource-types.ts";

const IDLE_ROUTE_STATE: RouteState = {
  actionData: null,
  actionError: "",
  actionState: "idle",
  loaderData: null,
  loaderError: "",
  loaderInitialized: false,
  loaderState: "idle",
  navigationState: "idle",
  unexpectedError: false,
};

export class ResourceRouter {
  readonly #cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #controllers = new Map<string, AbortController>();
  readonly #inFlightLoads = new Map<string, Promise<DataResult<unknown>>>();
  readonly #listeners = new Map<string, Set<() => void>>();
  readonly #persistentRoutes = new Set<string>();
  readonly #routes: ReadonlyMap<string, ResourceModule>;
  readonly #states = new Map<string, RouteState>();

  constructor(routes: ReadonlyMap<string, ResourceModule>) {
    this.#routes = routes;
  }

  dispose() {
    for (const controller of this.#controllers.values()) controller.abort();

    this.#controllers.clear();

    for (const timer of this.#cleanupTimers.values()) clearTimeout(timer);

    this.#cleanupTimers.clear();
    this.#inFlightLoads.clear();
    this.#listeners.clear();
    this.#persistentRoutes.clear();
  }

  getRoute(routeId: string): ResourceModule | null {
    return this.#routes.get(routeId) ?? null;
  }

  getSnapshot(routeId: string, params: Params): RouteState {
    return (
      this.#states.get(createRouteKey(routeId, params)) ?? IDLE_ROUTE_STATE
    );
  }

  hydrateRoute<Data>(routeId: string, data: Data, params: Params = {}) {
    const routeKey = createRouteKey(routeId, params);
    const currentState = this.#states.get(routeKey) ?? IDLE_ROUTE_STATE;
    this.#setState(routeKey, {
      ...currentState,
      loaderData: data,
      loaderError: "",
      loaderInitialized: true,
      loaderState: "idle",
      navigationState:
        currentState.actionState === "submitting" ? "submitting" : "idle",
      unexpectedError: false,
    });
  }

  persist(routeId: string, params: Params = {}) {
    const routeKey = createRouteKey(routeId, params);
    this.#persistentRoutes.add(routeKey);
    const cleanupTimer = this.#cleanupTimers.get(routeKey);

    if (!cleanupTimer) return;

    clearTimeout(cleanupTimer);
    this.#cleanupTimers.delete(routeKey);
  }

  disposeRoute(routeId: string, params: Params = {}) {
    this.#disposeRouteKey(createRouteKey(routeId, params));
  }

  #disposeRouteKey(routeKey: string) {
    this.#persistentRoutes.delete(routeKey);
    const cleanupTimer = this.#cleanupTimers.get(routeKey);

    if (cleanupTimer) clearTimeout(cleanupTimer);

    this.#cleanupTimers.delete(routeKey);
    this.#controllers.get(routeKey)?.abort();
    this.#controllers.get(`${routeKey}:action`)?.abort();
    this.#controllers.delete(routeKey);
    this.#controllers.delete(`${routeKey}:action`);
    this.#inFlightLoads.delete(routeKey);
    this.#states.delete(routeKey);
    this.#notify(routeKey);
  }

  load<Data>(
    routeId: string,
    params: Params = {},
    force = false,
  ): Promise<DataResult<Data>> {
    const routeKey = createRouteKey(routeId, params);
    const route = this.#routes.get(routeId);

    if (!route?.loader) {
      return Promise.resolve<DataResult<Data>>({
        data: null,
        error: "Route loader not found.",
      });
    }

    const currentState = this.#states.get(routeKey);

    if (!force && currentState?.loaderInitialized) {
      return Promise.resolve({
        data: currentState?.loaderData as Data,
        error: currentState?.loaderError ?? "",
      });
    }

    const currentLoad = this.#inFlightLoads.get(routeKey);

    if (force && currentLoad) {
      this.#controllers.get(routeKey)?.abort();
      this.#inFlightLoads.delete(routeKey);
    }

    if (!force && currentLoad) return currentLoad as Promise<DataResult<Data>>;

    const controller = this.#replaceController(routeKey);
    this.#setState(routeKey, {
      ...(currentState ?? IDLE_ROUTE_STATE),
      loaderError: "",
      loaderState: "loading",
      navigationState:
        currentState?.actionState === "submitting" ? "submitting" : "loading",
      unexpectedError: false,
    });
    const load = this.#runLoader(route, routeKey, params, controller);
    this.#inFlightLoads.set(routeKey, load);

    return load as Promise<DataResult<Data>>;
  }

  subscribe(routeId: string, params: Params, listener: () => void): () => void {
    const routeKey = createRouteKey(routeId, params);
    const cleanupTimer = this.#cleanupTimers.get(routeKey);

    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      this.#cleanupTimers.delete(routeKey);
    }

    const listeners = this.#listeners.get(routeKey) ?? new Set<() => void>();
    listeners.add(listener);
    this.#listeners.set(routeKey, listeners);

    return () => {
      if (!listeners.delete(listener) || listeners.size > 0) return;

      this.#listeners.delete(routeKey);

      if (this.#persistentRoutes.has(routeKey)) return;

      const timer = setTimeout(
        () => this.#disposeRouteKey(routeKey),
        routeCleanupGraceMs,
      );
      this.#cleanupTimers.set(routeKey, timer);
    };
  }

  async submit<Data>(
    routeId: string,
    input: unknown,
    params: Params = {},
  ): Promise<DataResult<Data>> {
    const routeKey = createRouteKey(routeId, params);
    const route = this.#routes.get(routeId);

    if (!route?.action) {
      return { data: null, error: "Route action not found." };
    }

    const controllerKey = `${routeKey}:action`;
    const controller = this.#replaceController(controllerKey);
    const currentState = this.#states.get(routeKey) ?? IDLE_ROUTE_STATE;
    this.#setState(routeKey, {
      ...currentState,
      actionError: "",
      actionState: "submitting",
      navigationState: "submitting",
      unexpectedError: false,
    });
    const { error, data: result } = await safeWrapAsync(() =>
      route.action?.({ input, params, signal: controller.signal }),
    );

    if (this.#controllers.get(controllerKey) === controller) {
      this.#controllers.delete(controllerKey);
    }

    if (controller.signal.aborted) return { data: null, error: "" };

    const latestState = this.#states.get(routeKey) ?? IDLE_ROUTE_STATE;

    if (error || !result) {
      const publicError = "The request could not be completed.";
      this.#setState(routeKey, {
        ...latestState,
        actionData: null,
        actionError: publicError,
        actionState: "idle",
        navigationState:
          latestState.loaderState === "loading" ? "loading" : "idle",
        unexpectedError: true,
      });

      return { data: null, error: publicError, unexpected: true };
    }

    this.#setState(routeKey, {
      ...latestState,
      actionData: result.data,
      actionError: result.error,
      actionState: "idle",
      navigationState:
        latestState.loaderState === "loading" ? "loading" : "idle",
      unexpectedError: false,
    });
    const actionResult = {
      data: result.data as Data | null,
      error: result.error,
    };
    const { error: revalidationError, data: shouldRevalidate } =
      await safeWrapAsync(
        () =>
          route.shouldRevalidate?.({
            actionResult: result,
            defaultShouldRevalidate: Boolean(route.loader),
            params,
          }) ?? Boolean(route.loader),
      );

    if (revalidationError) {
      const publicError = "The request could not be completed.";
      this.#setState(routeKey, {
        ...(this.#states.get(routeKey) ?? IDLE_ROUTE_STATE),
        actionError: publicError,
        actionState: "idle",
        unexpectedError: true,
      });

      return { data: null, error: publicError, unexpected: true };
    }

    if (shouldRevalidate) await this.load(routeId, params, true);

    return actionResult;
  }

  async fetchLoader<Data>(
    routeId: string,
    params: Params,
    signal: AbortSignal,
  ): Promise<DataResult<Data>> {
    const route = this.#routes.get(routeId);

    if (!route?.loader) {
      return { data: null, error: "Route loader not found." };
    }

    const { error, data: result } = await safeWrapAsync(() =>
      route.loader?.({ params, signal }),
    );

    if (signal.aborted) return { data: null, error: "" };

    if (error || !result) {
      return {
        data: null,
        error: "The route could not be loaded.",
        unexpected: true,
      };
    }

    return result as DataResult<Data>;
  }

  async fetchAction<Data>(
    routeId: string,
    input: unknown,
    params: Params,
    signal: AbortSignal,
  ): Promise<DataResult<Data>> {
    const route = this.#routes.get(routeId);

    if (!route?.action) {
      return { data: null, error: "Route action not found." };
    }

    const { error, data: result } = await safeWrapAsync(() =>
      route.action?.({ input, params, signal }),
    );

    if (signal.aborted) return { data: null, error: "" };

    if (error || !result) {
      return {
        data: null,
        error: "The request could not be completed.",
        unexpected: true,
      };
    }

    const { error: revalidationError, data: shouldRevalidate } =
      await safeWrapAsync(
        () =>
          route.shouldRevalidate?.({
            actionResult: result,
            defaultShouldRevalidate: Boolean(route.loader),
            params,
          }) ?? Boolean(route.loader),
      );

    if (signal.aborted) return { data: null, error: "" };

    if (revalidationError) {
      return {
        data: null,
        error: "The request could not be completed.",
        unexpected: true,
      };
    }

    if (shouldRevalidate) await this.load(routeId, params, true);

    return result as DataResult<Data>;
  }

  retry(routeId: string, params: Params): Promise<DataResult<unknown>> {
    const routeKey = createRouteKey(routeId, params);
    this.#states.set(routeKey, IDLE_ROUTE_STATE);
    this.#notify(routeKey);

    return this.load(routeId, params, true);
  }

  reportUnexpected(routeId: string, params: Params) {
    const routeKey = createRouteKey(routeId, params);
    const currentState = this.#states.get(routeKey) ?? IDLE_ROUTE_STATE;
    this.#setState(routeKey, { ...currentState, unexpectedError: true });
  }

  async #runLoader(
    route: ResourceModule,
    routeKey: string,
    params: Params,
    controller: AbortController,
  ): Promise<DataResult<unknown>> {
    const { error, data: result } = await safeWrapAsync(
      () =>
        route.loader?.({ params, signal: controller.signal }) ??
        Promise.resolve({ data: null, error: "" }),
    );

    if (this.#controllers.get(routeKey) === controller) {
      this.#controllers.delete(routeKey);
      this.#inFlightLoads.delete(routeKey);
    }

    if (controller.signal.aborted) return { data: null, error: "" };

    if (error || !result) {
      const publicError = "The route could not be loaded.";
      this.#setState(routeKey, {
        actionData: null,
        actionError: "",
        actionState: "idle",
        loaderData: null,
        loaderError: publicError,
        loaderInitialized: true,
        loaderState: "idle",
        navigationState: "idle",
        unexpectedError: true,
      });

      return { data: null, error: publicError, unexpected: true };
    }

    const currentState = this.#states.get(routeKey) ?? IDLE_ROUTE_STATE;
    this.#setState(routeKey, {
      ...currentState,
      loaderData: result.data,
      loaderError: result.error,
      loaderInitialized: true,
      loaderState: "idle",
      navigationState:
        currentState.actionState === "submitting" ? "submitting" : "idle",
      unexpectedError: false,
    });

    return result;
  }

  #replaceController(key: string) {
    this.#controllers.get(key)?.abort();
    const controller = new AbortController();
    this.#controllers.set(key, controller);

    return controller;
  }

  #setState(routeKey: string, state: RouteState) {
    this.#states.set(routeKey, state);
    this.#notify(routeKey);
  }

  #notify(routeKey: string) {
    for (const listener of this.#listeners.get(routeKey) ?? []) listener();
  }
}

export function createResourceRouter(
  routes: ReadonlyMap<string, ResourceModule>,
): ResourceRouter {
  return new ResourceRouter(routes);
}

function createRouteKey(routeId: string, params: Params) {
  const normalizedParams = Object.entries(params).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `${routeId}:${JSON.stringify(normalizedParams)}`;
}

const routeCleanupGraceMs = 100;
