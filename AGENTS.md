# @0k/vue-file-browser

- The package is host-fed: it never sees a URL or a transport, never
  fetches, routes, or persists anything. Folder contents come only from
  the host's `load(path)` or its `feed(path, sink)`, which pushes every
  listing (with a feed the widget fetches nothing); opening a folder or file is an event the host
  turns into navigation, and remembered settings are `v-model` values the
  host stores.
- Support Chromium 91 WebView: emitted ES2020, no static blocks,
  Promise.withResolvers, CSS `:has()`, container queries, CSS nesting or
  `light-dark()`. Width-dependent layout goes through the ResizeObserver
  `vfb-narrow` class.
- Every selector hangs from `.vfb-root` and every class is prefixed `vfb-`.
  Colours and sizes are `--vfb-*` variables declared with defaults on
  `.vfb-root`; never hard-code a colour elsewhere (`test/package.test.ts`
  enforces it).
- The widget draws no box (no border, no radius, transparent background)
  and keeps the header and rows on one shared column template.
- Teardown releases the ResizeObserver, the host subscription and any
  column drag, and drops pending load results.
  A load result applies only if no newer source start (path change,
  active-source change, Retry) occurred since.
- Never fail silently: a rejected load shows its message verbatim with a
  Retry button.
- Write specification tests first.
- Verify with `npm run check`.

## Delivery

Published to npm as `@0k/vue-file-browser` with `pkg`, from a git tag;
`package.json` keeps `%%version%%`, substituted from the tag, and
`README.md` is generated from `README.org` at release (never commit it).
Consumers depend on the exact npm release.  To try an unreleased change in
a consumer, link the checkout there (`npm link`) without committing it;
never bump the version for that.
