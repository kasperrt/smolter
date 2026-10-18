# Optional loading investigation — not a release

This experiment does not repair abandoned Preact streamed boundaries or incomplete-document promise rejection. Both remain 0.4.2 blockers. No public API, production implementation, dependency or Vibes file changed in this investigation.

## Recommendation

For nonessential statistics, evaluate resolved SSR plus a small page-owned Preact request component in Vibes. Keep meaningful initial content, session-dependent shell state, theme/styles and useful room links in SSR. Do not move public rooms merely because they are currently deferred: their first-use and discoverability value needs consumer measurement.

A local read-only inspection found Vibes' homepage loader awaits providers, starts stats and public-room requests concurrently, and returns both latter values as promises. Its rooms request filters by Music/Watch and returns at most three initial entries. This is local source inspection, not validation of the other machine's checkout or deployed application. The fixture retains a useful room link and simulates optional statistics; it does not reproduce Vibes' provider, authentication, CSS or room API payloads.

Do not make a breaking default change in 0.4.2. There is no evidence yet that a new plain-hydration entrypoint is worth its public API/validation cost. Consumer independent loading can already use existing APIs. A future explicit resolved-data capability could save about 0.33 KB gzip, but must share the mounting implementation and reject unsupported deferred markers. Keep existing imports compatible. Such an additive supported API belongs in a minor release; changing existing defaults requires a separately versioned migration.

## Byte ownership

`mountApplication` statically imports `readHydration`. It runs even when all loader values are resolved. The server-only `earlyHydration` option does not select another browser module. Returning resolved data or setting `earlyHydration: false` therefore does not remove the reader.

The reader owns promise identity, pending/rejected markers, settlement delivery and terminal cleanup. The server serializer, stream merger, backpressure and disconnect implementation are server modules; removing deferred browser support does not require buffering ordinary SSR HTML. `Await` is separately tree-shakeable when consumers do not import/use it. Preact's Suspense implementation is framework code, not all Smolter application code. Deployment recovery is independent and must remain unchanged.

Esbuild's pre-Terser module attribution for the published full-application selection: deferred reader 1,019 bytes; Await 302 bytes; deployment check 820 bytes; deployment ownership 1,583 bytes. These are contributions before final optimization, **not independently additive compressed costs**.

### Published 0.4.1 library measurement

Fetched the registry tarball with `npm pack @kasperrt/smolter@0.4.1`. Baseline reproduces the historical 9,034 B gzip value. Node 25.9.0, Vite 8.3.4 built output, esbuild 0.28.2 bundling, Terser 5.44.1 module mode / three compression passes, gzip level 9, Brotli quality 11. Framework imports external. Selection exports all of preact, preact/client and preact/document.

| Library selection | Raw | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| Published 0.4.1 | 24,767 | 9,034 | 8,230 |
| Measurement-only plain JSON reader | 23,807 | 8,702 | 7,934 |
| Difference | −960 | −332 | −296 |

The substitution is a byte experiment, **not a shippable implementation**. It replaces `readHydration` with `({ hydration: JSON.parse(json), dispose() {} })`. It lacks deferred capability mismatch checks and rejected-marker semantics. A supported API will cost more. Do not copy it into consumers or claim the result is an implemented public entrypoint.

### Complete production fixture, including replacement code and Preact

Vite production build with the same published package and dependencies, default Vite minification, gzip level 9, Brotli quality 11. A fixture-only transform statically selects the strategy so the unused section implementation is eliminated. One emitted JS file in each build; all JS is initial in this intentionally small fixture. This methodology is separate from the library-size table above.

| Fixture | Raw | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| Streamed optional statistics | 39,222 | 15,109 | 13,756 |
| Independent statistics, unchanged public client | 37,361 | 14,494 | 13,161 |
| Independent plus experimental plain reader | 36,413 | 14,161 | 12,870 |

The supported existing-client alternative saves **615 B gzip / 595 B Brotli net**, including its fetch, validation, state, cancellation, failure and retry code. It adds one statistics HTTP request whose fixture JSON body is only two bytes (`11`); this is not a Vibes payload measurement. The plain-reader experiment saves another 333 B gzip in this application bundle. No routing-only implementation changes or growth occur.

Do not add these deltas to unrelated whole-library totals. Do not equate this small fixture's one-file delivery with Vibes' real route graph. The prototype does not establish a faster router than wouter or React Router.

## Ownership and consumer example

Use existing root stylesheet links unchanged. Keep essential SSR data resolved. For optional statistics, use a keyed component per Music/Watch mode, a single effect per mount/mode/retry, AbortController and an active-instance guard:

```tsx
useEffect(() => {
  const controller = new AbortController();
  let current = true;
  async function load() {
    const { data, error } = await safeWrapAsync(async () =>
      readAndValidateStatistics(
        await fetch(statsURL, { signal: controller.signal }),
      ),
    );
    if (!current) return;
    if (error) setFailed(true);
    else setValue(data);
  }
  void load();
  return () => {
    current = false;
    controller.abort();
  };
}, [statsURL, retry]);
```

Here `safeWrapAsync` is the application’s existing guarded async helper returning `{ data, error }`, not a public Smolter export.

`readAndValidateStatistics` must check HTTP status and the actual existing endpoint schema; the fixture validates a finite number only. Provide explicit manual retry after failure; no automatic retry loop. Do not begin the same optional request in the SSR loader. Unrelated profile mutation revalidation must not change this component's key or dependencies. Repeated mounts/Back fetch again; this prototype deliberately adds no cache. Data is per component instance, with no cross-user or cross-mode sharing.

Render pending/failure text in a sensible reserved region. The fixture uses a four-rem minimum height and ordinary buttons; production dimensions must suit actual content. Do not apply imperative DOM updates inside Preact-owned children. A framework-independent enhancement would need a separately owned island plus lifecycle synchronization; no measured advantage justifies introducing that second ownership system here. A separate imperative prototype was not built.

Cached SSR snapshots were not prototyped: no suitable established statistics snapshot cache contract was verified. Do not invent a new cache or assume personalized information is publicly cacheable.

## Reproduction and correctness

From the repository, install the locked dependencies and build, then run:

```sh
pnpm build
pnpm exec playwright test tests/browser/optional-loading.spec.ts --workers=1
pnpm exec playwright test tests/browser/optional-performance.spec.ts --workers=1
```

The production-minified client mounts public server routes with deployment watching, while the public request adapter normalizes transport URLs. The root contains Settings, a profile fetcher form, mode/navigation controls and Outlet. The server resolves essential data immediately. `/stats?mode=music` or `watch` is held by explicit test gates. `/profile` increments a mutation counter. The manifest reports the current fixture build. No production services are contacted.

Six independent-loading cases pass:

1. Hold statistics, complete the document, open Settings, edit and save once, then settle. Input survives; initial loader runs once; statistics runs once.
2. Leave before settlement, settle the old request, verify no statistics region on destination and query/hash retained; Back mounts a new request successfully.
3. Switch to Watch while Music is pending; settle Watch then Music. Only Watch's value appears.
4. HTTP 503 shows failure; manual retry succeeds.
5. Malformed JSON schema shows failure; manual retry succeeds.
6. Abort the optional HTTP request with Playwright's internet-disconnected fault; restore interception and manually retry successfully. This is not OS-level offline testing.

Profile save executes once in every case; input is retained. Before explicit navigation, statistics failures and profile saves issue no manifest request. No unhandled page error was captured. A fixture cleanup initially attempted to end completed responses twice; it was corrected with writable-ended/destroyed checks. That was not a library defect.

The existing page/fetcher recovery regression results remain separate evidence. This optional-loading experiment is not full auth/root-session, bootstrap recovery, concurrent mutation, CDN/CSP or Vibes parity sign-off.

## Limits and release gate

No Vibes migration recommendation here authorizes changes to that repository. No public API or package version changed. No release is possible while the existing streaming correctness cases remain red.

The current evidence supports a small net byte reduction and simpler optional-data ownership. It does not establish that Smolter is faster than wouter or React Router. Compare equivalent navigation work separately from data/SSR functionality, and compare whole application readiness under matched workloads before accepting a byte increase for a performance gain.

Remaining investigation includes warm caches, realistic populated room payloads, separate origins/CSP, server CPU/memory/throughput, a causal request waterfall, actual consumer styles/CLS, and equivalent competitor benchmarks. Three samples per timing condition are exploratory, not sufficient for a broad superiority or regression claim.

## Timing experiment and invalidation

The local runtime at 11ca22f was used for browser experiments (same SSR implementation as 0.4.1, plus the page-submission recovery guard). The published tarball was used for the size comparison above. Do not relabel local timing samples as published baseline measurements.

The exploratory matrix used three samples per strategy/delay/throttle condition: 36 cold-cache Chromium samples, delays 0/1,500/6,000 ms, unthrottled and 80 ms network latency / 200,000 bytes per second download / 4× CPU throttling. Browser Settings was clicked after the hydration marker appeared; a real textbox had to become visible, and typed input had to survive optional settlement. This measures an automation-observed successful interaction, not the earliest possible hydration readiness. Layout observers were installed without inserting document nodes. All initial timing-matrix interaction assertions passed. There was one emitted JavaScript request in either fixture; independent loading added one optional JSON request. Recorded CLS was zero in this simple layout; that is not Vibes visual sign-off.

**The browser timing comparisons are invalidated.** Several nominal six-second samples showed less than six seconds to completion on the browser clock. A follow-up recorded server elapsed time: one independent request took 6,001.6 ms server-side while browser time to visible completion was 3,528.8 ms. The cause of the cross-clock discrepancy has not been established. No speed, LCP or readiness ranking is inferred from these timings. Raw samples are retained with an explicit invalidation label; selected good-looking samples must not be cherry-picked.

A follow-up streaming assertion also matched both the visible statistics paragraph and temporary Preact streaming-island staging content. The fixture assertion was narrowed to the intended statistics region and explicitly requires zero remaining streaming islands after document completion. This locator issue is not evidence of a new permanent visible-content defect.

No warm-cache, server resource-utilization or equivalent wouter/React Router timing claim is made. A calibrated measurement environment and larger matched samples are prerequisites for the user's performance-first acceptance rule. The byte and deterministic ownership results do not depend on the questionable browser clock readings.

The retained CSV uses milliseconds for delay/timing columns and bytes for jsBytes. `samples` are the initial 36 exploratory runs; `clockChecks` are 12 subsequent six-second runs, including the corrected streaming locator. All are excluded from performance rankings. Both follow-up strategy tests passed their interaction/state assertions. Server timers ranged above the requested delay in some runs; no server-speed conclusion is drawn either.
