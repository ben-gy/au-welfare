# Welfare Payments

**Who receives government income support in every Australian suburb — and what the Age Pension hides.**

🔗 **Live:** [https://au-welfare.benrichardson.dev](https://au-welfare.benrichardson.dev)

## What is this?

The Department of Social Services publishes, every quarter, how many people receive each government
payment in each of the 2,454 SA2 areas the ABS divides Australia into — roughly a suburb each. The
data is public and machine-readable, and almost nobody looks at it, because raw recipient counts
without a population denominator don't mean anything.

This site joins those counts to ABS population estimates by age, which makes the interesting
measures computable. The one it's built around is the **working-age income support rate**: everyone
on a payment other than the Age Pension, as a share of the 15–64 population. That distinction
matters more than it sounds. The Age Pension is 2.6 million of the 5.4 million income support
recipients in the country, so any measure that includes it is largely a measure of *how old an area
is*. Tea Gardens – Hawks Nest on the NSW coast looks like a very high-welfare area — 40.0% of
residents receive a payment — until you take the pension out and find only 24.9% of its working-age
population does. Elizabeth in Adelaide runs the other way: 50.2% headline, but 61.5% of its
working-age residents. Those two places are nothing alike, and the number that usually gets quoted
cannot tell them apart.

A third measure falls out of the same join: **Age Pension take-up**, the share of an area's over-65s
who actually draw the pension. Because it's means-tested, low take-up means local retirees are
self-funded. Nationally it's 55.9%. In Bellevue Hill it's 12.2%, in Toorak 13.3% — the metric turns
out to be a fairly precise map of retiree wealth.

## Who is this for?

Council social planners and NGO analysts deciding where to place a service and needing defensible
per-capita numbers with their caveats stated; journalists writing regional disadvantage stories who
need the working-age figure rather than the misleading headline one; and people who simply want to
know how their own suburb compares and deserve honest context for the answer.

It reports where payments are received. It is not a measure of fraud, dependency or merit, and the
copy throughout is written to avoid implying otherwise — most recipients are pensioners, carers,
people with a disability, parents and students.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| DSS Payment Demographics — by SA2 | 22 payment and concession types × 2,454 areas × 12 quarters | Quarterly |
| DSS Payment Demographics — by electoral division | The same payments across all 150 federal electorates | Quarterly |
| DSS Income Support Recipients Monthly Time Series | 11 payments, national, 173 months from Jan 2012 | Monthly |
| ABS Estimated Resident Population by SA2 and age (`ERP_ASGS2021`) | Population denominators, total and by age band | Annual |
| ABS ASGS 2021 SA2 boundaries | Real suburb-level polygons | Static |
| Digital Atlas of Australia — Federal Electoral Divisions (March 2025) | Electorate polygons | Static |

## Features

- **Map** — Leaflet choropleth of all 2,454 areas across six measures, click through to any profile.
- **Pension Illusion** — the signature scatter: headline rate against working-age rate, with the
  diagonal that shows how far apart the two measures pull, plus zoom, pan and ranked side panels.
- **Rankings** — leaderboard on any measure, colour-coded against the national median, with a
  population floor and state filter.
- **Explorer** — every area, sortable and searchable, with a 12-quarter sparkline per row.
- **Electorates** — the political geography: 150 divisions mapped, ranked and broken into payment
  families. Counts only, deliberately — see the caveat below.
- **Payment Mix** — region × payment-family heatmap showing what a caseload is actually made of.
- **Trends** — 173 months of national recipients, with the April 2020 JobSeeker doubling annotated.
- **Distribution** — histogram with click-through into a filtered Explorer.
- **Insights** — outliers and concentrations computed from the current release, not hand-written.
- **Area profiles** — hash-linkable per-suburb drill-down with rank, trend, mix and comparisons.

## Data caveats worth knowing

These are surfaced in the UI as well, because they change how the numbers should be read:

- **Counts are rounded to the nearest 5** by DSS for privacy; a published 0 can mean "fewer than 5".
  Rankings therefore exclude areas under 5,000 residents.
- **Payments are never summed with supplements or concession cards.** A person can hold Rent
  Assistance, Family Tax Benefit and a Pension Concession Card *alongside* their payment, so adding
  those in would count the same people repeatedly. Only the 11 mutually exclusive income support
  payments form the headcount.
- **Rates for tiny areas are suppressed** rather than clamped. Industrial estates and airports have a
  handful of residents, and rounding against a denominator of 1 produced take-up rates of 500%; 123
  areas have no published working-age rate as a result.
- **Electorate figures carry no per-capita rates.** The ABS doesn't publish population for the 2024
  electoral boundaries, and inventing a denominator would produce authoritative-looking nonsense.
- **The JobSeeker rate is not the unemployment rate** — it counts payment recipients, not everyone
  looking for work.

## Tech Stack

- **Runtime:** Vanilla TypeScript (no framework — view switching only)
- **Build:** Vite 6
- **Testing:** Vitest (119 tests, including positional layout assertions)
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline, quarterly cron matching the DSS release cadence
- **Maps:** Leaflet 1.9 with mapshaper-simplified ABS boundaries

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview
```

To refresh the data locally:

```bash
cd pipeline && npm install
node pipeline/collect.mjs    # downloads DSS, ABS ERP and ABS boundaries into pipeline/tmp/
node pipeline/aggregate.mjs  # writes public/data/*.json and the simplified sa2.geojson
```

## How it works

`collect.mjs` resolves the current resource URLs through the data.gov.au CKAN API (so a new
quarterly release is picked up without a code change), downloads the DSS payment CSVs, the national
time-series workbook, ABS population by SA2 and age via the ABS SDMX API, and the ABS SA2 boundary
layer from its ArcGIS endpoint.

`aggregate.mjs` joins them: it parses the payment tables, sums only the mutually exclusive income
support payments, divides by the matching age-band population — suppressing any rate whose
denominator is too small to survive DSS's rounding — and emits a compact column-oriented
`regions.json` plus history, electorate and national series. The 176 MB raw boundary file is
simplified with mapshaper to ~1.9 MB (about 400 KB gzipped).

The browser loads those five JSON files once, expands the region table into objects, and every view
works off that in-memory dataset. Insights are computed client-side from pure, unit-tested functions
in `src/analysis.ts`, so the findings always describe the data actually loaded.

## License

MIT
