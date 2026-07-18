// Colour and layout scales. Pure — covered by tests/scale.test.ts.

/** Single-hue teal ramp. Sequential, light-to-dark, colour-blind safe.
 *  Deliberately not red/green: high welfare receipt is a fact about a place,
 *  not a failing, and a red ramp editorialises. */
export const TEAL_RAMP = ['#e8f4f2', '#c3e3de', '#93cdc5', '#5fb3a8', '#35948a', '#1e746c', '#0f4f49'];

/** Diverging ramp for "above / below the national figure" comparisons. */
export const DIVERGING = ['#1e5f8f', '#5b93b8', '#a9c7da', '#e8e8e8', '#f0c39a', '#d99050', '#b45309'];

/**
 * Quantile break points for a set of values, producing `count` bins.
 * Quantiles (not equal intervals) because welfare rates are heavily
 * right-skewed: equal intervals would leave 95% of areas in the first colour.
 */
export function quantileBreaks(values: number[], count: number): number[] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const breaks: number[] = [];
  for (let i = 1; i < count; i++) {
    const pos = (v.length - 1) * (i / count);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    breaks.push(lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (pos - lo));
  }
  return breaks;
}

/** Index into a ramp for `value`, given ascending break points. */
export function binIndex(value: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && value >= breaks[i]) i++;
  return i;
}

export function rampColour(value: number | null, breaks: number[], ramp: string[] = TEAL_RAMP): string {
  if (value === null || !Number.isFinite(value)) return '#f1f5f9';
  return ramp[Math.min(ramp.length - 1, binIndex(value, breaks))];
}

/** Linear map from a data domain onto a pixel range, guarding a zero-width domain. */
export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (!Number.isFinite(span) || span === 0) return () => (r0 + r1) / 2;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Log10 scale that keeps zero/negative inputs on-canvas at the low end. */
export function logScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const lo = Math.log10(Math.max(d0, 1e-6));
  const hi = Math.log10(Math.max(d1, d0 * 1.0001, 1e-6));
  const lin = linearScale(lo, hi, r0, r1);
  return (v: number) => lin(Math.log10(Math.max(v, 1e-6)));
}

/** "Nice" round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const span = max - min;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-6; t += step) {
    ticks.push(Math.round(t / step) * step);
  }
  return ticks;
}

export interface Bin { x0: number; x1: number; count: number; items: number[] }

/**
 * Equal-width histogram bins over [min, max]. Returns contiguous, non-overlapping
 * bins whose counts sum to the number of finite inputs — asserted in the layout tests.
 */
export function histogram(values: number[], binCount: number, min?: number, max?: number): Bin[] {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length || binCount < 1) return [];
  const lo = min ?? Math.min(...v);
  const hi = max ?? Math.max(...v);
  const span = hi - lo || 1;
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
    x0: lo + (span * i) / binCount,
    x1: lo + (span * (i + 1)) / binCount,
    count: 0,
    items: [],
  }));
  for (let i = 0; i < v.length; i++) {
    let idx = Math.floor(((v[i] - lo) / span) * binCount);
    if (idx >= binCount) idx = binCount - 1; // the max value belongs in the last bin
    if (idx < 0) idx = 0;
    bins[idx].count++;
    bins[idx].items.push(i);
  }
  return bins;
}
