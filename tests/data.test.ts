// Tests for the column-table expansion and the pipeline's pure parsers. They are
// imported straight from pipeline/parse.mjs so the shipped parser is what gets
// tested, not a copy of it. parse.mjs is deliberately dependency-free (node
// builtins only) — importing aggregate.mjs here would drag mapshaper, a
// pipeline-only dependency, into the frontend test run and break CI.

import { describe, expect, it } from 'vitest';
import { expandRegions, METRICS, METRIC_BY_KEY } from '../src/data';
import {
  csvObjects,
  incomeSupportTotal,
  num,
  parseCsv,
  parseErp,
  safeRate,
  serialToMonth,
  MIN_DENOM,
} from '../pipeline/parse.mjs';

describe('expandRegions', () => {
  const table = {
    cols: ['code', 'name', 'sa3', 'sa4', 'gcc', 'state', 'pop', 'pop1564', 'pop65', 'is', 'wa',
      'rateHeadline', 'rateWorking', 'ratePension', 'rateDsp', 'rateJs', 'rateCra', 'ap', 'dsp', 'js'],
    rows: [
      ['101021007', 'Braidwood', 'Queanbeyan', 'Capital Region', 'Rest of NSW', 'New South Wales',
        4200, 2500, 1100, 900, 400, 0.214, 0.16, 0.49, 0.06, 0.05, 0.04, 500, 150, 125],
      ['101021008', 'Karabar', 'Queanbeyan', 'Capital Region', 'Rest of NSW', 'New South Wales',
        9800, 6400, 1500, 1600, 850, null, 0.133, null, 0.05, 0.04, 0.05, 750, 320, 260],
    ],
  };

  it('expands every row', () => {
    expect(expandRegions(table)).toHaveLength(2);
  });

  it('maps fixed columns onto typed fields', () => {
    const [r] = expandRegions(table);
    expect(r.code).toBe('101021007');
    expect(r.name).toBe('Braidwood');
    expect(r.pop).toBe(4200);
    expect(r.rateWorking).toBeCloseTo(0.16);
  });

  it('collects the remaining columns as payments', () => {
    const [r] = expandRegions(table);
    expect(r.payments).toEqual({ ap: 500, dsp: 150, js: 125 });
  });

  it('preserves suppressed rates as null rather than coercing to 0', () => {
    const r = expandRegions(table)[1];
    expect(r.rateHeadline).toBeNull();
    expect(r.ratePension).toBeNull();
    expect(r.rateWorking).toBeCloseTo(0.133);
  });

  it('handles an empty table', () => {
    expect(expandRegions({ cols: table.cols, rows: [] })).toEqual([]);
  });
});

describe('metric definitions', () => {
  it('exposes every metric by key', () => {
    for (const m of METRICS) expect(METRIC_BY_KEY[m.key]).toBe(m);
  });
  it('gives every metric a denominator description and a blurb', () => {
    for (const m of METRICS) {
      expect(m.denom.length).toBeGreaterThan(3);
      expect(m.blurb.length).toBeGreaterThan(20);
    }
  });

  // Regression: rate metrics are keyed on the Region field ('rateWorking') while
  // summary.nationalRates uses short names ('working'). Looking the national figure
  // up by metric.key silently rendered an em dash in the Rankings and Distribution
  // stat tiles. Every rate metric must map to a real nationalRates key.
  it('maps every rate metric to a national figure that exists', () => {
    const nationalRateKeys = ['headline', 'working', 'pension', 'dsp', 'js', 'cra'];
    for (const m of METRICS.filter((x) => x.rate)) {
      expect(m.natKey).not.toBeNull();
      expect(nationalRateKeys).toContain(m.natKey as string);
    }
  });

  it('leaves headcount metrics without a national rate', () => {
    expect(METRIC_BY_KEY.is.natKey).toBeNull();
  });
});

describe('pipeline: CSV parsing', () => {
  it('splits simple rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('respects quoted fields containing commas', () => {
    const rows = parseCsv('DATE,NAME,N\n2026-03,"Sydney (C), Inner",50\n');
    expect(rows[1]).toEqual(['2026-03', 'Sydney (C), Inner', '50']);
  });

  it('handles escaped double quotes', () => {
    const rows = parseCsv('quote,who\n"He said ""hi""",Ben\n');
    expect(rows[1]).toEqual(['He said "hi"', 'Ben']);
  });

  it('drops single-column rows, which in DSS files are trailing footnotes', () => {
    const rows = parseCsv('a,b\n1,2\nSource: DSS\n');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('tolerates CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('builds objects keyed by trimmed header', () => {
    const objs = csvObjects('DATE, NAME\n2026-03, Braidwood\n');
    expect(objs[0]).toEqual({ DATE: '2026-03', NAME: 'Braidwood' });
  });
});

describe('pipeline: num', () => {
  it('parses plain and separated integers', () => {
    expect(num('1735')).toBe(1735);
    expect(num('17,355')).toBe(17355);
  });
  it('treats DSS blanks and placeholders as zero', () => {
    expect(num('')).toBe(0);
    expect(num('np')).toBe(0);
    expect(num('..')).toBe(0);
    expect(num(undefined)).toBe(0);
  });
  it('does not turn junk into NaN', () => {
    expect(num('banana')).toBe(0);
  });
});

describe('pipeline: safeRate', () => {
  it('computes and rounds a rate', () => {
    expect(safeRate(1574, 10000)).toBeCloseTo(0.1574);
  });
  it('suppresses rates whose denominator is below the floor', () => {
    expect(safeRate(5, 1, MIN_DENOM.senior)).toBeNull();
    expect(safeRate(5, 199, MIN_DENOM.senior)).toBeNull();
    expect(safeRate(100, 200, MIN_DENOM.senior)).toBeCloseTo(0.5);
  });
  it('suppresses on a zero or negative denominator', () => {
    expect(safeRate(10, 0)).toBeNull();
    expect(safeRate(10, -5)).toBeNull();
  });
});

describe('pipeline: incomeSupportTotal', () => {
  it('sums only the mutually exclusive income support payments', () => {
    const vals = { ap: 100, dsp: 50, js: 25, cra: 999, ftba: 999, pcc: 999, hcc: 999 };
    expect(incomeSupportTotal(vals)).toBe(175);
  });
  it('is zero for an area with no recipients', () => {
    expect(incomeSupportTotal({})).toBe(0);
  });
});

describe('pipeline: serialToMonth', () => {
  it('converts the Excel serial epoch correctly', () => {
    expect(serialToMonth(40909)).toBe('2012-01');
  });
  it('converts a recent month', () => {
    expect(serialToMonth(46173)).toBe('2026-05');
  });
});

describe('pipeline: parseErp', () => {
  const csv = [
    'DATAFLOW,MEASURE,SEX,AGE,REGION_TYPE,ASGS_2021,FREQ,TIME_PERIOD,OBS_VALUE',
    'X,ERP,3,TOT,SA2,101021007,A,2024,4200',
    'X,ERP,3,A15,SA2,101021007,A,2024,1000',
    'X,ERP,3,A20,SA2,101021007,A,2024,1500',
    'X,ERP,3,A65,SA2,101021007,A,2024,700',
    'X,ERP,3,A70,SA2,101021007,A,2024,400',
    // an older vintage that must be ignored entirely
    'X,ERP,3,TOT,SA2,101021007,A,2023,4000',
  ].join('\n');

  it('keeps only the newest vintage', () => {
    const { year, pop } = parseErp(csv);
    expect(year).toBe(2024);
    expect(pop.get('101021007')?.total).toBe(4200);
  });

  it('sums the working-age and senior age bands', () => {
    const { pop } = parseErp(csv);
    expect(pop.get('101021007')?.working).toBe(2500);
    expect(pop.get('101021007')?.senior).toBe(1100);
  });

  it('returns an empty map for input with no rows', () => {
    const header = 'DATAFLOW,MEASURE,SEX,AGE,REGION_TYPE,ASGS_2021,FREQ,TIME_PERIOD,OBS_VALUE';
    expect(parseErp(header).pop.size).toBe(0);
  });
});
