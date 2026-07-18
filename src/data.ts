// Data loading and shaping. The pipeline emits regions.json as a column-oriented
// table (a 2,454 x 40 array-of-arrays) to keep the payload small; expandRegions
// turns it back into objects once, at boot.

export interface Region {
  code: string;
  name: string;
  sa3: string;
  sa4: string;
  gcc: string;
  state: string;
  pop: number;
  pop1564: number;
  pop65: number;
  /** Income support recipients (the 11 mutually-exclusive payments). */
  is: number;
  /** Income support excluding the Age Pension. */
  wa: number;
  rateHeadline: number | null;
  rateWorking: number | null;
  ratePension: number | null;
  rateDsp: number | null;
  rateJs: number | null;
  rateCra: number | null;
  /** Raw counts by payment key. */
  payments: Record<string, number>;
}

export interface Electorate {
  code: string;
  name: string;
  state: string;
  is: number[];
  latest: Record<string, number>;
}

export interface Summary {
  generated: string;
  latestQuarter: string;
  quarters: string[];
  cedQuarters: string[];
  cedLatest: string;
  erpYear: number;
  minDenom: { total: number; working: number; senior: number };
  suppressed: { headline: number; working: number; pension: number };
  regionCount: number;
  electorateCount: number;
  totals: Record<string, number>;
  incomeSupportTotal: number;
  workingAgeTotal: number;
  population: { total: number; working: number; senior: number };
  nationalRates: Record<string, number | null>;
}

export interface History {
  quarters: string[];
  series: string[];
  regions: Record<string, number[][]>;
}

export interface National {
  months: string[];
  series: Record<string, (number | null)[]>;
}

export interface Dataset {
  summary: Summary;
  regions: Region[];
  byCode: Map<string, Region>;
  history: History;
  electorates: Electorate[];
  national: National;
}

const FIXED_COLS = new Set([
  'code', 'name', 'sa3', 'sa4', 'gcc', 'state', 'pop', 'pop1564', 'pop65', 'is', 'wa',
  'rateHeadline', 'rateWorking', 'ratePension', 'rateDsp', 'rateJs', 'rateCra',
]);

export function expandRegions(table: { cols: string[]; rows: unknown[][] }): Region[] {
  const { cols, rows } = table;
  const paymentCols = cols.map((c, i) => ({ c, i })).filter(({ c }) => !FIXED_COLS.has(c));
  const idx = (name: string) => cols.indexOf(name);
  const iCode = idx('code'), iName = idx('name'), iSa3 = idx('sa3'), iSa4 = idx('sa4');
  const iGcc = idx('gcc'), iState = idx('state'), iPop = idx('pop');
  const iPopW = idx('pop1564'), iPop65 = idx('pop65'), iIs = idx('is'), iWa = idx('wa');
  const iRh = idx('rateHeadline'), iRw = idx('rateWorking'), iRp = idx('ratePension');
  const iRd = idx('rateDsp'), iRj = idx('rateJs'), iRc = idx('rateCra');

  return rows.map((r) => {
    const payments: Record<string, number> = {};
    for (const { c, i } of paymentCols) payments[c] = Number(r[i]) || 0;
    return {
      code: String(r[iCode]),
      name: String(r[iName]),
      sa3: String(r[iSa3] ?? ''),
      sa4: String(r[iSa4] ?? ''),
      gcc: String(r[iGcc] ?? ''),
      state: String(r[iState] ?? ''),
      pop: Number(r[iPop]) || 0,
      pop1564: Number(r[iPopW]) || 0,
      pop65: Number(r[iPop65]) || 0,
      is: Number(r[iIs]) || 0,
      wa: Number(r[iWa]) || 0,
      rateHeadline: r[iRh] as number | null,
      rateWorking: r[iRw] as number | null,
      ratePension: r[iRp] as number | null,
      rateDsp: r[iRd] as number | null,
      rateJs: r[iRj] as number | null,
      rateCra: r[iRc] as number | null,
      payments,
    };
  });
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadData(signal?: AbortSignal): Promise<Dataset> {
  const [summary, regionTable, history, electoratesFile, national] = await Promise.all([
    getJson<Summary>('data/summary.json', signal),
    getJson<{ cols: string[]; rows: unknown[][] }>('data/regions.json', signal),
    getJson<History>('data/history.json', signal),
    getJson<{ quarters: string[]; latest: string; electorates: Electorate[] }>('data/electorates.json', signal),
    getJson<National>('data/national.json', signal),
  ]);

  const regions = expandRegions(regionTable);
  const byCode = new Map(regions.map((r) => [r.code, r]));
  return { summary, regions, byCode, history, electorates: electoratesFile.electorates, national };
}

/** Metric definitions shared by the map, rankings and distribution views. */
export interface Metric {
  key: string;
  /** Key of the matching national figure in Summary.nationalRates — the summary
   *  uses short names ('working') where the metric uses the region field name
   *  ('rateWorking'), so the mapping has to be explicit. */
  natKey: string | null;
  label: string;
  short: string;
  /** Denominator described in plain English, shown under the metric picker. */
  denom: string;
  get: (r: Region) => number | null;
  /** True when the value is a rate (0-1) rather than a headcount. */
  rate: boolean;
  blurb: string;
}

export const METRICS: Metric[] = [
  {
    key: 'rateWorking',
    natKey: 'working',
    label: 'Working-age income support rate',
    short: 'Working-age rate',
    denom: 'share of people aged 15–64',
    get: (r) => r.rateWorking,
    rate: true,
    blurb: 'Everyone on an income support payment other than the Age Pension, as a share of the 15–64 population. The measure that tracks disadvantage rather than age structure.',
  },
  {
    key: 'rateHeadline',
    natKey: 'headline',
    label: 'All income support rate',
    short: 'Headline rate',
    denom: 'share of all residents',
    get: (r) => r.rateHeadline,
    rate: true,
    blurb: 'Every income support recipient including the Age Pension, as a share of the whole population. The number usually quoted — and the one most distorted by how old an area is.',
  },
  {
    key: 'ratePension',
    natKey: 'pension',
    label: 'Age Pension take-up',
    short: 'Pension take-up',
    denom: 'share of people aged 65+',
    get: (r) => r.ratePension,
    rate: true,
    blurb: 'Age Pension recipients as a share of the 65+ population. Low take-up means a lot of self-funded retirees, so this reads as a wealth measure.',
  },
  {
    key: 'rateDsp',
    natKey: 'dsp',
    label: 'Disability Support Pension rate',
    short: 'DSP rate',
    denom: 'share of people aged 15–64',
    get: (r) => r.rateDsp,
    rate: true,
    blurb: 'DSP recipients as a share of the working-age population.',
  },
  {
    key: 'rateJs',
    natKey: 'js',
    label: 'JobSeeker rate',
    short: 'JobSeeker rate',
    denom: 'share of people aged 15–64',
    get: (r) => r.rateJs,
    rate: true,
    blurb: 'JobSeeker Payment recipients as a share of the working-age population. Not the same as the unemployment rate — it counts payment recipients, not everyone looking for work.',
  },
  {
    key: 'rateCra',
    natKey: 'cra',
    label: 'Rent Assistance rate',
    short: 'Rent Assistance',
    denom: 'share of all residents',
    get: (r) => r.rateCra,
    rate: true,
    blurb: 'People receiving Commonwealth Rent Assistance as a share of all residents. A renting-and-on-a-payment measure.',
  },
  {
    key: 'is',
    natKey: null,
    label: 'Income support recipients',
    short: 'Recipients',
    denom: 'headcount',
    get: (r) => r.is,
    rate: false,
    blurb: 'The raw number of income support recipients. Big areas top this list simply for being big — use a rate to compare places.',
  },
];

export const METRIC_BY_KEY: Record<string, Metric> = Object.fromEntries(METRICS.map((m) => [m.key, m]));
