// Positional layout tests, from patterns/tests/layout.test.ts.
//
// Area-conservation alone passes on visually broken layouts — a histogram that
// stacks every bar at x=0 conserves total area perfectly and renders as garbage.
// These assert POSITIONS: in-bounds, no NaN, no pairwise overlap, and flush
// adjacency where the layout claims to be contiguous.

import { describe, expect, it } from 'vitest';
import { histogram, linearScale, logScale, niceTicks, quantileBreaks, binIndex, rampColour, TEAL_RAMP } from '../src/utils/scale';
import { layoutBars } from '../src/views/distribution';
import { layoutScatter } from '../src/views/illusion';
import { sparkPath } from '../src/utils/spark';
import { familyShares } from '../src/views/mix';
import type { Region } from '../src/data';

const W = 1040;
const H = 480;

function makeRegion(i: number, over: Partial<Region> = {}): Region {
  return {
    code: `1000000${String(i).padStart(2, '0')}`,
    name: `Area ${i}`,
    sa3: 'SA3',
    sa4: 'SA4',
    gcc: 'GCC',
    state: 'New South Wales',
    pop: 6000 + i * 100,
    pop1564: 4000,
    pop65: 1200,
    is: 1000 + i,
    wa: 500 + i,
    rateHeadline: 0.1 + (i % 30) / 100,
    rateWorking: 0.08 + (i % 25) / 100,
    ratePension: 0.5,
    rateDsp: 0.05,
    rateJs: 0.04,
    rateCra: 0.05,
    payments: { ap: 500, dsp: 200, js: 150, cp: 80, pps: 40, yas: 20, sb: 10 },
    ...over,
  };
}

describe('histogram binning', () => {
  const values = Array.from({ length: 500 }, (_, i) => (i % 97) / 100);

  it('produces the requested number of bins', () => {
    expect(histogram(values, 20)).toHaveLength(20);
  });

  it('assigns every finite value to exactly one bin', () => {
    const bins = histogram(values, 20);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(values.length);
  });

  it('produces contiguous, non-overlapping bins that tile the domain', () => {
    const bins = histogram(values, 20);
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i].x0).toBeCloseTo(bins[i - 1].x1, 9);
    }
    expect(bins[0].x0).toBeCloseTo(Math.min(...values), 9);
    expect(bins[bins.length - 1].x1).toBeCloseTo(Math.max(...values), 9);
  });

  it('puts the maximum value in the last bin rather than overflowing', () => {
    const bins = histogram([0, 0.5, 1], 4);
    expect(bins[bins.length - 1].count).toBe(1);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it('never emits NaN boundaries, including for a single repeated value', () => {
    for (const b of histogram([0.2, 0.2, 0.2], 5)) {
      expect(Number.isNaN(b.x0)).toBe(false);
      expect(Number.isNaN(b.x1)).toBe(false);
    }
  });

  it('handles degenerate input', () => {
    expect(histogram([], 10)).toEqual([]);
    expect(histogram([1, 2], 0)).toEqual([]);
  });
});

describe('histogram bar layout', () => {
  const values = Array.from({ length: 300 }, (_, i) => (i % 53) / 100);
  const bins = histogram(values, 30);
  const rects = layoutBars(bins, W, H);

  it('emits one rect per bin', () => {
    expect(rects).toHaveLength(bins.length);
  });

  it('keeps every rect inside the canvas', () => {
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(W + 0.001);
      expect(r.y + r.h).toBeLessThanOrEqual(H + 0.001);
    }
  });

  it('emits no NaN or negative dimensions', () => {
    for (const r of rects) {
      expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
      expect(Number.isFinite(r.w) && Number.isFinite(r.h)).toBe(true);
      expect(r.w).toBeGreaterThanOrEqual(0);
      expect(r.h).toBeGreaterThanOrEqual(0);
    }
  });

  it('has no pairwise overlap between bars (>0.5px² fails)', () => {
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(ox * oy).toBeLessThan(0.5);
      }
    }
  });

  it('spaces bars evenly across the plot width', () => {
    const pitches: number[] = [];
    for (let i = 1; i < rects.length; i++) pitches.push(rects[i].x - rects[i - 1].x);
    const first = pitches[0];
    for (const p of pitches) expect(Math.abs(p - first)).toBeLessThan(0.01);
  });

  it('scales bar height with count — the tallest bar is the modal bin', () => {
    const tallest = rects.indexOf(rects.slice().sort((a, b) => b.h - a.h)[0]);
    const modal = bins.indexOf(bins.slice().sort((a, b) => b.count - a.count)[0]);
    expect(bins[tallest].count).toBe(bins[modal].count);
  });

  it('returns nothing for no bins', () => {
    expect(layoutBars([], W, H)).toEqual([]);
  });
});

describe('scatter layout', () => {
  const regions = Array.from({ length: 200 }, (_, i) => makeRegion(i));
  const { points, max } = layoutScatter(regions, 1000, 620);

  it('plots every eligible region', () => {
    expect(points).toHaveLength(regions.length);
  });

  it('keeps every point inside the canvas with finite coordinates', () => {
    for (const p of points) {
      expect(Number.isFinite(p.cx) && Number.isFinite(p.cy)).toBe(true);
      expect(p.cx).toBeGreaterThanOrEqual(0);
      expect(p.cy).toBeGreaterThanOrEqual(0);
      expect(p.cx).toBeLessThanOrEqual(1000);
      expect(p.cy).toBeLessThanOrEqual(620);
    }
  });

  it('uses a shared domain, so the diagonal is a true y = x line', () => {
    // A region on the diagonal in data space must land on the diagonal in pixels.
    const diag = layoutScatter([makeRegion(1, { rateHeadline: 0.2, rateWorking: 0.2 })], 1000, 620);
    const p = diag.points[0];
    const xFrac = (p.cx - 62) / (1000 - 26 - 62);
    const yFrac = (620 - 54 - p.cy) / (620 - 54 - 26);
    expect(Math.abs(xFrac - yFrac)).toBeLessThan(0.001);
  });

  it('orders points monotonically along each axis', () => {
    const a = layoutScatter([makeRegion(1, { rateHeadline: 0.1, rateWorking: 0.1 })], 1000, 620).points[0];
    const b = layoutScatter([makeRegion(2, { rateHeadline: 0.1, rateWorking: 0.1 })], 1000, 620).points[0];
    expect(a.cx).toBeCloseTo(b.cx, 6);
  });

  it('excludes regions below the population floor and suppressed rates', () => {
    const mixed = [
      makeRegion(1, { pop: 400 }),
      makeRegion(2, { rateWorking: null }),
      makeRegion(3),
    ];
    expect(layoutScatter(mixed).points).toHaveLength(1);
  });

  it('never produces a zero or negative domain', () => {
    expect(max).toBeGreaterThan(0);
    expect(layoutScatter([]).max).toBeGreaterThan(0);
  });
});

describe('scales', () => {
  it('maps a linear domain onto a range', () => {
    const s = linearScale(0, 10, 0, 100);
    expect(s(0)).toBe(0);
    expect(s(5)).toBe(50);
    expect(s(10)).toBe(100);
  });

  it('centres output rather than dividing by zero on a flat domain', () => {
    const s = linearScale(5, 5, 0, 100);
    expect(s(5)).toBe(50);
    expect(Number.isNaN(s(5))).toBe(false);
  });

  it('keeps zero on-canvas in a log scale', () => {
    const s = logScale(1, 1000, 0, 300);
    expect(Number.isFinite(s(0))).toBe(true);
    expect(s(1000)).toBeCloseTo(300, 5);
  });

  it('produces ascending, round tick values covering the domain', () => {
    const ticks = niceTicks(0, 0.62, 6);
    expect(ticks.length).toBeGreaterThan(2);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    expect(ticks[0]).toBeLessThanOrEqual(0.62);
  });

  it('degrades gracefully on an inverted or empty domain', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(10, 1)).toEqual([10]);
  });
});

describe('quantile colour breaks', () => {
  const values = Array.from({ length: 1000 }, (_, i) => i / 1000);

  it('produces one fewer break than bins', () => {
    expect(quantileBreaks(values, 7)).toHaveLength(6);
  });

  it('produces ascending breaks', () => {
    const b = quantileBreaks(values, 7);
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1]);
  });

  it('spreads values across every colour in the ramp', () => {
    const breaks = quantileBreaks(values, TEAL_RAMP.length);
    const used = new Set(values.map((v) => binIndex(v, breaks)));
    expect(used.size).toBe(TEAL_RAMP.length);
  });

  it('gives suppressed values the neutral colour, not the lowest ramp step', () => {
    const breaks = quantileBreaks(values, 7);
    expect(rampColour(null, breaks)).toBe('#f1f5f9');
    expect(rampColour(0.01, breaks)).toBe(TEAL_RAMP[0]);
  });

  it('handles an empty input', () => {
    expect(quantileBreaks([], 7)).toEqual([]);
  });
});

describe('sparkline geometry', () => {
  it('stays inside its box', () => {
    const g = sparkPath([5, 20, 3, 18, 9], 100, 24);
    const coords = [...g.path.matchAll(/([ML])([\d.]+),([\d.]+)/g)].map((m) => [Number(m[2]), Number(m[3])]);
    expect(coords.length).toBe(5);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(24);
    }
  });

  it('spans the full width, first point to last', () => {
    const g = sparkPath([1, 2, 3], 90, 20);
    expect(g.path).toMatch(/^M0(\.0+)?,/);
    expect(g.lastX).toBeCloseTo(90);
  });

  it('draws a flat series down the middle instead of dividing by zero', () => {
    const g = sparkPath([7, 7, 7], 80, 20);
    expect(g.path).toContain('10');
    expect(g.path).not.toContain('NaN');
  });

  it('handles empty and single-point series', () => {
    expect(sparkPath([], 80, 20).path).toBe('');
    expect(sparkPath([5], 80, 20).path).toContain('M0,10');
  });
});

describe('payment family shares', () => {
  it('sums to 1 across the families', () => {
    const { shares, total } = familyShares(makeRegion(1));
    expect(total).toBe(1000);
    const sum = Object.values(shares).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('never divides by zero for an area with no recipients', () => {
    const { shares, total } = familyShares(makeRegion(1, { payments: {} }));
    expect(total).toBe(0);
    for (const v of Object.values(shares)) expect(v).toBe(0);
  });

  it('groups JobSeeker and Youth Allowance (other) into one unemployment family', () => {
    const { shares } = familyShares(makeRegion(1, { payments: { js: 100, yao: 100 } }));
    expect(shares.unemployment).toBeCloseTo(1);
  });
});
