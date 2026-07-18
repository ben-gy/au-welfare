// Collect raw source data into pipeline/tmp/.
//
// Sources (all public, no auth):
//   1. DSS Payments by SA2 (2021)            — data.gov.au CKAN
//   2. DSS Payments by CED (2024)            — data.gov.au CKAN
//   3. DSS Income Support Monthly Time Series — data.gov.au CKAN (xlsx)
//   4. ABS ERP by SA2, total + age groups    — data.api.abs.gov.au (SDMX csv)
//   5. ABS ASGS 2021 SA2_GEN boundaries      — geo.abs.gov.au ArcGIS (paged geojson)
//
// Resource URLs are resolved through the CKAN package_show API rather than
// hard-coded, so a new quarterly release is picked up automatically. Each
// dataset keeps several historical resources; we pick the one whose title
// names the newest boundary vintage, which is always the actively-updated file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, 'tmp');
mkdirSync(TMP, { recursive: true });

const CKAN = 'https://data.gov.au/data/api/3/action/package_show?id=';
const PKG_SA2 = '7a6cd81c-e834-4a0c-8d41-4aec150f958b';
const PKG_CED = '1c3745c2-ccd7-4a9f-be73-c08328c9cbe6';
const PKG_NATIONAL = '6ed2d8c0-0162-46da-bbfe-d493f6190af8';

const UA = 'au-welfare-pipeline/1.0 (+https://au-welfare.benrichardson.dev)';

async function fetchWithRetry(url, { binary = false, tries = 4, accept = null } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const headers = { 'User-Agent': UA };
      if (accept) headers.Accept = accept;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      lastErr = err;
      console.log(`  retry ${attempt}/${tries} (${err.message}) ${url.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`failed after ${tries}: ${url} — ${lastErr?.message}`);
}

async function ckanResources(pkgId) {
  const json = JSON.parse(await fetchWithRetry(CKAN + pkgId));
  if (!json.success) throw new Error(`CKAN lookup failed for ${pkgId}`);
  return json.result.resources.map((r) => ({ name: r.name || '', url: r.url, format: r.format }));
}

// The newest resource is the one naming the largest 4-digit year in its title;
// ties broken by the largest end-month year mentioned. Falls back to first.
function pickNewest(resources, predicate = () => true) {
  const cands = resources.filter(predicate);
  if (!cands.length) throw new Error('no matching resource');
  const score = (r) => {
    const years = [...r.name.matchAll(/(20\d{2})/g)].map((m) => Number(m[1]));
    return years.length ? Math.max(...years) * 100 + years.length : 0;
  };
  return cands.slice().sort((a, b) => score(b) - score(a))[0];
}

// ---------- ABS ERP (SDMX csv) ----------
const ABS = 'https://data.api.abs.gov.au/rest/data/ERP_ASGS2021/';
// AGE codes: A15..A60 make up 15-64; A65/A70/A75/A80/8599 make up 65+.
const AGE_WORKING = ['A15', 'A20', 'A25', 'A30', 'A35', 'A40', 'A45', 'A50', 'A55', 'A60'];
const AGE_SENIOR = ['A65', 'A70', 'A75', 'A80', '8599'];

async function fetchErp() {
  // Ask for the most recent 3 years and keep the newest that actually returned rows —
  // ABS publishes the new ERP vintage part-way through the year.
  const thisYear = new Date().getUTCFullYear();
  const start = thisYear - 3;
  const ages = ['TOT', ...AGE_WORKING, ...AGE_SENIOR].join('+');
  // The ABS SDMX endpoint negotiates on Accept and returns 406 without it.
  const url = `${ABS}ERP.3.${ages}.SA2..A?startPeriod=${start}`;
  return await fetchWithRetry(url, { accept: 'text/csv' });
}

// ---------- ABS SA2 boundaries ----------
// Layer 1 of the SA2 service is SA2_GEN — the generalised geometry. Layer 0 is the
// full-resolution coastline-accurate version and is ~100x larger for no visible gain
// at national zoom levels.
const ABS_SA2 = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SA2/MapServer/1/query';

async function fetchSA2Geo() {
  const feats = [];
  const pageSize = 400;
  for (let offset = 0; offset < 4000; offset += pageSize) {
    const url =
      ABS_SA2 +
      '?where=1%3D1&outFields=sa2_code_2021,sa2_name_2021,sa3_name_2021,sa4_name_2021,gccsa_name_2021,state_name_2021' +
      '&outSR=4326&resultRecordCount=' + pageSize +
      '&resultOffset=' + offset + '&f=geojson';
    const gj = JSON.parse(await fetchWithRetry(url));
    const got = gj.features || [];
    feats.push(...got);
    console.log(`  SA2 boundaries offset ${offset} -> ${got.length} (total ${feats.length})`);
    if (got.length < pageSize) break;
  }
  if (feats.length < 2000) throw new Error(`only ${feats.length} SA2 polygons — source incomplete`);
  return { type: 'FeatureCollection', features: feats };
}

// ---------- main ----------
async function main() {
  console.log('1/5 DSS payments by SA2...');
  const sa2Res = await ckanResources(PKG_SA2);
  const sa2Pick = pickNewest(sa2Res, (r) => /sa2/i.test(r.name) && /csv/i.test(r.format || ''));
  console.log('  ->', sa2Pick.name);
  writeFileSync(join(TMP, 'dss-sa2.csv'), await fetchWithRetry(sa2Pick.url));

  console.log('2/5 DSS payments by electoral division...');
  const cedRes = await ckanResources(PKG_CED);
  const cedPick = pickNewest(cedRes, (r) => /ced/i.test(r.name) && /csv/i.test(r.format || ''));
  console.log('  ->', cedPick.name);
  writeFileSync(join(TMP, 'dss-ced.csv'), await fetchWithRetry(cedPick.url));

  console.log('3/5 DSS national monthly time series...');
  const natRes = await ckanResources(PKG_NATIONAL);
  const natPick = pickNewest(natRes, (r) => /xlsx/i.test(r.url));
  console.log('  ->', natPick.name);
  writeFileSync(join(TMP, 'national.xlsx'), await fetchWithRetry(natPick.url, { binary: true }));

  console.log('4/5 ABS ERP by SA2 and age...');
  const erp = await fetchErp();
  const erpLines = erp.split('\n').length;
  if (erpLines < 20000) throw new Error(`ERP response only ${erpLines} lines — expected ~40k`);
  writeFileSync(join(TMP, 'erp-sa2.csv'), erp);
  console.log(`  -> ${erpLines} lines`);

  console.log('5/5 ABS SA2 boundaries...');
  const geo = await fetchSA2Geo();
  writeFileSync(join(TMP, 'sa2-raw.geojson'), JSON.stringify(geo));
  console.log(`  -> ${geo.features.length} polygons`);

  console.log('Collect complete.');
}

main().catch((err) => {
  console.error('COLLECT FAILED:', err);
  process.exit(1);
});
