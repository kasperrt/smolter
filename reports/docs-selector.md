# Documentation selector, navigation and publication delivery

## Changes

Documentation and workflow update only. The npm package remains 0.4.6; this does not publish a new package version.

The landing page and bundle-size guide now share a feature selector. Navigation is always included. Data routing and intent prefetch are selected initially; SSR, viewport prefetch, speculative data and explicit recovery helpers can be selected with their prerequisites. React and Preact use a keyboard-accessible segmented radio control with the existing pink/plum palette, visible focus and reduced-motion support.

Each of the 25 valid combinations per renderer is bundled separately through production Vite and Smolter's plugin. The selector reports minified, gzip level 9 and Brotli quality 11 bytes for that combined fixture. Framework runtimes and consumer application code are excluded. These are not sums of individually compressed features, nor initial-page transfer measurements. Existing esbuild/Terser comparison tables remain separately labeled. Dynamic inputs conservatively retain possible prefetch modes; named-import tree shaking governs the other capabilities. Mounting an SSR application already shares recovery implementation, so explicitly exporting recovery helpers adds only their remaining cost.

Cold navigation into documentation previously replaced useful content with the loading panel. The standalone React/Preact entries now install the existing retained-route presentation helper. Browser history observes the raw router snapshot; metadata observes the committed presentation. This preserves immediate URL/history behavior without stale metadata or a replacement loading screen. Existing view transitions respect reduced motion; shared guide layouts remain mounted.

After one npm upload, release verification now waits up to 15 minutes, polling registry visibility every 30 seconds. The publication step allows 18 minutes and the job 22 minutes. An accepted upload is not reported as success until registry verification passes. The wait never re-uploads the package. JSR remains a CI validation step, not a publication dependency.

## Size scope

No published router, adapter, SSR or Vite runtime implementation changes. The existing named-export measurements remain unchanged: routing-only React 1,855 B gzip and Preact 1,838 B; common routing/data React 4,150 B and Preact 4,128 B.

The initial selector rollout’s hosted docs entry was 81,750 B minified, 26,414 B gzip and 23,099 B Brotli in the local production build. Its gzip ceiling moves from 25,000 to 28,000 B to accommodate the interactive selector, measurements and retained presentation. This is additional documentation-site cost, not a package-runtime improvement. No LCP, TTFB or general speed claim is made.

## Verification

The hosted-site browser regression holds the first guide module request and asserts that the landing and header nodes remain, with no loading-documentation panel. Existing article/sidebar identity, prefetch, deep-link refresh, history and metadata checks remain. Selector checks cover required/dependent options, measured totals, keyboard arrows, reduced-motion styling and a 390-pixel viewport. Desktop and mobile screenshots were visually reviewed.

Release subprocess tests simulate ten minutes of delayed registry visibility, permanent unavailability through the deadline, and already-published versions. They verify one upload, bounded waiting and failure when publication remains incomplete.

No consumer application was modified. These are upstream fixtures and documentation checks, not a fresh Vibes migration or device sign-off. Consumers need no API or configuration changes.

Local validation: lint, typechecking, generated references, 453 tests with 100% line and function coverage, packed React/Preact consumers, JSR dry-run validation, production example builds and SSR smoke tests, and hosted-site browser checks passed. Browser suites cover both file and manual routing; their results are recorded in the PR. No npm version bump is included.

## Number transitions

The selector now eases its three totals over 280 ms using one bounded animation-frame sequence. New selections retarget from the currently displayed values. Initial server-rendered values do not animate, reduced motion settles immediately, and effect cleanup cancels pending frames when the selection changes or the component unmounts. The live region exposes the final gzip total while visual intermediate numbers are hidden from assistive technology. No dependency or package export changes; the package stays at 0.4.6. Controlled-clock browser checks cover upward/downward movement, rapid reversal, exact settlement and reduced motion.

The number-transition build measures 82,458 B minified, 26,681 B gzip and 23,292 B Brotli: +708 / +267 / +193 B against the preceding docs build with identical settings. The existing 28,000 B site gzip gate still passes. Published package sizes are unchanged.
