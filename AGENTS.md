# @0k/vue-file-browser

- The package is host-fed: it never sees a URL or a transport, never
  fetches, routes, or persists anything. Folder contents come only from
  the host's `load(path)`; opening a folder or file is an event the host
  turns into navigation.
- Support Chromium 91 WebView: emitted ES2020, no static blocks,
  Promise.withResolvers, CSS `:has()`, container queries, CSS nesting or
  `light-dark()`. Width-dependent layout goes through the ResizeObserver
  `vfb-narrow` class.
- Every selector hangs from `.vfb-root` and every class is prefixed `vfb-`.
  Colours and sizes are `--vfb-*` variables declared with defaults on
  `.vfb-root`; never hard-code a colour elsewhere (`test/package.test.ts`
  enforces it).
- Teardown releases the ResizeObserver and drops pending load results.
  A load result applies only if no newer load (path change, Reload,
  Retry) started since.
- Never fail silently: a rejected load shows its message verbatim with a
  Retry button.
- Write specification tests first.
- Verify with `npm run check`; produce tarballs with `npm run pack`.
- Never edit consumer repositories or vendor artifacts into them from here.
