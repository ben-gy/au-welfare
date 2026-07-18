// Pure analysis functions. Everything the Insights view claims is computed here
// so it can be unit-tested rather than asserted in prose.

import type { Dataset, Region } from './data';
import { formatMonth, formatNumber, formatPercent, stateAbbr } from './format';

/** Regions below these population floors are excluded from every ranking and
 *  insight: DSS rounds counts to the nearest 5, so a suburb of 300 people
 *  produces rates that jump in 1.7-point steps. */
export const RANK_FLOOR = 5000;

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function quantile(values: number[], q: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return v[lo];
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** Regions eligible for ranking: big enough, and with the metric published. */
export function rankable(regions: Region[], get: (r: Region) => number | null, floor = RANK_FLOOR): Region[] {
  return regions.filter((r) => r.pop >= floor && get(r) !== null && Number.isFinite(get(r) as number));
}

/**
 * The Pension Illusion gap: how many percentage points an area's headline rate
 * overstates (positive) or understates (negative) its working-age rate.
 * Big positive = a retirement town. Negative = young, stressed population.
 */
export function pensionGap(r: Region): number | null {
  if (r.rateHeadline === null || r.rateWorking === null) return null;
  return r.rateHeadline - r.rateWorking;
}

/** DSP recipients per JobSeeker recipient. Null when either side is too small. */
export function dspRatio(r: Region, minEach = 200): number | null {
  const dsp = r.payments.dsp ?? 0;
  const js = r.payments.js ?? 0;
  if (dsp < minEach || js < minEach) return null;
  return dsp / js;
}

/** Change in a history series between the first and last quarter, as a fraction. */
export function seriesChange(series: number[]): number | null {
  if (!series || series.length < 2) return null;
  const from = series[0];
  const to = series[series.length - 1];
  if (!from) return null;
  return (to - from) / from;
}

export type Severity = 'info' | 'warn' | 'alert';

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** SA2 code to open when the card is clicked, when the insight is about one place. */
  regionCode?: string;
}

export function computeInsights(data: Dataset): Insight[] {
  const out: Insight[] = [];
  const { regions, summary, history } = data;
  const natWorking = summary.nationalRates.working ?? 0;
  const natPension = summary.nationalRates.pension ?? 0;

  const byWorking = rankable(regions, (r) => r.rateWorking).sort(
    (a, b) => (b.rateWorking as number) - (a.rateWorking as number),
  );

  // 1. Regions more than twice the national working-age rate.
  const double = byWorking.filter((r) => (r.rateWorking as number) >= natWorking * 2);
  if (double.length) {
    const top = double[0];
    out.push({
      id: 'double-national',
      severity: 'alert',
      title: `${double.length} areas have working-age income support at more than twice the national rate`,
      detail: `The national rate is ${formatPercent(natWorking)} of people aged 15–64. ${double.length} areas of 5,000+ residents sit at or above ${formatPercent(natWorking * 2)}, led by ${top.name} (${stateAbbr(top.state)}) at ${formatPercent(top.rateWorking)}.`,
      regionCode: top.code,
    });
  }

  // 2. The Pension Illusion, quantified on the single most extreme pair.
  const gaps = rankable(regions, (r) => r.rateHeadline)
    .filter((r) => r.rateWorking !== null)
    .map((r) => ({ r, gap: pensionGap(r) as number }))
    .filter((x) => Number.isFinite(x.gap));
  if (gaps.length) {
    const widest = gaps.slice().sort((a, b) => b.gap - a.gap)[0];
    out.push({
      id: 'pension-illusion',
      severity: 'info',
      title: `${widest.r.name} looks like a high-welfare area until you remove the Age Pension`,
      detail: `${formatPercent(widest.r.rateHeadline)} of residents receive an income support payment — but only ${formatPercent(widest.r.rateWorking)} of the working-age population do. The ${(widest.gap * 100).toFixed(1)}-point gap is age structure, not disadvantage: ${formatPercent(widest.r.ratePension)} of its 65+ residents are on the Age Pension.`,
      regionCode: widest.r.code,
    });
  }

  // 3. Age Pension take-up as a wealth signal.
  const takeUp = rankable(regions, (r) => r.ratePension).sort(
    (a, b) => (a.ratePension as number) - (b.ratePension as number),
  );
  if (takeUp.length >= 5) {
    const lowest = takeUp.slice(0, 5);
    out.push({
      id: 'self-funded',
      severity: 'info',
      title: `In ${lowest[0].name}, only ${formatPercent(lowest[0].ratePension)} of over-65s draw the Age Pension`,
      detail: `Nationally ${formatPercent(natPension)} of people aged 65+ receive it. The five lowest take-up areas — ${lowest.map((r) => r.name).join(', ')} — are among Australia's wealthiest suburbs, where retirees are largely self-funded. Low take-up is a wealth signal, not a lack of access.`,
      regionCode: lowest[0].code,
    });
  }

  // 4. DSP-dominant vs JobSeeker-dominant labour markets.
  const ratios = regions
    .filter((r) => r.pop >= RANK_FLOOR)
    .map((r) => ({ r, ratio: dspRatio(r) }))
    .filter((x) => x.ratio !== null) as { r: Region; ratio: number }[];
  if (ratios.length >= 4) {
    const sorted = ratios.slice().sort((a, b) => b.ratio - a.ratio);
    const hi = sorted[0];
    const lo = sorted[sorted.length - 1];
    out.push({
      id: 'dsp-vs-js',
      severity: 'info',
      title: `Two kinds of joblessness: ${hi.r.name} has ${hi.ratio.toFixed(1)} DSP recipients per JobSeeker, ${lo.r.name} has ${lo.ratio.toFixed(2)}`,
      detail: `Where long-term illness and injury dominate, the Disability Support Pension outnumbers JobSeeker. Where work is simply scarce — often remote communities — JobSeeker dominates instead. Both look identical in a headline welfare rate.`,
      regionCode: hi.r.code,
    });
  }

  // 5. Fastest-rising regions across the published quarters.
  const risers = regions
    .filter((r) => r.pop >= RANK_FLOOR && history.regions[r.code])
    .map((r) => ({ r, change: seriesChange(history.regions[r.code][2]) }))
    .filter((x) => x.change !== null && Number.isFinite(x.change as number)) as { r: Region; change: number }[];
  if (risers.length) {
    const top = risers.slice().sort((a, b) => b.change - a.change).slice(0, 3);
    const first = formatMonth(history.quarters[0]);
    const last = formatMonth(history.quarters[history.quarters.length - 1]);
    if (top[0] && top[0].change > 0) {
      out.push({
        id: 'fastest-rising',
        severity: 'warn',
        title: `${top[0].r.name} has the fastest-growing working-age caseload in the country`,
        detail: `Between ${first} and ${last}, working-age income support recipients there rose ${formatPercent(top[0].change, 0)}. Next fastest: ${top.slice(1).map((x) => `${x.r.name} (${formatPercent(x.change, 0)})`).join(', ')}. Growth this fast usually reflects population change as much as economic conditions — check the area's population before reading it as a downturn.`,
        regionCode: top[0].r.code,
      });
    }
  }

  // 6. Concentration: how much of the national caseload sits in how few areas.
  const sorted = regions.slice().sort((a, b) => b.wa - a.wa);
  const total = sorted.reduce((s, r) => s + r.wa, 0);
  if (total > 0) {
    let acc = 0;
    let count = 0;
    for (const r of sorted) {
      acc += r.wa;
      count++;
      if (acc >= total * 0.25) break;
    }
    out.push({
      id: 'concentration',
      severity: 'info',
      title: `A quarter of all working-age income support recipients live in just ${count} of ${formatNumber(regions.length)} areas`,
      detail: `${formatNumber(acc)} of ${formatNumber(total)} working-age recipients are concentrated in the ${count} highest-caseload SA2s — ${formatPercent(count / regions.length, 1)} of areas. Caseload concentration is partly population size and partly genuine clustering of disadvantage.`,
    });
  }

  // 7. Rent Assistance stress.
  const cra = rankable(regions, (r) => r.rateCra).sort(
    (a, b) => (b.rateCra as number) - (a.rateCra as number),
  );
  if (cra.length) {
    out.push({
      id: 'rent-assistance',
      severity: 'warn',
      title: `${cra[0].name} has the highest share of residents on Rent Assistance`,
      detail: `${formatPercent(cra[0].rateCra)} of everyone living there receives Commonwealth Rent Assistance, against ${formatPercent(summary.nationalRates.cra)} nationally. Rent Assistance only reaches renters who already receive a payment, so a high share means both renting and low income are widespread.`,
      regionCode: cra[0].code,
    });
  }

  return out;
}
