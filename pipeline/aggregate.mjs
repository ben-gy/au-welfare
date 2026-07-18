// Turn pipeline/tmp/ raw sources into the JSON the browser reads from public/data/.
//
// The only judgement calls in here, made explicit because they drive every number
// on the site:
//
//  * "Income support" means the 11 payments DSS itself treats as income support
//    (the 11 sheets of its own monthly time series). A person receives at most one
//    of these at a time, so they can legitimately be summed. Rent Assistance,
//    Family Tax Benefit, Carer Allowance and the four concession cards are NOT
//    summed into that total — they are supplements/entitlements held alongside a
//    payment, and adding them would double-count people.
//  * "Working age income support" is that total minus the Age Pension, divided by
//    the 15-64 population. DSP recipients transfer to the Age Pension at pension
//    age, so the numerator is working-age by construction.
//  * Every DSS count is rounded to the nearest 5 at source, and a 0 may mean
//    "fewer than 5". Rates for very small regions are therefore noisy; the UI
//    applies a population floor wherever it ranks regions.

import { mkdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import mapshaper from 'mapshaper';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, 'tmp');
const OUT = join(HERE, '..', 'public', 'data');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- payments ---

// key -> exact DSS column header. Order matters: it is the emitted column order.
export const INCOME_SUPPORT = {
  ap: 'Age Pension',
  dsp: 'Disability Support Pension',
  cp: 'Carer Payment',
  js: 'JobSeeker Payment',
  pps: 'Parenting Payment Single',
  ppp: 'Parenting Payment Partnered',
  yao: 'Youth Allowance (other)',
  yas: 'Youth Allowance (student and apprentice)',
  aus: 'Austudy',
  abl: 'ABSTUDY (Living allowance)',
  sb: 'Special Benefit',
};

export const SUPPLEMENTARY = {
  cra: 'Commonwealth Rent Assistance',
  ftba: 'Family Tax Benefit A',
  ftbb: 'Family Tax Benefit B',
  ftbac: 'Family Tax Benefit A Children',
  ca: 'Carer Allowance',
  cachc: 'Carer Allowance (Child Health Care Card only)',
  abn: 'ABSTUDY (Non-living allowance)',
};

export const CARDS = {
  pcc: 'Pension Concession Card',
  hcc: 'Health Care Card',
  cshc: 'Commonwealth Seniors Health Card',
  lic: 'Low Income Card',
};

const ALL_PAYMENTS = { ...INCOME_SUPPORT, ...SUPPLEMENTARY, ...CARDS };
const IS_KEYS = Object.keys(INCOME_SUPPORT);

// ------------------------------------------------------------------- utils ---

// RFC4180-ish parser: handles quoted fields containing commas, which the DSS
// files use for region names like "Sydney (C)".
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

export function csvObjects(text) {
  const rows = parseCsv(text);
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

// DSS blanks/'<5' style cells become 0; everything else is an integer.
export function num(v) {
  if (v === undefined || v === null) return 0;
  const s = String(v).replace(/[, ]/g, '');
  if (!s || s === 'np' || s === 'n/a' || s === '-' || s === '..') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Minimum denominator for a rate to be published at all. DSS rounds counts to the
// nearest 5, so an industrial or airport SA2 with 1 resident aged 65+ and a rounded
// "5" Age Pension recipients computes to a 500% take-up rate. Suppressing (null)
// rather than clamping keeps those regions out of rankings, scatter and choropleth
// instead of silently pinning them to 100%.
export const MIN_DENOM = { total: 500, working: 400, senior: 200 };

export function safeRate(numer, denom, floor = 0) {
  if (!denom || denom <= 0 || denom < floor) return null;
  const r = numer / denom;
  return Number.isFinite(r) ? Math.round(r * 10000) / 10000 : null;
}

// ------------------------------------------------------------- xlsx reader ---
// Minimal zip + SharedStrings + sheet reader. xlsx is a zip of XML; we only need
// column A (Excel date serial) and column B (all recipients) from each payment
// sheet, so a full spreadsheet library would be overkill.

export function unzip(buf) {
  const files = new Map();
  // locate End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    // local header: skip its own (possibly different) name/extra lengths
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// Excel serial date -> 'YYYY-MM'. Epoch is 1899-12-30 (Excel's 1900 leap bug).
export function serialToMonth(serial) {
  const ms = (serial - 25569) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sheetRowsAB(xml) {
  // Pull (rowNumber -> {A, B}) for numeric cells only.
  const out = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let m;
  while ((m = rowRe.exec(xml))) {
    const inner = m[2];
    const cells = {};
    const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
    let c;
    while ((c = cellRe.exec(inner))) {
      const col = c[1];
      if (col !== 'A' && col !== 'B') continue;
      if (/t="s"/.test(c[2])) continue; // shared string, not a number
      const v = /<v>([^<]*)<\/v>/.exec(c[3]);
      if (v) cells[col] = Number(v[1]);
    }
    if (Number.isFinite(cells.A) && Number.isFinite(cells.B)) out.push(cells);
  }
  return out;
}

const NATIONAL_SHEETS = {
  'Age Pension': 'ap',
  'Disability Support Pension': 'dsp',
  'Carer Payment': 'cp',
  'JobSeeker Payment': 'js',
  'Parenting Payment Single': 'pps',
  'Parenting Payment Partnered': 'ppp',
  'YA (other)': 'yao',
  'YA (student and apprentice)': 'yas',
  'Austudy': 'aus',
  'ABSTUDY (Living Allowance)': 'abl',
  'Special Benefit': 'sb',
};

export function parseNationalXlsx(buf) {
  const files = unzip(buf);
  const wb = files.get('xl/workbook.xml').toString('utf8');
  const rels = files.get('xl/_rels/workbook.xml.rels').toString('utf8');
  const relMap = new Map(
    [...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]])
  );
  const sheets = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({
    name: m[1].replace(/&amp;/g, '&'),
    target: relMap.get(m[2]),
  }));

  const months = new Set();
  const series = {};
  for (const sh of sheets) {
    const key = NATIONAL_SHEETS[sh.name];
    if (!key || !sh.target) continue;
    const path = 'xl/' + sh.target.replace(/^\/?xl\//, '');
    const buf2 = files.get(path);
    if (!buf2) continue;
    const rows = sheetRowsAB(buf2.toString('utf8'));
    const byMonth = {};
    for (const r of rows) {
      // Data rows carry a plausible date serial (>= 2000-01-01) and a count.
      if (r.A < 36526 || r.A > 60000) continue;
      const month = serialToMonth(r.A);
      byMonth[month] = Math.round(r.B);
      months.add(month);
    }
    series[key] = byMonth;
  }
  const sorted = [...months].sort();
  const out = { months: sorted, series: {} };
  for (const [k, byMonth] of Object.entries(series)) {
    out.series[k] = sorted.map((m) => (byMonth[m] ?? null));
  }
  return out;
}

// ------------------------------------------------------------------- ERP ----

const AGE_WORKING = new Set(['A15', 'A20', 'A25', 'A30', 'A35', 'A40', 'A45', 'A50', 'A55', 'A60']);
const AGE_SENIOR = new Set(['A65', 'A70', 'A75', 'A80', '8599']);

export function parseErp(csvText) {
  const rows = csvObjects(csvText);
  // Keep only the newest year present, so a mid-year ABS release can't mix vintages.
  const years = [...new Set(rows.map((r) => Number(r.TIME_PERIOD)))].filter(Number.isFinite);
  const year = Math.max(...years);
  const pop = new Map();
  for (const r of rows) {
    if (Number(r.TIME_PERIOD) !== year) continue;
    const code = r.ASGS_2021;
    const val = num(r.OBS_VALUE);
    let e = pop.get(code);
    if (!e) { e = { total: 0, working: 0, senior: 0 }; pop.set(code, e); }
    if (r.AGE === 'TOT') e.total = val;
    else if (AGE_WORKING.has(r.AGE)) e.working += val;
    else if (AGE_SENIOR.has(r.AGE)) e.senior += val;
  }
  return { year, pop };
}

// -------------------------------------------------------------- DSS tables ---

function readPaymentRow(row) {
  const vals = {};
  for (const [key, header] of Object.entries(ALL_PAYMENTS)) vals[key] = num(row[header]);
  return vals;
}

export function incomeSupportTotal(vals) {
  return IS_KEYS.reduce((s, k) => s + (vals[k] || 0), 0);
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
