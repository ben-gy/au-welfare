import { describe, expect, it } from 'vitest';
import {
  esc,
  formatCompact,
  formatDelta,
  formatMonth,
  formatNumber,
  formatPercent,
  percentChange,
  slugify,
  stateAbbr,
} from '../src/format';

describe('formatNumber', () => {
  it('formats thousands with separators', () => {
    expect(formatNumber(5413145)).toBe('5,413,145');
  });
  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
  it('handles negatives', () => {
    expect(formatNumber(-1234)).toBe('-1,234');
  });
  it('renders decimals when asked', () => {
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
  });
  it('renders an em dash for null/undefined/NaN', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('converts a fraction to a percentage', () => {
    expect(formatPercent(0.1574)).toBe('15.7%');
  });
  it('respects the decimal count', () => {
    expect(formatPercent(0.559, 0)).toBe('56%');
  });
  it('handles zero and one', () => {
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(1)).toBe('100.0%');
  });
  it('renders suppressed rates as an em dash', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatCompact', () => {
  it('abbreviates millions', () => {
    expect(formatCompact(5413145)).toBe('5.41m');
    expect(formatCompact(2500000)).toBe('2.50m');
  });
  it('abbreviates tens of thousands without decimals', () => {
    expect(formatCompact(12800)).toBe('13k');
  });
  it('keeps one decimal in the low thousands', () => {
    expect(formatCompact(1500)).toBe('1.5k');
  });
  it('passes small numbers through', () => {
    expect(formatCompact(240)).toBe('240');
  });
  it('handles null', () => {
    expect(formatCompact(null)).toBe('—');
  });
});

describe('formatMonth', () => {
  it('renders a DSS quarter', () => {
    expect(formatMonth('2026-03')).toBe('Mar 2026');
  });
  it('handles December', () => {
    expect(formatMonth('2012-12')).toBe('Dec 2012');
  });
  it('passes through malformed input rather than throwing', () => {
    expect(formatMonth('nonsense')).toBe('nonsense');
    expect(formatMonth('2026-13')).toBe('2026-13');
  });
});

describe('formatDelta', () => {
  it('signs a positive difference', () => {
    expect(formatDelta(0.2, 0.15)).toBe('+5.0pp');
  });
  it('signs a negative difference', () => {
    expect(formatDelta(0.1, 0.15)).toBe('-5.0pp');
  });
  it('handles a suppressed value', () => {
    expect(formatDelta(null, 0.15)).toBe('—');
  });
});

describe('percentChange', () => {
  it('computes growth', () => {
    expect(percentChange(100, 150)).toBeCloseTo(0.5);
  });
  it('computes decline', () => {
    expect(percentChange(200, 100)).toBeCloseTo(-0.5);
  });
  it('returns null when the base is zero', () => {
    expect(percentChange(0, 50)).toBeNull();
  });
});

describe('esc', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('<script>"x"&</script>')).toBe('&lt;script&gt;&quot;x&quot;&amp;&lt;/script&gt;');
  });
  it('handles null', () => {
    expect(esc(null)).toBe('');
  });
});

describe('stateAbbr / slugify', () => {
  it('abbreviates ABS long-form state names', () => {
    expect(stateAbbr('New South Wales')).toBe('NSW');
    expect(stateAbbr('Australian Capital Territory')).toBe('ACT');
  });
  it('passes unknown names through', () => {
    expect(stateAbbr('Atlantis')).toBe('Atlantis');
  });
  it('slugifies names with punctuation', () => {
    expect(slugify('Rose Bay - Vaucluse (South)')).toBe('rose-bay-vaucluse-south');
  });
});
