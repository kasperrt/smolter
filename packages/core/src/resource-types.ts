export type Params = Readonly<Record<string, string>>;

/** Resource parameters and cancellation signal supplied to a loader. */
export interface LoaderFunctionArgs {
  params: Params;
  signal: AbortSignal;
}

/** Submitted input, resource parameters and cancellation signal supplied to an action. */
export interface ActionFunctionArgs<Input = unknown> {
  input: Input;
  params: Params;
  signal: AbortSignal;
}

/** Successful resource data or a normalized resource failure. */
export interface DataResult<Data> {
  data: Data | null;
  error: string;
  unexpected?: true;
}

export interface ResourceModule {
  action?: (args: ActionFunctionArgs) => Promise<DataResult<unknown>>;
  loader?: (args: LoaderFunctionArgs) => Promise<DataResult<unknown>>;
  shouldRevalidate?: (args: ShouldRevalidateFunctionArgs) => boolean;
}

/** Navigation or mutation context used to decide whether loader data should refresh. */
export interface ShouldRevalidateFunctionArgs {
  actionResult: DataResult<unknown>;
  defaultShouldRevalidate: boolean;
  params: Params;
}

export type NavigationState = "idle" | "loading" | "submitting";

export interface RouteState {
  actionData: unknown;
  actionError: string;
  actionState: "idle" | "submitting";
  loaderData: unknown;
  loaderError: string;
  loaderInitialized: boolean;
  loaderState: "idle" | "loading";
  navigationState: NavigationState;
  unexpectedError: boolean;
}
