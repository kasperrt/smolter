/**
 * React components and typed data hooks. Import from smolter/react.
 * @module
 */

import type { Fetcher, SubmitOptions } from "@smolter/core";
import { internalURL } from "@smolter/core";
import { useRouter } from "./context.ts";
import type { FormHTMLAttributes, ReactNode } from "./runtime.ts";
import { createElement } from "./runtime.ts";

/** Form attributes with GET loader requests or POST, PUT, PATCH, and DELETE actions. */
export interface FormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method"> {
  action?: string;
  method?: "get" | "post" | "put" | "patch" | "delete";
}

type FormSubmitEvent = Parameters<NonNullable<FormProps["onSubmit"]>>[0];

type NativeSubmitEvent = FormSubmitEvent & { nativeEvent?: SubmitEvent };
interface InternalFormProps extends FormProps {
  fetcher?: Fetcher;
}

/** Submit form data to a registered route without a document reload. */
export function Form({
  action,
  method = "post",
  fetcher,
  onSubmit,
  ...props
}: InternalFormProps): ReactNode {
  const router = useRouter();
  const submit = (event: FormSubmitEvent) => {
    onSubmit?.(event);

    if (event.defaultPrevented) return;

    const submitter = (
      ((event as NativeSubmitEvent).nativeEvent ?? event) as SubmitEvent
    ).submitter as HTMLButtonElement | null;
    const target = internalURL(
      router.getSnapshot().url,
      submitter?.getAttribute("formaction") ??
        action ??
        router.getSnapshot().url,
    );

    if (!target) return;
    event.preventDefault();

    const data = new FormData(event.currentTarget, submitter);
    const verb = (
      submitter?.getAttribute("formmethod") ?? method
    ).toUpperCase();

    if (verb === "GET") {
      const search = new URLSearchParams();

      for (const [key, value] of data)
        search.append(key, typeof value === "string" ? value : value.name);

      target.search = String(search);

      void (fetcher ? fetcher.load : router.navigate)(target.href);

      return;
    }

    const options: SubmitOptions = {
      method: verb as SubmitOptions["method"],
    };

    void (fetcher ?? router).submit(target.href, data, options);
  };

  return createElement("form", {
    ...props,
    action,
    method: method === "get" ? "get" : "post",
    onSubmit: submit,
  });
}
