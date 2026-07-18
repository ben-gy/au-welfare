import { describe, expect, it } from 'vitest';
import { dspRatio, median, pensionGap, quantile, rankable, seriesChange, computeInsights } from '../src/analysis';
import type { Dataset, Region } from '../src/data';

function region(over: Partial<Region> = {}): Region {
  return {
    code: '100000001',
    name: 'Testville',
    sa3: 'Test SA3',
    sa4: 'Test SA4',
    gcc: 'Greater Test',
    state: 'New South Wales',
    pop: 10000,
    pop1564: 6500,
    pop65: 1800,
    is: 2000,
    wa: 1000,
    rateHeadline: 0.2,
    rateWorking: 0.15,
    ratePension: 0.55,
    rateDsp: 0.05,
    rateJs: 0.05,
    rateCra: 0.05,
    payments: { ap: 1000, dsp: 325, js: 325, cp: 100, cra: 500 },
    ...over,
  };
}

describe('median', () => {
  it('returns the middle of an odd-length set', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('averages the middle pair of an even-length set', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('ignores non-finite values', () => {
    expect(median([1, NaN, 3])).toBe(2);
  });
  it('returns null for an empty set', () => {
    expect(median([])).toBeNull();
  });
});

describe('quantile', () => {
  const v = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it('finds the median at q=0.5', () => {
    expect(quantile(v, 0.5)).toBe(5);
  });
  it('finds the extremes', () => {
    expect(quantile(v, 0)).toBe(0);
    expect(quantile(v, 1)).toBe(10);
  });
  it('interpolates between points', () => {
    expect(quantile([0, 10], 0.25)).toBeCloseTo(2.5);
  });
  it('clamps out-of-range q rather than returning undefined', () => {
    expect(quantile(v, 5)).toBe(10);
    expect(quantile(v, -3)).toBe(0);
  });
  it('returns null for an empty set', () => {
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe('rankable', () => {
  it('excludes areas below the population floor', () => {
    const rows = [region({ pop: 400 }), region({ code: 'b', pop: 9000 })];
    expect(rankable(rows, (r) => r.rateWorking).map((r) => r.code)).toEqual(['b']);
  });
  it('excludes suppressed (null) metrics', () => {
    const rows = [region({ rateWorking: null }), region({ code: 'b' })];
    expect(rankable(rows, (r) => r.rateWorking).map((r) => r.code)).toEqual(['b']);
  });
  it('respects a custom floor', () => {
    expect(rankable([region({ pop: 2000 })], (r) => r.rateWorking, 1000)).toHaveLength(1);
  });
});

describe('pensionGap', () => {
  it('is positive where the headline rate overstates working-age hardship', () => {
    expect(pensionGap(region({ rateHeadline: 0.4, rateWorking: 0.25 }))).toBeCloseTo(0.15);
  });
  it('is negative where working-age hardship exceeds the headline', () => {
    expect(pensionGap(region({ rateHeadline: 0.46, rateWorking: 0.6 }))).toBeCloseTo(-0.14);
  });
  it('returns null when either rate is suppressed', () => {
    expect(pensionGap(region({ rateWorking: null }))).toBeNull();
  });
});

describe('dspRatio', () => {
  it('divides DSP by JobSeeker', () => {
    expect(dspRatio(region({ payments: { dsp: 900, js: 500 } }))).toBeCloseTo(1.8);
  });
  it('returns null when either side is too small to be meaningful', () => {
    expect(dspRatio(region({ payments: { dsp: 900, js: 50 } }))).toBeNull();
    expect(dspRatio(region({ payments: { dsp: 10, js: 500 } }))).toBeNull();
  });
  it('returns null when payments are missing entirely', () => {
    expect(dspRatio(region({ payments: {} }))).toBeNull();
  });
});

describe('seriesChange', () => {
  it('computes growth across a series', () => {
    expect(seriesChange([100, 110, 150])).toBeCloseTo(0.5);
  });
  it('computes decline', () => {
    expect(seriesChange([200, 150, 100])).toBeCloseTo(-0.5);
  });
  it('returns null when the series starts at zero', () => {
    expect(seriesChange([0, 50])).toBeNull();
  });
  it('returns null for a series too short to compare', () => {
    expect(seriesChange([5])).toBeNull();
    expect(seriesChange([])).toBeNull();
  });
});

describe('computeInsights', () => {
  function dataset(regions: Region[]): Dataset {
    return {
      summary: {
        generated: '2026-07-18T00:00:00Z',
        latestQuarter: '2026-03',
        quarters: ['2025-03', '2026-03'],
        cedQuarters: ['2026-03'],
        cedLatest: '2026-03',
        erpYear: 2024,
        minDenom: { total: 500, working: 400, senior: 200 },
        suppressed: { headline: 0, working: 0, pension: 0 },
        regionCount: regions.length,
        electorateCount: 150,
        totals: { ap: 1000, dsp: 100, js: 100, cra: 100 },
        incomeSupportTotal: 2000,
        workingAgeTotal: 1000,
        population: { total: 20000, working: 13000, senior: 3600 },
        nationalRates: { headline: 0.2, working: 0.15, pension: 0.55, dsp: 0.05, js: 0.05, cra: 0.05 },
      },
      regions,
      byCode: new Map(regions.map((r) => [r.code, r])),
      history: {
        quarters: ['2025-03', '2026-03'],
        series: ['is', 'ap', 'wa', 'dsp', 'js'],
        regions: Object.fromEntries(
          regions.map((r) => [r.code, [[r.is, r.is], [500, 500], [r.wa, Math.round(r.wa * 1.4)], [100, 100], [100, 100]]]),
        ),
      },
      electorates: [],
      national: { months: ['2026-03'], series: { ap: [1000] } },
    };
  }

  it('flags areas at more than twice the national working-age rate', () => {
    const data = dataset([
      region({ code: 'a', name: 'Highplace', rateWorking: 0.4 }),
      region({ code: 'b', name: 'Normalville', rateWorking: 0.14 }),
    ]);
    const found = computeInsights(data).find((i) => i.id === 'double-national');
    expect(found).toBeDefined();
    expect(found?.title).toContain('1 areas');
    expect(found?.regionCode).toBe('a');
  });

  it('identifies the widest pension gap and links to that area', () => {
    const data = dataset([
      region({ code: 'a', name: 'Retireville', rateHeadline: 0.42, rateWorking: 0.2 }),
      region({ code: 'b', name: 'Youngtown', rateHeadline: 0.3, rateWorking: 0.32 }),
    ]);
    const found = computeInsights(data).find((i) => i.id === 'pension-illusion');
    expect(found?.regionCode).toBe('a');
    expect(found?.title).toContain('Retireville');
  });

  it('names the lowest Age Pension take-up areas', () => {
    const rows = [0.12, 0.2, 0.3, 0.4, 0.5, 0.6].map((v, i) =>
      region({ code: `r${i}`, name: `Area${i}`, ratePension: v }),
    );
    const found = computeInsights(dataset(rows)).find((i) => i.id === 'self-funded');
    expect(found?.regionCode).toBe('r0');
    expect(found?.title).toContain('Area0');
  });

  it('produces no insight cards without crashing on an empty dataset', () => {
    expect(() => computeInsights(dataset([]))).not.toThrow();
  });

  it('every insight carries a title, detail and known severity', () => {
    const data = dataset([
      region({ code: 'a', name: 'A', rateWorking: 0.45, ratePension: 0.2 }),
      region({ code: 'b', name: 'B', rateWorking: 0.1, ratePension: 0.8 }),
    ]);
    for (const i of computeInsights(data)) {
      expect(i.title.length).toBeGreaterThan(10);
      expect(i.detail.length).toBeGreaterThan(20);
      expect(['info', 'warn', 'alert']).toContain(i.severity);
    }
  });
});
