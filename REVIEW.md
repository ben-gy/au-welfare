# Welfare Payments — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **Live:** https://au-welfare.benrichardson.dev — DNS, TLS cert and HTTPS enforcement are all live
- **GitHub Pages:** https://ben-gy.github.io/au-welfare/ *(redirects to the custom domain)*

## Verified on production

- All nine views render, zero console errors
- Real clicks: map polygon → profile (Bourke – Brewarrina), matrix cell → profile (Whyalla),
  electorate row → isolates Spence, histogram bin → filtered Explorer
- Scatter zoom + drag-pan works and does not fire a spurious click
- About modal opens *over* the Leaflet map without being painted under it
- No horizontal overflow at 375px on any view, with the drawer and modal open
- 119 tests pass, including positional layout assertions

## Two CI failures fixed after the first push

- `tests/data.test.ts` imported `pipeline/aggregate.mjs`, which imports mapshaper — installed only
  under `pipeline/`, so the root `npm ci` could not resolve it and the deploy failed. Pure parsers
  now live in `pipeline/parse.mjs` (node builtins only); aggregate is orchestration and IO.
- The data pipeline failed on `npm ci`: mapshaper pulls a wildcard `@types/node`, so even a freshly
  generated lockfile fails `EUSAGE`. That step now uses `npm install`.
