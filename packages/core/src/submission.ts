import type {
  Fetcher,
  NavigateOptions,
  Result,
  Router,
  SubmitOptions,
} from "./types.ts";
import { internalURL } from "./url.ts";

/** Values accepted by programmatic route submissions. */
export type Submission = FormData | HTMLFormElement | Record<string, unknown>;

/** Destination and encoding for a programmatic route submission. */
export interface SubmissionOptions {
  action?: string;
  encType?: string;
  method?: string;
  replace?: boolean;
  preventScrollReset?: boolean;
}

export function formData(value: Submission): FormData {
  if (value instanceof FormData) return value;
  if (
    typeof HTMLFormElement !== "undefined" &&
    value instanceof HTMLFormElement
  )
    return new FormData(value);
  const body = new FormData();
  for (const [key, field] of Object.entries(value))
    body.append(key, String(field));
  return body;
}

export function submissionBody(value: Submission, encoding?: string): FormData {
  return formData(
    encoding === "application/json"
      ? { _payload: JSON.stringify(value) }
      : value,
  );
}

/** Encode successful form controls for a GET route request. */
export function submissionSearch(body: FormData): string {
  const search = new URLSearchParams();
  for (const [key, value] of body)
    search.append(key, typeof value === "string" ? value : value.name);
  return String(search);
}

/** Read the JSON payload of a programmatic submission. */
export async function readSubmission(request: Request): Promise<unknown> {
  if (request.headers.get("Content-Type")?.includes("application/json"))
    return request.json();
  const body = await request.formData();
  return JSON.parse(String(body.get("_payload") ?? "{}"));
}

/** Browser form behavior shared by the React and Preact adapters. */
export interface RouteFormOptions extends NavigateOptions {
  action?: string;
  method?: "get" | "post" | "put" | "patch" | "delete";
  reloadDocument?: boolean;
}

export interface FormSubmissionEvent {
  currentTarget: HTMLFormElement;
  defaultPrevented: boolean;
  preventDefault: () => void;
}

/** Submit an internal form while leaving external actions to the browser. */
export function submitForm(
  router: Router,
  event: FormSubmissionEvent,
  submitter: HTMLElement | null,
  options: RouteFormOptions,
  fetcher?: Fetcher,
): void {
  if (event.defaultPrevented || options.reloadDocument) return;
  const target = internalURL(
    router.getSnapshot().url,
    submitter?.getAttribute("formaction") ?? options.action,
  );
  if (!target) return;
  const data = new FormData(event.currentTarget, submitter);
  const method = submitter?.getAttribute("formmethod") ?? options.method;
  event.preventDefault();
  void submitValue(
    router,
    data,
    { ...options, encType: undefined, action: target.href, method },
    fetcher,
  );
}

// Share GET encoding and action dispatch across forms, page hooks and fetchers.
export function submitValue(
  router: Router,
  value: Submission,
  options: SubmissionOptions | undefined,
  fetcher: Fetcher,
  fallback?: string,
): Promise<Result>;
export function submitValue(
  router: Router,
  value: Submission,
  options?: SubmissionOptions,
  fetcher?: Fetcher,
): Promise<void> | Promise<Result>;
export function submitValue(
  router: Router,
  value: Submission,
  options: SubmissionOptions = {},
  fetcher?: Fetcher,
  fallback?: string,
): Promise<void> | Promise<Result> {
  const body = submissionBody(value, options.encType);
  const method = options.method?.toUpperCase();
  const action = options.action ?? fallback ?? router.getSnapshot().url;
  if (method === "GET") {
    const url = new URL(action, router.getSnapshot().url);
    url.search = submissionSearch(body);
    return fetcher
      ? fetcher.load(url.href)
      : router.navigate(url.href, options);
  }
  return (fetcher ?? router).submit(action, body, {
    method: method as SubmitOptions["method"],
  });
}
