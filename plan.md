# Site Plan: Welfare Payments

## Overview
- **Name:** Welfare Payments
- **Repo name:** au-welfare
- **Tagline:** Who receives government income support in every Australian suburb — and what the Age Pension hides.

### Naming Convention
Plain topic name, no country code in the name. `country: "AU"` in the index entry.

## Target Audience
Social-policy researchers, community-services planners (councils, NGOs deciding where to place a
food-relief or employment service), journalists writing regional disadvantage stories, and
ordinary people who want to know how their own suburb compares. Mostly desktop, moderately
data-literate, arriving with a specific place in mind ("my suburb", "this electorate"). They come
with a political charge attached to the topic, so the tool must be scrupulously neutral: it
presents counts and rates, names its caveats loudly, and never editorialises about recipients.

## Value Proposition
Everyone can find the *national* welfare numbers. Nobody can easily see them **per suburb, per
capita, with the Age Pension separated out** — which is the only way the numbers mean anything.
The raw "share of people on a payment" metric that gets quoted in the media is dominated by age
structure: retirement coastal towns top it for demographic reasons that have nothing to do with
disadvantage. This site computes the metrics that actually distinguish places:

1. **Working-age income support rate** — recipients of JobSeeker, DSP, Parenting, Youth Allowance,
   Carer Payment and Special Benefit as a share of the 15–64 population. The disadvantage measure.
2. **Age Pension take-up** — Age Pension recipients as a share of the 65+ population. A wealth
   measure in disguise: near-total take-up in poorer regions, far lower in wealthy suburbs where
   retirees are self-funded.
3. **DSP : JobSeeker ratio** — regions where disability support dwarfs unemployment payment vs the
   reverse; a well-documented structural difference between regional and metro labour markets.

No existing site in the fleet touches social security. `au-income` is taxable income (ATO),
`au-jobs` is the unemployment *rate* (labour force survey) — this is the recipient population.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth required? |
|--------|-----|-------------------|-----------------|----------------|
| DSS Payments by Statistical Area 2 (2021 SA2) | data.gov.au `7a6cd81c-e834-4a0c-8d41-4aec150f958b` | 21 payment/concession types × 2,454 SA2s × 12 quarters (Jun 2023 – Mar 2026) | Quarterly | No |
| DSS Payments by Commonwealth Electoral Division (2024 CED) | data.gov.au `1c3745c2-ccd7-4a9f-be73-c08328c9cbe6` | Same payments × 150 federal electorates × 6 quarters | Quarterly | No |
| DSS Income Support Recipients – Monthly Time Series | data.gov.au `6ed2d8c0-0162-46da-bbfe-d493f6190af8` | 11 payments, monthly national totals, Jan 2012 – May 2026 (173 months) | Monthly | No |
| ABS ERP by SA2, age and sex (`ERP_ASGS2021`) | data.api.abs.gov.au SDMX | Population denominators: total + 5-year age groups per SA2 | Annual | No |
| ABS ASGS 2021 SA2 boundaries (`SA2_GEN` layer) | geo.abs.gov.au ArcGIS | Real generalised SA2 polygons (2,473 features) | Static | No |
| Digital Atlas — Federal Electoral Divisions March 2025 | reused from au-mp-expenses (`electorates.geojson`, 1.4 MB) | Real CED polygons | Static | No |

**Known data caveats (must be surfaced in the UI, not buried):**
- DSS rounds every count to the nearest 5 for privacy; a value of `0` can mean "fewer than 5".
- A person can receive several payments at once (e.g. Age Pension + Rent Assistance + Pension
  Concession Card), so payment counts **must never be summed into a "total people on welfare"**.
  The site defines explicit non-overlapping *income support* families and says so everywhere.
- Concession cards (Health Care Card, Low Income Card, Pension Concession Card, Seniors Health
  Card) are entitlements, not payments — kept in a separate group.
- SA2 populations are 2024 ERP against Mar 2026 payment counts; rates are approximate by ~1–2 yrs.
- 2024 CED boundaries vs ASGS 2021 — electorate view uses counts and mix only, never per-capita.

## Key Features
1. Leaflet SA2 choropleth of all 2,454 suburbs across 6 metrics, with drill-down on click.
2. The signature **Pension Illusion** scatter — headline rate vs working-age rate, quadrant-labelled.
3. Rankings leaderboard with a population floor, colour-coded against the national median.
4. Searchable Explorer of every SA2 with 12-quarter sparklines.
5. Electorates view — the political map: 150 CEDs, counts and payment mix, no fake per-capita.
6. Payment Mix matrix — region × payment-type heatmap revealing DSP-dominant vs pension-dominant places.
7. Trends — 173 months of national recipients by payment, annotated with the COVID JobSeeker spike.
8. Distribution histogram with click-through filtering.
9. Auto-detected Insights, plus a hash-linkable per-SA2 drill-down panel.

## Target Audience (detailed)
Two clusters. (a) **Professionals** — a council social-planning officer or NGO analyst on a
desktop, comparing candidate suburbs for service placement, needing exportable specifics and
trustworthy caveats; they will check the methodology before they trust a number. (b) **Curious
locals** — arriving from a search like "Centrelink recipients by suburb", often on a phone,
wanting one number about their own suburb and honest context for it. The design serves (a) with
density and (b) with a search box that is the first thing on screen and a drill-down that reads
like a plain-English profile.

## Style Direction
**Tone:** civic / authoritative, deliberately unsensational.
**Colour palette:** light theme, deep navy (`#1e3a5f`) as the primary with a teal accent
(`#0f766e`). This is government-statistics subject matter where a dark "hacker" theme would read
as surveillance-y and hostile toward the people in the data; the ABS/AIHW visual register — white
ground, navy structure, restrained categorical colours — signals "official statistics, handled
carefully". Sequential choropleth ramps are single-hue teal (not red = bad), because high welfare
receipt is a fact about a place, not a moral failing.
**UI density:** balanced — denser than a consumer app, airier than a terminal.
**Dark/light theme:** light.
**Reference sites for tone:** abs.gov.au data explorer, aihw.gov.au reports.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite (no routing, no deep component tree — view switching only)
- **Data strategy:** pipeline — quarterly cron (`17 6 9 2,5,8,11 *`), matching the DSS quarterly
  release cadence, staggered to day 9 at an off-hour.
- **Key libraries:** Leaflet 1.9 (maps), mapshaper (pipeline-only, boundary simplification). All
  charts hand-rolled SVG. Patterns copied from `patterns/`: `tooltip.ts`, `svgZoom.ts`,
  `leafletMap.ts`, `tests/layout.test.ts`.

## Data payload plan
| File | Contents | Est. size |
|---|---|---|
| `summary.json` | national totals, quarters, metadata, computed insights | ~20 KB |
| `regions.json` | 2,454 SA2s × latest quarter: all payments, population by age band, derived rates | ~1.1 MB |
| `history.json` | 2,454 SA2s × 12 quarters × 5 headline series | ~700 KB |
| `electorates.json` | 150 CEDs × 6 quarters × 21 payments | ~200 KB |
| `national.json` | 11 payments × 173 months | ~40 KB |
| `sa2.geojson` | mapshaper-simplified ABS SA2_GEN | target ≤1.2 MB |
| `electorates.geojson` | reused Digital Atlas CED | 1.4 MB |

## Layout
Fixed 52px header (title, search box, About `?`). Word-only nav tab strip below it. Main content
fills the rest; `max-width: 1680px` centred so wide desktops fill out. Drill-down is a right-hand
slide-in panel (420px) above the map (`z-index` 2100 vs Leaflet's 1000). Below 768px: nav tabs
scroll horizontally, panels stack, drill-down becomes full-screen, map gets a fixed 60vh height.
Sticky footer via the `#app` flex column pattern.

## Pages/Views
Single page, nine word-only tabs: Map · Pension Illusion · Rankings · Explorer · Electorates ·
Payment Mix · Trends · Distribution · Insights. Selected tab and filters persist in `localStorage`;
the drill-down target lives in the URL hash (`#sa2=117031337`) for direct linking.

## Visualization Strategy

Design research: the reference bar here is the ABS Data Explorer's regional profiles (clean
choropleth + linked table) and the *Guardian/ABC* disadvantage-mapping interactives, whose lesson
is that a single well-chosen derived metric beats ten raw ones. The specific form choices below
are driven by this dataset's actual shape — one categorical dimension (21 payment types), one
geographic dimension (2,454 nested regions), one time dimension (12 quarters + 173 months), and a
population denominator. That combination is what makes the scatter and the take-up metric possible;
they would be meaningless for a dataset without a denominator.

1. **Map (Leaflet SA2 choropleth, 6 metrics).** Answers *"what does my area look like, and where
   are the concentrations?"* Only form that shows spatial contiguity — that disadvantage runs in
   corridors, not scattered dots. Hover tooltip per polygon, click → drill-down.
2. **Pension Illusion (scatter, zoom/pan).** *The signature view.* Answers *"is this area's welfare
   receipt about age, or about disadvantage?"* — a question no map or ranking can answer, because
   it is inherently two-dimensional. X = headline recipient rate, Y = working-age rate; a diagonal
   and four labelled quadrants separate retirement towns from genuinely stressed regions. Needs
   zoom/pan at n=2,454. Click a dot → drill-down.
3. **Rankings.** Answers *"who is highest/lowest, and by how far from typical?"* Bars colour-coded
   against the national median, metric switcher, population floor to suppress tiny-SA2 noise.
4. **Explorer.** Answers *"what are the numbers for the specific place I came here for?"* Sortable,
   searchable, 12-quarter sparkline per row. The workhorse for audience (a).
5. **Electorates.** Answers *"how does this map onto federal politics?"* — the newsworthy cut.
   CED choropleth by count plus ranked bars and a party-neutral composition strip. Deliberately
   free of per-capita claims, since no matching ERP denominator exists for 2024 CEDs.
6. **Payment Mix (matrix heatmap).** Answers *"what kind of welfare is this — pension, disability,
   unemployment, or family?"* Rows = regions, columns = payment families, cell = share of that
   region's income-support population. Instantly separates places with identical headline rates.
7. **Trends (national, 173 months).** Answers *"how did we get here?"* Multi-series line with the
   April 2020 JobSeeker doubling annotated — the single most legible event in Australian social
   security data — plus the long DSP decline and Age Pension growth.
8. **Distribution (histogram).** Answers *"is my suburb normal?"* Shows the long right tail that
   ranked bars hide; clicking a bin filters the Explorer to that band.
9. **Insights.** Auto-detected outliers: extreme DSP:JobSeeker ratios, take-up anomalies,
   fastest-rising regions across the 12 quarters, regions >2× the national working-age rate.

Litmus test: this view set would *not* transfer to another dataset — views 2, 6 and 9 depend
specifically on having age-structured denominators and a payment taxonomy, and view 5 depends on
the electoral geography being published alongside.
