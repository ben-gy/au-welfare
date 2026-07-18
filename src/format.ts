// Formatting helpers. Pure — all covered by tests/format.test.ts.

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatPercent(rate: number | null | undefined, decimals = 1): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(decimals)}%`;
}

/** 5,413,145 -> "5.41m"; 12,800 -> "12.8k". For axis labels and tiles. */
export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** '2026-03' -> 'Mar 2026'. DSS quarters are reference months. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return ym;
  return `${MONTHS[idx]} ${m[1]}`;
}

/** Signed percentage-point difference against a reference rate. */
export function formatDelta(rate: number | null, reference: number | null): string {
  if (rate === null || reference === null || !Number.isFinite(rate) || !Number.isFinite(reference)) return '—';
  const pp = (rate - reference) * 100;
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(1)}pp`;
}

/** Percentage change between two counts, guarding division by zero. */
export function percentChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return (to - from) / from;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Escape text destined for innerHTML. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Abbreviate the ABS long-form state names that come off the boundary file. */
const STATE_ABBR: Record<string, string> = {
  'New South Wales': 'NSW',
  'Victoria': 'Vic',
  'Queensland': 'Qld',
  'South Australia': 'SA',
  'Western Australia': 'WA',
  'Tasmania': 'Tas',
  'Northern Territory': 'NT',
  'Australian Capital Territory': 'ACT',
  'Other Territories': 'OT',
};
export function stateAbbr(name: string): string {
  return STATE_ABBR[name] ?? name;
}
export const STATE_LIST = Object.keys(STATE_ABBR);
