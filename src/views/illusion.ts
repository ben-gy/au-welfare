// The signature view: headline income support rate (x) against working-age rate (y).
//
// The whole point is that these two numbers disagree, and that the disagreement is
// systematic. Points below the diagonal are areas whose headline rate is inflated by
// Age Pensioners; points above it are areas whose working-age hardship is understated
// by the headline number. A one-dimensional map or ranking cannot show this.

import type { ViewContext } from './types';
import type { Region } from '../data';
import { esc, formatNumber, formatPercent, stateAbbr, STATE_LIST } from '../format';
import { linearScale, niceTicks } from '../utils/scale';
import { attachSvgZoom } from '../utils/svgZoom';
import { gloss } from '../glossary';
import { RANK_FLOOR } from '../analysis';

const W = 1000;
const H = 620;
const M = { top: 26, right: 26, bottom: 54, left: 62 };

interface Point { r: Region; x: number; y: number; cx: number; cy: number }

/** Lay out the scatter. Exported for the positional layout tests. */
export function layoutScatter(regions: Region[], w = W, h = H): { points: Point[]; max: number } {
  const usable = regions.filter(
    (r) => r.rateHeadline !== null && r.rateWorking !== null && r.pop >= RANK_FLOOR,
  );
  const max = Math.max(
    0.05,
    ...usable.map((r) => Math.max(r.rateHeadline as number, r.rateWorking as number)),
  );
  const sx = linearScale(0, max, M.left, w - M.right);
  const sy = linearScale(0, max, h - M.bottom, M.top);
  const points = usable.map((r) => ({
    r,
    x: r.rateHeadline as number,
    y: r.rateWorking as number,
    cx: sx(r.rateHeadline as number),
    cy: sy(r.rateWorking as number),
  }));
  return { points, max };
}

export function renderIllusion(container: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  let stateFilter = 'all';

  container.innerHTML = `
    <div class="view-intro">
      <h2>The ${gloss('pension illusion', 'Pension Illusion')}</h2>
      <p>Every dot is an area of ${formatNumber(RANK_FLOOR)}+ residents. Across the bottom: the share of
      <em>everyone</em> on an income support payment. Up the side: the share of <em>working-age</em> people on a
      payment other than the Age Pension. If those two measures agreed, every dot would sit on the diagonal.
      They do not — and which side of the line an area falls on tells you what kind of place it is.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label for="ill-state">State</label>
        <select id="ill-state">
          <option value="all">All of Australia</option>
          ${STATE_LIST.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select>
      </div>
      <span class="note" style="margin:0">Scroll to zoom · drag to pan · double-click to reset · click a dot for the area profile</span>
    </div>
    <div class="panel">
      <div class="panel-body">
        <div class="chart-wrap" id="ill-wrap"></div>
        <div class="legend">
          <span class="legend-item"><span class="legend-swatch" style="background:#c2410c"></span>Below the line — the Age Pension inflates the headline rate (retirement areas)</span>
          <span class="legend-item"><span class="legend-swatch" style="background:#0f766e"></span>Above the line — working-age hardship exceeds the headline rate</span>
          <span class="legend-item"><span class="legend-swatch" style="background:#94a3b8"></span>Dot size: population</span>
        </div>
        <p class="chart-caption" id="ill-caption"></p>
      </div>
    </div>
    <div class="two-col" style="margin-top:var(--space-lg)">
      <div class="panel"><div class="panel-head"><h2>Furthest below the line</h2>
        <p>Headline rate most inflated by Age Pensioners. These are retirement destinations, not distressed economies.</p></div>
        <div class="panel-body"><div class="rank-list" id="ill-below"></div></div></div>
      <div class="panel"><div class="panel-head"><h2>Furthest above the line</h2>
        <p>Working-age hardship most understated by the headline rate — young populations carrying heavy caseloads.</p></div>
        <div class="panel-body"><div class="rank-list" id="ill-above"></div></div></div>
    </div>`;

  const wrap = container.querySelector('#ill-wrap') as HTMLElement;
  wrap.style.position = 'relative';

  const draw = () => {
    const pool = stateFilter === 'all' ? data.regions : data.regions.filter((r) => r.state === stateFilter);
    const { points, max } = layoutScatter(pool);
    const sx = linearScale(0, max, M.left, W - M.right);
    const sy = linearScale(0, max, H - M.bottom, M.top);
    const ticks = niceTicks(0, max, 6);

    const maxPop = Math.max(...points.map((p) => p.r.pop), 1);
    const radius = (pop: number) => 2 + Math.sqrt(pop / maxPop) * 8;

    const dots = points
      .slice()
      .sort((a, b) => b.r.pop - a.r.pop)
      .map((p) => {
        const gap = p.y - p.x;
        const colour = gap >= 0 ? '#0f766e' : '#c2410c';
        const tip = [
          p.r.name + ' (' + stateAbbr(p.r.state) + ')',
          `All income support: ${formatPercent(p.x)}`,
          `Working-age: ${formatPercent(p.y)}`,
          `Age Pension take-up: ${formatPercent(p.r.ratePension)}`,
          `Population: ${formatNumber(p.r.pop)}`,
        ].join('\n');
        return `<circle class="mark clickable" cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="${radius(p.r.pop).toFixed(1)}"
          fill="${colour}" fill-opacity="0.5" stroke="${colour}" stroke-width="0.7"
          data-code="${p.r.code}" data-tip="${esc(tip)}" aria-label="${esc(p.r.name)}"></circle>`;
      })
      .join('');

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
           aria-label="Scatter plot of headline against working-age income support rates for ${points.length} areas">
        ${ticks
          .map(
            (t) => `<line class="grid-line" x1="${sx(t).toFixed(1)}" y1="${M.top}" x2="${sx(t).toFixed(1)}" y2="${H - M.bottom}" />
                    <line class="grid-line" x1="${M.left}" y1="${sy(t).toFixed(1)}" x2="${W - M.right}" y2="${sy(t).toFixed(1)}" />`,
          )
          .join('')}
        <line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(max)}" y2="${sy(max)}" stroke="#10203a" stroke-width="1.4" stroke-dasharray="6 4" />
        <text x="${sx(max) - 8}" y="${sy(max) + 18}" text-anchor="end" font-size="11" fill="#10203a" font-weight="600">
          the two measures agree
        </text>
        ${dots}
        <line class="axis-line" x1="${M.left}" y1="${H - M.bottom}" x2="${W - M.right}" y2="${H - M.bottom}" />
        <line class="axis-line" x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${H - M.bottom}" />
        ${ticks
          .map(
            (t) => `<text class="axis-label" x="${sx(t).toFixed(1)}" y="${H - M.bottom + 16}" text-anchor="middle">${formatPercent(t, 0)}</text>
                    <text class="axis-label" x="${M.left - 8}" y="${sy(t).toFixed(1) }" text-anchor="end" dominant-baseline="middle">${formatPercent(t, 0)}</text>`,
          )
          .join('')}
        <text class="axis-label" x="${(M.left + W - M.right) / 2}" y="${H - 12}" text-anchor="middle" font-weight="600">
          All income support recipients, share of total population →
        </text>
        <text class="axis-label" x="${-(M.top + H - M.bottom) / 2}" y="16" text-anchor="middle" transform="rotate(-90)" font-weight="600">
          Working-age recipients, share of 15–64 population →
        </text>
      </svg>`;

    const svg = wrap.querySelector('svg') as SVGSVGElement;
    attachSvgZoom(svg, { maxScale: 14 });
    svg.addEventListener('click', (e) => {
      const code = (e.target as Element)?.getAttribute?.('data-code');
      if (code) ctx.openRegion(code);
    });

    (container.querySelector('#ill-caption') as HTMLElement).textContent =
      `${formatNumber(points.length)} areas of ${formatNumber(RANK_FLOOR)}+ residents. ` +
      `Areas below the dashed line have more retirees than their working-age caseload implies; areas above it have ` +
      `proportionally more working-age recipients than the headline suggests. Dot area is proportional to population.`;

    // Ranked side panels — the same data, read as a list.
    const gaps = points
      .map((p) => ({ r: p.r, gap: p.x - p.y }))
      .sort((a, b) => b.gap - a.gap);
    const renderSide = (el: HTMLElement, rows: { r: Region; gap: number }[], colour: string) => {
      const max2 = Math.max(...rows.map((x) => Math.abs(x.gap)), 0.001);
      el.innerHTML = rows
        .map(
          (x, i) => `<div class="rank-row" data-code="${x.r.code}" role="button" tabindex="0"
            data-tip="${esc(`${x.r.name}\nAll income support: ${formatPercent(x.r.rateHeadline)}\nWorking-age: ${formatPercent(x.r.rateWorking)}`)}">
            <span class="rank-num">${i + 1}</span>
            <span class="rank-name">${esc(x.r.name)}<span class="rank-sub">${esc(stateAbbr(x.r.state))}</span></span>
            <span class="rank-track"><span class="rank-fill" style="width:${((Math.abs(x.gap) / max2) * 100).toFixed(1)}%;background:${colour}"></span></span>
            <span class="rank-value">${(x.gap * 100).toFixed(1)}pp</span>
          </div>`,
        )
        .join('');
      el.querySelectorAll('.rank-row').forEach((row) => {
        const handler = () => ctx.openRegion(row.getAttribute('data-code') as string);
        row.addEventListener('click', handler);
        row.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') handler();
        });
      });
    };
    renderSide(container.querySelector('#ill-below') as HTMLElement, gaps.slice(0, 10), '#c2410c');
    renderSide(
      container.querySelector('#ill-above') as HTMLElement,
      gaps.slice(-10).reverse(),
      '#0f766e',
    );
  };

  draw();
  (container.querySelector('#ill-state') as HTMLSelectElement).addEventListener('change', (e) => {
    stateFilter = (e.target as HTMLSelectElement).value;
    draw();
  });
}
