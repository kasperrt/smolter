import {
  defineRoute,
  type FormProps,
  type LinkProps,
  useActionData,
  useFetcher,
  useLoaderData,
} from "smolter/react";

const route = defineRoute("/tasks/:id", {
  loader: () => ({ count: 1 }),
  action: () => ({ saved: true }),
});

export function Page() {
  const data = useLoaderData(route);
  const action = useActionData(route);
  const fetcher = useFetcher(route);
  const count: number | undefined = data?.count;
  const saved: boolean | undefined = action?.saved;

  if (fetcher.data && "count" in fetcher.data) {
    const fetchedCount: number = fetcher.data.count;
    void fetchedCount;
  }

  void count;
  void saved;

  return null;
}

export const form: FormProps = { action: "/tasks/42", method: "patch" };
export const link: LinkProps = { href: "/tasks/42", replace: true };
