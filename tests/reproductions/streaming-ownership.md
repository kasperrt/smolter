# 0.4.2 supported boundary contract

The release uses the existing `Await` export with an explicit `fallback` prop. All thirteen Smolter ownership scenarios remain blocking production-browser assertions in `tests/browser/owned-deferred.spec.ts`, using the unchanged shared assertion harness. The native Preact variant is preserved, not repaired: run `pnpm exec playwright test --config tests/reproductions/playwright.config.ts` to reproduce it. That diagnostic is not a release claim about Smolter's component-owned path.

Early-hydration consumers must replace `<Suspense fallback={pending}><Await resolve={value}>…</Await></Suspense>` with `<Await resolve={value} fallback={pending}>…</Await>`, including persistent root sections. This is an additive API with a required markup migration for the corrected early-hydration contract. No changes to Preact, renderer hooks, dependency patches, application wrappers, extra DOM containers, polling, or external PRs are part of the release.

A route DOM containment experiment was discarded: it removed route residue but did not fix native root revalidation, and would have changed document structure. Native Suspense diagnostics remain useful upstream evidence, not a dependency for this release. Earlier sections below record investigation history; statements that the native matrix blocked release describe the earlier plan superseded by the integrated ownership solution.

> Latest alternative: the integrated `Await fallback` path now passes on published Preact without upstream changes. The native Suspense reproduction remains failing. See the final section; previous upstream-PR plans below are historical and are not the implementation plan.

> Current status: no 0.4.2 release. The follow-up section below supersedes the initial interruption/candidate findings. Upstream fix: https://github.com/preactjs/preact/pull/5314. Earlier measurements and failures below are retained as historical evidence; current sizes are in streaming-sizes.json.

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


## Follow-up: bounded interruption handling and upstream candidate

The unpublished Smolter candidate now supports `mountApplication(routes, root, { deferredTimeout: 30000 })`. The default is 30 seconds from reading initial deferred hydration data; accepted values are 1 through 2147483647 milliseconds. This is a single bounded deadline, not polling or immediate network-disconnect detection. Resolved hydration schedules no timer. Terminal completion and disposal clear it. Expiry rejects outstanding deferred values without retrying requests or mutations. Slow legitimate data needs an explicitly larger budget.

An abruptly terminated Chromium document can remain `loading` without DOMContentLoaded or a useful terminal event. The production interruption fixture verifies the transport actually aborts and uses Playwright's controlled clock to expire the deadline. It no longer incorrectly waits for a successful document load after deliberately breaking the response.

The Preact candidate now retains the balanced opening/closing marker range on its owning component and retires it on unmount. Re-suspension also preserves the closing insertion cursor so newly inserted siblings are not accidentally placed inside the pending range. A previous source-alias diagnostic mixed unmangled source fields with published renderer field names; its broader failures were not a valid evaluation of this candidate. The current experiment uses Preact's official built/minified output.

Three Preact-only tests fail against unchanged 11.0.1 (40 existing tests pass), and all 43 pass with the candidate. The full minified upstream suite passes 1402 tests across 107 files, with 11 existing skips; lint and JavaScript typechecking pass. All ten Smolter production ownership fixtures pass using the isolated candidate. This is not a released dependency: the diagnostic alias has been removed from Smolter, and the published-dependency ownership failures remain a release gate.

Smolter lint, typechecking, packed React/Preact installation/SSR, JSR dry-run and 100% implementation line coverage (1796/1796) pass. The size JSON records a remeasurement of the candidate with the same toolchain/settings as the previously rebuilt 0.4.1 baseline. It excludes framework peers. Complete application growth versus 0.4.1 is +279 raw / +124 gzip / +118 Brotli bytes; lazy application growth is +279 / +123 / +116. Routing/data entries remain unchanged. No speed superiority is established.

No Vibes edits, renderer patch, new runtime dependency, polling, mutation retry, release or change to JSR-before-npm ordering is included. Upstream merge/publication and a clean dependency-based full regression run are required before 0.4.2 can be published.


## Consumer acceptance follow-up

Release remains blocked. Registry checks still report Preact 11.0.1 and preact-render-to-string 6.8.1; upstream PR 5314 is open. Do not invent a fixed version or raise the supported floor to an unpublished version. Before publishing, update the actual npm/JSR-facing dependency metadata to exclude known-broken combinations, test strict peer installation rejection of the old combination, and run the entire production matrix on a clean registry-backed installation of the minimum supported versions. The final complete bundle measurement must include that published Preact change. Current complete measurements include the known-broken published runtime, not the proposed upstream fix.

Timeout policy is now explicit: a total budget beginning at initial payload revival, never reset by packets, not an inactivity timeout or reliable disconnect detector. Only integer milliseconds from 1 through 2147483647 are accepted. Eight focused tests cover shared references, multiple outstanding values, preservation of already-settled values, ignored late packets, removal of completion listeners and disposal of the timer. Both controlled-clock and real-time production interruption cases pass; the latter uses an actual two-second timer, reaches error UI, then navigates successfully with persistent state and without page errors.

A new watcher-replacement regression failed before the fix: installing a newer watcher before old cleanup left navigation delegated to a stopped wrapper. A weak per-router ownership record now retires the old watcher before wrapping original methods, keeps pending mutation accounting across replacement, and makes stale cleanup idempotent. All 33 deployment tests pass, including retained mutation protection, successful ordinary navigation, a later eligible recovery, marker counts and no mutation replay. This shared recovery fix affects both client adapters, not unrelated routing/data entries.

The production ownership matrix now has 14 cases, adding root-first settlement, repeated navigation, rejection after navigation, and real-time interruption. Assertions retain destination visibility and reject abandoned fallback/resolved content, with persistent controls, input and focus checks. The published-dependency failures remain ordinary blocking assertions. The prior ten-case upstream-candidate result is historical; the expanded matrix is not signed off against a published fixed runtime.

Current measurements use registry Smolter 0.4.1 as baseline with identical toolchain/compression settings. Framework-external complete application: 24767/9034/8230 -> 25297/9237/8421 raw/gzip/Brotli (+530/+203/+191). Including published Preact: 42548/16046/14602 -> 43078/16253/14741 (+530/+207/+139). These are bundled export inventories, not a Vibes initial-route measurement. The increase includes the additional watcher replacement fix and integer timeout validation. Routing/data entries are unchanged. Keep the wouter export-subset comparison separate from release acceptance. No speed claim follows from these bytes.

The optional-loading experiment remains a fixture-only investigation. No deferred support was removed, no measurement-only reader was shipped, and no Vibes modifications were made. Publication still requires clean minimum-version ownership/recovery checks, full CI, packed checks, JSR-before-npm publication and verification of both registries.


Validation of this follow-up: published-runtime ownership matrix 4 pass / 10 fail (blocking); eight deferred-hydration tests and 33 recovery tests pass; lint/typecheck, packed SSR, JSR dry-run and 100% line coverage (1802/1802) pass. The first broader browser run overlapped ownership teardown and lost its shared example servers (connection refused); this was a harness collision, not a rendering assertion. The isolated-port rerun passed all 46 remaining correctness/browser checks. Performance sampling was deliberately excluded from the correctness rerun; no new timing claim is made.


## Integrated fallback alternative on published Preact

The solution stays inside Smolter and its existing `@kasperrt/smolter/preact` entrypoint. There is no new public subpath, dependency patch, renderer fork or external PR requirement.

```tsx
import { Await } from "@kasperrt/smolter/preact";

<Await resolve={data.optional}
  fallback={<p>Optional data pending</p>}
  errorElement={<p>Optional data unavailable</p>}>
  {(value) => <p>{value}</p>}
</Await>
```

For early hydration, replace the surrounding native Suspense with this explicit fallback on each deferred field, including persistent root fields. The server renders ordinary fallback HTML. Existing deferred packets resolve the same promises, and a mounted component updates its own subtree. Cleanup disables its settlement callback; promise identity prevents old results from rendering for replacement props. The component starts no request and adds no cache or global observer. Normal non-early SSR retains resolved HTML streaming through a server-only boundary function, without introducing native Suspense into the browser bundle.

This is an explicit markup migration, not a transparent repair of Preact's native streamed Suspense. Early-mode deferred results require JavaScript to replace fallback HTML. `Await` without an explicit fallback retains the existing behavior and known limitation. Arbitrary native Suspense/lazy component boundaries are not repaired. No Vibes files were changed or linked to the candidate.

All 13 application ownership scenarios pass on published Preact 11.0.1 / renderer 6.8.1 using the new built-in behavior. The native matrix and new matrix register through the same assertion harness, including stale fallback/resolved absence, destination retention, query/hash, loader counts, persistent state and focus. The native-only reduction is not attributed to Smolter's new path. Five additional production streaming cases pass for values, rejection, mutation, navigation, preserved head nodes and CSP. Ordinary SSR has a regression asserting resolved content. The broader supported-path browser run passed 59 tests; no timing/performance ranking is claimed.

The integrated behavior costs +192 gzip bytes in the framework-external complete application compared with the preceding candidate (9237 -> 9429). Including published Preact, the candidate changes 16253 -> 16382 gzip bytes (+129). Relative to 0.4.1, complete application inventory including Preact is 42548/16046/14602 -> 43571/16382/14885 raw/gzip/Brotli (+1023/+336/+283), including all preceding recovery/deadline fixes. Main Preact data exports grow 4842 -> 5044 gzip as requested for the integrated implementation. Routing-only and React entries do not grow from this change. This is an export-inventory comparison, not Vibes initial transfer.

No release has been made. Remaining native ownership failures remain visible; a release must clearly scope the supported component-owned path and migration rather than claiming arbitrary native Suspense is fixed. Any decision to change existing early-hydration defaults needs explicit versioning rather than being hidden in a patch.
