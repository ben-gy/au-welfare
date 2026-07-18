// Turn pipeline/tmp/ raw sources into the JSON the browser reads from public/data/.
// All parsing lives in parse.mjs; this file is orchestration and IO only.

import { mkdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import {
  ALL_PAYMENTS,
  IS_KEYS,
  MIN_DENOM,
  csvObjects,
  incomeSupportTotal,
  num,
  parseErp,
  parseNationalXlsx,
  safeRate,
} from './parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, 'tmp');
const OUT = join(HERE, '..', 'public', 'data');
mkdirSync(OUT, { recursive: true });

function readPaymentRow(row) {
  const vals = {};
  for (const [key, header] of Object.entries(ALL_PAYMENTS)) vals[key] = num(row[header]);
  return vals;
}

// ------------------------------------------------------------------- main ----

function kb(p) { return Math.round(statSync(p).size / 1024); }

async function main() {
  // ---- SA2 payments ----
  const sa2Rows = csvObjects(readFileSync(join(TMP, 'dss-sa2.csv'), 'utf8'));
  const quarters = [...new Set(sa2Rows.map((r) => r.DATE))].sort();
  const latest = quarters[quarters.length - 1];
  console.log(`SA2: ${sa2Rows.length} rows, ${quarters.length} quarters, latest ${latest}`);

  // ---- ERP ----
  const { year: erpYear, pop } = parseErp(readFileSync(join(TMP, 'erp-sa2.csv'), 'utf8'));
  console.log(`ERP: ${pop.size} SA2s, vintage ${erpYear}`);

  // ---- boundaries: attach names/geography from the geojson properties ----
  const rawGeo = readFileSync(join(TMP, 'sa2-raw.geojson'), 'utf8');
  const geoParsed = JSON.parse(rawGeo);
  const geoMeta = new Map();
  for (const f of geoParsed.features) {
    const p = f.properties || {};
    if (p.sa2_code_2021) {
      geoMeta.set(String(p.sa2_code_2021), {
        sa3: p.sa3_name_2021 || '',
        sa4: p.sa4_name_2021 || '',
        gcc: p.gccsa_name_2021 || '',
        state: p.state_name_2021 || '',
      });
    }
  }
  console.log(`Geo: ${geoParsed.features.length} polygons, ${geoMeta.size} coded`);

  // ---- latest-quarter region table ----
  const paymentKeys = Object.keys(ALL_PAYMENTS);
  const cols = [
    'code', 'name', 'sa3', 'sa4', 'gcc', 'state',
    'pop', 'pop1564', 'pop65',
    'is', 'wa',
    'rateHeadline', 'rateWorking', 'ratePension', 'rateDsp', 'rateJs', 'rateCra',
    ...paymentKeys,
  ];
  const regions = [];
  let skippedNoPop = 0;
  for (const r of sa2Rows) {
    if (r.DATE !== latest) continue;
    const code = r.SA2_CODE_2021;
    const vals = readPaymentRow(r);
    const p = pop.get(code) || { total: 0, working: 0, senior: 0 };
    if (!p.total) skippedNoPop++;
    const meta = geoMeta.get(code) || { sa3: '', sa4: '', gcc: '', state: '' };
    const is = incomeSupportTotal(vals);
    const wa = is - vals.ap;
    regions.push([
      code, r.SA2_NAME_2021, meta.sa3, meta.sa4, meta.gcc, meta.state,
      p.total, p.working, p.senior,
      is, wa,
      safeRate(is, p.total, MIN_DENOM.total),
      safeRate(wa, p.working, MIN_DENOM.working),
      safeRate(vals.ap, p.senior, MIN_DENOM.senior),
      safeRate(vals.dsp, p.working, MIN_DENOM.working),
      safeRate(vals.js, p.working, MIN_DENOM.working),
      safeRate(vals.cra, p.total, MIN_DENOM.total),
      ...paymentKeys.map((k) => vals[k]),
    ]);
  }
  console.log(`Regions: ${regions.length} (${skippedNoPop} without an ERP match)`);
  if (regions.length < 2000) throw new Error('too few regions — source incomplete');

  // ---- history: 5 headline series per SA2 across all quarters ----
  const histSeries = ['is', 'ap', 'wa', 'dsp', 'js'];
  const hist = {};
  for (const r of sa2Rows) {
    const code = r.SA2_CODE_2021;
    const qi = quarters.indexOf(r.DATE);
    if (qi < 0) continue;
    let e = hist[code];
    if (!e) { e = histSeries.map(() => new Array(quarters.length).fill(0)); hist[code] = e; }
    const vals = readPaymentRow(r);
    const is = incomeSupportTotal(vals);
    e[0][qi] = is;
    e[1][qi] = vals.ap;
    e[2][qi] = is - vals.ap;
    e[3][qi] = vals.dsp;
    e[4][qi] = vals.js;
  }

  // ---- electorates ----
  const cedRows = csvObjects(readFileSync(join(TMP, 'dss-ced.csv'), 'utf8'));
  const cedQuarters = [...new Set(cedRows.map((r) => r.DATE))].sort();
  const cedLatest = cedQuarters[cedQuarters.length - 1];
  const cedByCode = new Map();
  for (const r of cedRows) {
    const code = r.CED_CODE_2024;
    const vals = readPaymentRow(r);
    let e = cedByCode.get(code);
    if (!e) {
      e = {
        code,
        name: r.CED_2024,
        state: r['Commonwealth electoral division state'] || '',
        latest: null,
        is: new Array(cedQuarters.length).fill(0),
      };
      cedByCode.set(code, e);
    }
    const qi = cedQuarters.indexOf(r.DATE);
    e.is[qi] = incomeSupportTotal(vals);
    if (r.DATE === cedLatest) {
      e.latest = { ...vals, is: incomeSupportTotal(vals), wa: incomeSupportTotal(vals) - vals.ap };
    }
  }
  const electorates = [...cedByCode.values()].filter((e) => e.latest);
  console.log(`Electorates: ${electorates.length}, latest ${cedLatest}`);

  // ---- national monthly ----
  const national = parseNationalXlsx(readFileSync(join(TMP, 'national.xlsx')));
  console.log(`National: ${national.months.length} months, ${Object.keys(national.series).length} payments`);
  if (national.months.length < 100) throw new Error('national series too short — parse failed');

  // ---- national roll-up from the SA2 table (for headline stats) ----
  const totals = {};
  for (const k of paymentKeys) totals[k] = 0;
  let popTotal = 0, popWorking = 0, popSenior = 0;
  for (const row of regions) {
    const o = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
    for (const k of paymentKeys) totals[k] += o[k];
    popTotal += o.pop; popWorking += o.pop1564; popSenior += o.pop65;
  }
  const isTotal = IS_KEYS.reduce((s, k) => s + totals[k], 0);

  // ---- write ----
  const summary = {
    generated: new Date().toISOString(),
    latestQuarter: latest,
    quarters,
    cedQuarters,
    cedLatest,
    erpYear,
    minDenom: MIN_DENOM,
    suppressed: {
      headline: regions.filter((r) => r[cols.indexOf('rateHeadline')] === null).length,
      working: regions.filter((r) => r[cols.indexOf('rateWorking')] === null).length,
      pension: regions.filter((r) => r[cols.indexOf('ratePension')] === null).length,
    },
    regionCount: regions.length,
    electorateCount: electorates.length,
    totals,
    incomeSupportTotal: isTotal,
    workingAgeTotal: isTotal - totals.ap,
    population: { total: popTotal, working: popWorking, senior: popSenior },
    nationalRates: {
      headline: safeRate(isTotal, popTotal),
      working: safeRate(isTotal - totals.ap, popWorking),
      pension: safeRate(totals.ap, popSenior),
      dsp: safeRate(totals.dsp, popWorking),
      js: safeRate(totals.js, popWorking),
      cra: safeRate(totals.cra, popTotal),
    },
  };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary));
  writeFileSync(join(OUT, 'regions.json'), JSON.stringify({ cols, rows: regions }));
  writeFileSync(join(OUT, 'history.json'), JSON.stringify({ quarters, series: histSeries, regions: hist }));
  writeFileSync(join(OUT, 'electorates.json'), JSON.stringify({ quarters: cedQuarters, latest: cedLatest, electorates }));
  writeFileSync(join(OUT, 'national.json'), JSON.stringify(national));

  // ---- boundaries: simplify with mapshaper (never by hand) ----
  // 1.5% vertex retention on the 176 MB ArcGIS source yields ~1.9 MB / ~400 KB
  // gzipped — in line with au-income's shipped postal-area layer (1.2% / 1.6 MB
  // for a comparable 2,266 polygons). keep-shapes stops small urban SA2s from
  // being dropped entirely; retention is allocated by complexity, so large
  // rural SA2s still keep hundreds of vertices and read as real coastlines.
  const cmd =
    '-i raw.geojson ' +
    '-filter-fields sa2_code_2021,sa2_name_2021 ' +
    '-simplify 1.5% keep-shapes planar ' +
    '-o format=geojson precision=0.001 sa2.geojson';
  const outObj = await mapshaper.applyCommands(cmd, { 'raw.geojson': rawGeo });
  writeFileSync(join(OUT, 'sa2.geojson'), outObj['sa2.geojson'].toString());

  const cedGeo = join(OUT, 'electorates.geojson');
  if (!existsSync(cedGeo)) {
    console.warn('WARNING: electorates.geojson missing (committed static asset from the Digital Atlas)');
  }

  console.log('\nWritten:');
  for (const f of ['summary.json', 'regions.json', 'history.json', 'electorates.json', 'national.json', 'sa2.geojson']) {
    console.log(`  ${f.padEnd(22)} ${kb(join(OUT, f))} KB`);
  }
}

// Only run when invoked directly, so tests can import the pure helpers.
if (process.argv[1] && process.argv[1].endsWith('aggregate.mjs')) {
  main().catch((err) => {
    console.error('AGGREGATE FAILED:', err);
    process.exit(1);
  });
}
