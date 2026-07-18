// Distribution histogram. Answers "is my suburb normal?" — the question a ranking
// cannot answer, because a ranking only ever shows the extremes. Clicking a bin
// hands those areas to the Explorer.

import type { ViewContext } from './types';
import { METRICS, METRIC_BY_KEY, type Metric } from '../data';
import { esc, formatNumber, formatPercent } from '../format';
import { histogram, linearScale, niceTicks, type Bin } from '../utils/scale';
import { median, quantile, rankable, RANK_FLOOR } from '../analysis';

const W = 1040;
const H = 480;
const M = { top: 26, right: 26, bottom: 58, left: 62 };

export interface BarRect { x: number; y: number; w: number; h: number }

/** Bar geometry for the histogram. Exported for the positional layout tests. */
export function layoutBars(bins: Bin[], w = W, h = H): BarRect[] {
  if (!bins.length) return [];
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const lo = bins[0].x0;
  const hi = bins[bins.length - 1].x1;
  const sx = linearScale(lo, hi, M.left, w - M.right);
  const sy = linearScale(0, maxCount, h - M.bottom, M.top);
  const gap = 1.5;
  return bins.map((b) => {
    const x0 = sx(b.x0);
    const x1 = sx(b.x1);
    const y = sy(b.count);
    return {
      x: x0 + gap / 2,
      w: Math.max(0, x1 - x0 - gap),
      y,
      h: Math.max(0, h - M.bottom - y),
    };
  });
}

export function renderDistribution(container: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  let metric: Metric = METRIC_BY_KEY.rateWorking;
  const BINS = 34;

  container.innerHTML = `
    <div class="view-intro">
      <h2>Distribution</h2>
      <p>How the ${formatNumber(data.regions.length)} areas of Australia spread out on each measure. Rankings only show
      the extremes; this shows where the bulk of the country actually sits, and how long the tail is. Click a bar to
      open those areas in the Explorer.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label for="ds-metric">Measure</label>
        <select id="ds-metric">${METRICS.filter((m) => m.rate).map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select>
      </div>
      <span class="note" style="margin:0">Areas under ${formatNumber(RANK_FLOOR)} residents excluded.</span>
    </div>
    <div class="stat-grid" id="ds-stats"></div>
    <div class="panel">
      <div class="panel-body">
        <div class="chart-wrap" id="ds-wrap"></div>
        <p class="chart-caption" id="ds-caption"></p>
      </div>
    </div>`;

  const wrap = container.querySelector('#ds-wrap') as HTMLElement;

  const draw = () => {
    const pool = rankable(data.regions, metric.get, RANK_FLOOR);
    const values = pool.map((r) => metric.get(r) as number);
    const bins = histogram(values, BINS);
    const rects = layoutBars(bins);
    const med = median(values);
    const p10 = quantile(values, 0.1);
    const p90 = quantile(values, 0.9);
    const nat = metric.natKey ? data.summary.nationalRates[metric.natKey] ?? null : null;

    const lo = bins.length ? bins[0].x0 : 0;
    const hi = bins.length ? bins[bins.length - 1].x1 : 1;
    const maxCount = Math.max(...bins.map((b) => b.count), 1);
    const sx = linearScale(lo, hi, M.left, W - M.right);
    const sy = linearScale(0, maxCount, H - M.bottom, M.top);
    const xTicks = niceTicks(lo, hi, 8);
    const yTicks = niceTicks(0, maxCount, 5);

    const bars = bins
      .map((b, i) => {
        const r = rects[i];
        const tip = `${formatPercent(b.x0)} – ${formatPercent(b.x1)}\n${formatNumber(b.count)} areas\n\nClick to list them`;
        return `<rect class="mark clickable" x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}"
          fill="#0f766e" fill-opacity="0.8" rx="1.5" data-bin="${i}" data-tip="${esc(tip)}"
          aria-label="${formatPercent(b.x0)} to ${formatPercent(b.x1)}: ${b.count} areas"></rect>`;
      })
      .join('');

    const marker = (v: number | null, colour: string, label: string) =>
      v === null || v < lo || v > hi
        ? ''
        : `<line x1="${sx(v).toFixed(1)}" y1="${M.top}" x2="${sx(v).toFixed(1)}" y2="${H - M.bottom}" stroke="${colour}" stroke-width="1.6" stroke-dasharray="5 3" />
           <text x="${(sx(v) + 5).toFixed(1)}" y="${M.top + 12}" font-size="11" fill="${colour}" font-weight="600">${esc(label)}</text>`;

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Histogram of ${esc(metric.label)} across Australian areas">
        ${yTicks.map((t) => `<line class="grid-line" x1="${M.left}" y1="${sy(t).toFixed(1)}" x2="${W - M.right}" y2="${sy(t).toFixed(1)}" />`).join('')}
        ${bars}
        ${marker(med, '#1e3a5f', `median area ${formatPercent(med)}`)}
        ${marker(nat, '#b45309', `national ${formatPercent(nat)}`)}
        <line class="axis-line" x1="${M.left}" y1="${H - M.bottom}" x2="${W - M.right}" y2="${H - M.bottom}" />
        <line class="axis-line" x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${H - M.bottom}" />
        ${xTicks.map((t) => `<text class="axis-label" x="${sx(t).toFixed(1)}" y="${H - M.bottom + 16}" text-anchor="middle">${formatPercent(t, 0)}</text>`).join('')}
        ${yTicks.map((t) => `<text class="axis-label" x="${M.left - 8}" y="${sy(t).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${formatNumber(t)}</text>`).join('')}
        <text class="axis-label" x="${(M.left + W - M.right) / 2}" y="${H - 14}" text-anchor="middle" font-weight="600">${esc(metric.label)} →</text>
        <text class="axis-label" x="${-(M.top + H - M.bottom) / 2}" y="15" text-anchor="middle" transform="rotate(-90)" font-weight="600">Number of areas</text>
      </svg>`;

    wrap.querySelectorAll('[data-bin]').forEach((rect) => {
      rect.addEventListener('click', () => {
        const bin = bins[Number(rect.getAttribute('data-bin'))];
        const codes = bin.items.map((i) => pool[i].code);
        ctx.setView('explorer', {
          codes,
          label: `${metric.short} ${formatPercent(bin.x0)}–${formatPercent(bin.x1)}`,
        });
      });
    });

    (container.querySelector('#ds-stats') as HTMLElement).innerHTML = `
      <div class="stat-tile"><div class="stat-label">Median area</div><div class="stat-value">${formatPercent(med)}</div><div class="stat-sub">half are below this</div></div>
      <div class="stat-tile"><div class="stat-label">National figure</div><div class="stat-value">${formatPercent(nat)}</div><div class="stat-sub">population-weighted</div></div>
      <div class="stat-tile"><div class="stat-label">10th–90th percentile</div><div class="stat-value" style="font-size:1.15rem">${formatPercent(p10)} – ${formatPercent(p90)}</div><div class="stat-sub">the middle 80% of areas</div></div>
      <div class="stat-tile"><div class="stat-label">Areas included</div><div class="stat-value">${formatNumber(pool.length)}</div><div class="stat-sub">of ${formatNumber(data.regions.length)}</div></div>`;

    (container.querySelector('#ds-caption') as HTMLElement).textContent =
      `${metric.blurb} The median area and the national figure differ because the national figure weights by population — ` +
      `a difference that itself says something about where people live.`;
  };

  (container.querySelector('#ds-metric') as HTMLSelectElement).addEventListener('change', (e) => {
    metric = METRIC_BY_KEY[(e.target as HTMLSelectElement).value] ?? metric;
    draw();
  });

  draw();
}
