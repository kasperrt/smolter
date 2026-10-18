/**
 * Preact components and typed data hooks. Import from @kasperrt/smolter/preact.
 * @module
 */

import { type Fetcher, type Router } from "@smolter/core";
import { type RouteFormOptions, submitForm } from "@smolter/core/submission";
import { useRouter } from "./context.ts";

import {
  createElement,
  type FormHTMLAttributes,
  type ReactNode,
} from "./runtime.ts";

/** Form attributes with GET loader requests or POST, PUT, PATCH, and DELETE actions. */
export interface FormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method">,
    RouteFormOptions {}

type FormSubmitEvent = Parameters<NonNullable<FormProps["onSubmit"]>>[0];

interface InternalFormProps extends FormProps {
  fetcher?: Fetcher;
}

/** Submit form data to a registered route without a document reload. */
export function Form(options: InternalFormProps): ReactNode {
  const {
    action,
    method,
    fetcher,
    onSubmit,
    reloadDocument,
    preventScrollReset,
    replace,
    ...props
  } = options;
  const router = useRouter<Router>();
  const submit = (event: FormSubmitEvent) => {
    onSubmit?.(event);
    submitForm(
      router,
      event,
      (event as SubmitEvent).submitter,
      options,
      fetcher,
    );
  };
  return createElement("form", {
    ...props,
    action,
    method: method === "get" ? "get" : "post",
    onSubmit: submit,
  });
}
