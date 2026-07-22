// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Pure parsing + taxonomy for the DSS/ABS sources. Deliberately dependency-free
// (node builtins only) so the frontend test suite can import the very parser that
// ships, without dragging mapshaper — a pipeline-only dependency — into Vitest.
//
// The judgement calls encoded here, made explicit because they drive every number
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

import { inflateRawSync } from 'node:zlib';

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

export const ALL_PAYMENTS = { ...INCOME_SUPPORT, ...SUPPLEMENTARY, ...CARDS };
export const IS_KEYS = Object.keys(INCOME_SUPPORT);

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

export function incomeSupportTotal(vals) {
  return IS_KEYS.reduce((s, k) => s + (vals[k] || 0), 0);
}

