# 0.4.2 correctness investigation — release blocked

No 0.4.2 version bump, merge or publication is authorized by passing only the recovery tests. The production ownership regression remains red with published Preact 11.0.1 and preact-render-to-string 6.8.1. Vibes was not changed.

## Reproduced defects

### Abandoned hydration range

A production-minified whole-document fixture hydrates a persistent root containing a button, input and Outlet. The initial route returns a nested pending promise and renders Suspense/Await without a wrapping host element. Navigation switches to a different component before settlement. After settlement and document completion, the destination and old fallback remain in main and the accessibility tree.

The same failure reproduces with only Preact hydrate, Suspense/use, useState and renderToReadableStream: no Smolter client, router, hydration payload or renderer is used. The pure server uses the standard Node stream pipeline.

Preact 11.0.1 stores suspended hydration DOM in a component's _excess field, starting at a $s marker. Its unmount path does not clear that reserved range when the component never resumed; the ordinary VNode DOM pointer can be the closing marker. The orphaned fallback is outside normal rendered child ownership.

A temporary, isolated Preact-source experiment removed the reserved range on unmount. It made both minimal reproductions pass, but failed broader settlement/ownership cases. This is diagnostic evidence, not a safe dependency patch. The copy and source aliases were removed; no patched dependency or renderer fork is included. A real upstream fix must coordinate both suspended-range unmount and streaming-island/resumed ownership, including sibling/root ranges and late settlements. No fixed published dependency was available when checked.

### Incomplete document transport

Closing the Node response after shell hydration produces Chromium net::ERR_INCOMPLETE_CHUNKED_ENCODING. The request AbortSignal fires server-side. Client document.readyState remains loading; the pending fallback remains and the intended rejection UI does not appear. readHydration currently closes pending promises on the terminal packet, DOMContentLoaded or disposal; an abruptly broken document can deliver none of those signals.

This is a distinct release blocker. A safe solution still needs a reliable transport-completion signal. No deadline, polling, repeated request, mutation replay or global cleanup observer was added. Browser automation can observe requestfailed, but that does not make it an application browser API.

### Page mutation recovery — fixed locally

With a page action pending, a newer navigation and manifest could reload the document. 0.4.1 counted fetcher submissions but only invalidated earlier checks when a page submission started. A new check during that page submission was not protected.

Page and fetcher submits now share the pending count and ownership invalidation. Every submission decrements in finally. Cleanup restores the original methods. The redundant snapshot subscription was removed. Normal navigation remains possible and later eligible recovery remains available. No API changes or new dependencies.

## Reproductions

Run pnpm build, then pnpm exec playwright test tests/browser/ownership.spec.ts. The ten production cases are intentionally ordinary failing assertions, not skipped tests or expected failures. The Preact-only case is part of that suite.

Minimal application shape:

```tsx
import { Await, Outlet, useLoaderData, useRouter } from "@kasperrt/smolter/preact";
import { Document, Scripts } from "@kasperrt/smolter/preact/document";
import { Suspense } from "preact/compat";

interface Data { optional: Promise<string> }

function Home() {
  const data = useLoaderData<Data>();
  return <Suspense fallback={<p>Optional data pending</p>}>
    <Await resolve={data!.optional}>{value => <p>{value}</p>}</Await>
  </Suspense>;
}
function Destination() { return <h2>Destination ready</h2>; }
function Root() {
  const router = useRouter();
  return <main>
    <input aria-label="Persistent draft" />
    <button onClick={() => router.navigate("/destination?pending=1#scope")}>Navigate</button>
    <Outlet />
  </main>;
}
```

Supply Document/Scripts in root.Layout. The initial server loader returns `{ optional: gate.promise }`; the destination returns `{}`. Render with earlyHydration true. Mount browser routes through serverRoute and mountApplication. Serve through createRequestHandler with dispatchRoute as handleDataRequest so /_smolter's url parameter is normalized.

Open the initial document, wait for hydration while the fallback is pending, enter input, navigate, then resolve the gate. Wait for document load. Assert the destination remains, both old fallback and old resolved content are absent, and root state/input/focus/query/hash survive. The absence assertion fails on the fallback.

For interruption, destroy the original document response after hydration instead of settling its gate. The server abort and network failure are observed, but the deferred error UI does not appear.

## Validation

- 31 deployment tests passed, including the before-fix failing page-submission regression, page/fetcher overlap, fetcher failure/abort/disposal while another remains pending, and watcher cleanup/reinstallation.
- Full coverage run passed: 100% implementation lines, 1,789/1,789. One initial concurrent run hit the existing filesystem-HMR polling timeout; subsequent full runs passed without weakening thresholds.
- Full browser rerun: 42 passed, 8 failed. All 40 pre-existing cases passed. New settlement-before-navigation and nested rejection cases passed. New navigation, return, reverse boundary order, persistent root, root revalidation, history and Preact-only cases failed on abandoned ownership; interruption failed on missing deferred rejection.
- Typechecking/lint, packed React/Preact installation and SSR, JSR dry run, all example production builds, production React/Preact SSR/data smoke checks, built-site hydration and navigation passed.
- Two old navigation cases initially failed while another command rebuilt watched files. A full rerun without concurrent builds passed both. Those transient failures are not attributed to the runtime patch.
- The isolated dependency experiment is not included in passing published-dependency claims.

## Matched sizes

Fresh baseline: release commit 70c2c9265e9f19fd58b52f50c4cf544ecd2fc55f (0.4.1), built in an isolated archive. Both builds used Node v25.9.0, Vite 8.3.4, esbuild 0.28.2, Terser 5.44.1 (three compression passes), gzip level 9 and Brotli quality 11. Raw means bundled/minified UTF-8 bytes. Frameworks are external in both measurements. The baseline matches the reported 9,034/9,314 gzip application references.

| Entry | Raw, baseline → candidate | Gzip, baseline → candidate | Brotli, baseline → candidate |
| --- | ---: | ---: | ---: |
| React routing | 2461 → 2461 | 1245 → 1245 | 1106 → 1106 |
| Preact routing | 2760 → 2760 | 1405 → 1405 | 1239 → 1239 |
| React data entry | 7255 → 7255 | 2948 → 2948 | 2659 → 2659 |
| Preact data entry | 12529 → 12529 | 4842 → 4842 | 4403 → 4403 |
| React + client | 10577 → 10598 | 4186 → 4199 | 3792 → 3807 |
| Preact + transport | 15862 → 15883 | 6033 → 6045 | 5509 → 5512 |
| Preact application | 24767 → 24788 | 9034 → 9053 | 8230 → 8246 |
| Preact lazy application | 25655 → 25676 | 9314 → 9333 | 8486 → 8509 |
| React resource API | 9300 → 9300 | 2962 → 2962 | 2654 → 2654 |
| Preact client | 15498 → 15519 | 5963 → 5980 | 5426 → 5439 |
| Preact document | 3672 → 3672 | 1604 → 1604 | 1441 → 1441 |
| Preact lazy route | 1773 → 1773 | 888 → 888 | 772 → 772 |
| wouter routing comparison | 5916 | 2854 | 2550 |
| wouter-preact routing comparison | 4432 | 2211 | 1989 |

The wouter comparison selects Router/Route/Switch/Link/useParams/useLocation; Smolter selects createRouter/defineRoute/RouterProvider/Routes/Link/useParams/useLocation. This is the routing subset comparison, not equivalence with data/SSR/recovery features. Routing and data entries are unchanged. The shared recovery correction affects both React and Preact clients, so its growth is not an unrelated React cost from the Preact reproduction. Full Preact application growth is 21 raw / 19 gzip / 16 Brotli bytes (lazy: 21 / 19 / 23). No new steady-state requests, polling or preload behavior were added.

No matched TTFB, LCP, request-count or interaction-readiness improvement is claimed. No consumer or device performance measurements were performed.

## Outstanding before release

- A safe published Preact ownership fix, followed by green production regressions; the diagnostic prototype is insufficient.
- Reliable rejection after abrupt document interruption, followed by offline/online navigation and retry validation.
- Mutation during bootstrap recovery in a demonstrably executable shell, action redirect/missing destination during streaming, and combined pending manifest + streaming history cases.
- Root/fetcher-only lazy-failure coverage must use actual supported route-module surfaces. Arbitrary dynamically imported root code is not automatically owned by the router.
- Full new offline/CDN/CSP/head-preservation combinations are not signed off by older regressions. Existing regression passes are preserved, not generalized into a complete matrix claim.

Do not publish 0.4.2 while these correctness gates are red. The package version and dependencies remain unchanged. No consumer configuration change is requested, and no workaround should be added to Vibes.
