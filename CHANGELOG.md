# Changelog

## 0.2.0

- Breaking: choose `@kasperrt/smolter/react` or `@kasperrt/smolter/preact` for routing APIs and types.
- Move optional transport, SSR, and build tools under the selected renderer’s `/client`, `/server`, and `/vite` subpaths. Remove root and top-level core/client/server/files/vite exports.
- Keep browser-safe helpers in `@kasperrt/smolter/utils`.
- Verify unused exports and server/build modules are removed from browser bundles.

## 0.0.1

- First stable release of `@kasperrt/smolter` for React and Preact.
- Typed loaders, actions, client handlers, fetchers, and controlled revalidation.
- Manual and flat file routes, server transport, SSR, and hydration.
- Tokenless npm and JSR publishing through tested GitHub Actions.

## 0.0.1-rc.2

- Use `@kasperrt/smolter` explicitly in every public import and generated route module.
- Remove the unscoped install alias from examples and documentation.

## 0.0.1-rc.1

- Typed React and Preact routing with loaders, actions, and independent fetchers.
- Server handlers with optional clientLoader and clientAction call-through.
- Manual route tables and optional flat file routing.
- Server rendering, hydration, and controlled loader revalidation.
- Four standalone examples and shared UI.
