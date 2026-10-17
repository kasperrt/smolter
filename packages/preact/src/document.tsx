/**
 * Preact document metadata, resource links and hydration scripts.
 *
 * @module
 */
/** @jsxImportSource preact */

import { applicationEnvironment } from "@smolter/core/environment";
import { scrollPositions } from "@smolter/core/navigation";
import { serializeData } from "@smolter/core/serialize";
import { createElement, Fragment } from "preact";
import type { ComponentProps } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useNavigationSnapshot } from "./navigation-state.ts";
import { useApplication } from "./root-context.ts";
import { useSnapshot } from "./route-hooks.tsx";
import type { MetaDescriptor } from "./route-types.ts";

function renderMeta(item: MetaDescriptor, index: number) {
  if (typeof item.title === "string")
    return <title key={index}>{item.title}</title>;

  if ("script:ld+json" in item)
    return (
      <script
        key={index}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeData(item["script:ld+json"]),
        }}
      />
    );

  const { tagName, ...props } = item;

  return createElement(tagName === "link" ? "link" : "meta", {
    ...props,
    key: index,
  });
}

/** Render root or active-route metadata in the document head. */
export function Meta(): import("preact").JSX.Element {
  const { routes, rootModule } = useApplication();
  const snapshot = useSnapshot();
  const route = routes.find((item) => item.path === snapshot.path);
  const args = {
    loaderData: snapshot.data,
    data: snapshot.data,
    params: snapshot.params,
    error: snapshot.error,
    location: new URL(snapshot.url),
  };
  const values = route?.meta?.(args) ?? rootModule?.meta?.(args) ?? [];
  useEffect(() => {
    const title = values.find((item) => typeof item.title === "string")?.title;

    if (typeof title === "string") document.title = title;
  }, [values]);

  return <Fragment>{values.map(renderMeta)}</Fragment>;
}

/** Render stylesheet and other link descriptors from the application root. */
export function Links(): import("preact").JSX.Element {
  const { rootModule } = useApplication();

  return (
    <Fragment>
      {rootModule?.links?.().map((props, index) => (
        <link key={index} {...props} />
      ))}
    </Fragment>
  );
}

/** Nonce and browser entry options for the document hydration scripts. */
export interface ScriptProps {
  nonce?: string;
}

/** Render the hydration snapshot and browser entry script with an optional CSP nonce. */
export function Scripts({ nonce }: ScriptProps): import("preact").JSX.Element {
  const { root, rootError, router, entry, streaming, initialData } =
    useApplication();
  // The bootstrap payload describes this document's initial SSR snapshot.
  // Navigation and revalidation update the router, not the hydration script.
  const [json] = useState(() => {
    if (initialData !== undefined) return initialData;
    if (streaming) return "";

    const current = router.getSnapshot();
    const snapshot = {
      ...current,
      error: current.error && {
        ...current.error,
        name: current.error.name,
        message: current.error.message,
      },
    };

    return serializeData({ root, snapshot, ...(rootError && { rootError }) });
  });

  return (
    <Fragment>
      <script
        {...(nonce && { nonce })}
        dangerouslySetInnerHTML={{
          __html: applicationEnvironment?.entryScript ?? "",
        }}
      />
      <script
        id="smolter-data"
        type="application/json"
        {...(nonce && { nonce })}
        dangerouslySetInnerHTML={{ __html: json }}
      />
      {entry && (
        <script
          type="module"
          async={initialData !== undefined}
          src={entry}
          {...(nonce && { nonce })}
        />
      )}
    </Fragment>
  );
}

/** Reset scroll after navigation unless the navigation requests preservation. */
export function ScrollRestoration(_props: ScriptProps): null {
  const { router } = useApplication();
  const { url, state } = useSnapshot();
  const navigation = useNavigationSnapshot(router);
  const positions = scrollPositions(router);
  const restoredLocation = useRef("");

  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";

    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    if (state !== "idle") return;

    if ((history.state?.key ?? "initial") !== navigation.key) return;

    const locationKey = `${navigation.key}:${url}`;

    if (restoredLocation.current === locationKey) return;

    // Lazy views subscribe independently; restore after their DOM is committed.
    const frame = requestAnimationFrame(() => {
      restoredLocation.current = locationKey;
      const target = new URL(location.href);
      const saved = navigation.type === "POP" && positions.get(navigation.key);

      if (!saved && target.hash) {
        document.getElementById(target.hash.slice(1))?.scrollIntoView();

        return;
      }

      if (!saved && navigation.preventScrollReset) return;

      const [left, top] = saved || [0, 0];
      window.scrollTo({ left, top, behavior: "instant" });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    url,
    state,
    positions,
    navigation.key,
    navigation.type,
    navigation.preventScrollReset,
  ]);

  return null;
}

/** HTML attributes for server markup and client document reconciliation. */
export interface DocumentProps extends ComponentProps<"html"> {
  "data-debug"?: boolean;
}

/** Render the server document and preserve client-managed theme classes on hydration. */
export function Document(props: DocumentProps): import("preact").JSX.Element {
  const { children, ...attributes } = props;
  const className = String(props.className ?? "");
  const previousClassName = useRef(className);
  const lang = String(props.lang ?? "en");
  const debug = String(props["data-debug"] ?? false);
  useEffect(() => {
    // Hydration must preserve classes already applied by the browser theme store.
    // Only reconcile classes when the document's own props actually change.
    if (previousClassName.current !== className) {
      const previous = previousClassName.current.split(/\s+/).filter(Boolean);
      const next = className.split(/\s+/).filter(Boolean);
      document.documentElement.classList.remove(...previous);
      document.documentElement.classList.add(...next);
      previousClassName.current = className;
    }

    document.documentElement.lang = lang;
    document.documentElement.dataset.debug = debug;
  }, [className, lang, debug]);

  if (typeof document === "undefined")
    return <html {...attributes}>{children}</html>;

  return <>{children}</>;
}
