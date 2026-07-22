// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Leaderboard. Ranks areas on any metric, colour-coded against the national median,
// with a population floor because DSS rounding makes small-area rates unreliable.

import type { ViewContext } from './types';
import { METRICS, METRIC_BY_KEY, type Metric } from '../data';
import { esc, formatNumber, formatPercent, stateAbbr, STATE_LIST } from '../format';
import { median, rankable } from '../analysis';
import { gloss } from '../glossary';

const STORE_METRIC = 'au-welfare.rank.metric';
const FLOORS = [1000, 5000, 10000, 25000];

export function renderRankings(container: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  let metric: Metric = METRIC_BY_KEY[localStorage.getItem(STORE_METRIC) ?? ''] ?? METRIC_BY_KEY.rateWorking;
  let floor = 5000;
  let stateFilter = 'all';
  let direction: 'high' | 'low' = 'high';

  container.innerHTML = `
    <div class="view-intro">
      <h2>Rankings</h2>
      <p>The highest and lowest areas on any measure. Bars are coloured against the national median, so you can
      see at a glance how far from typical the top of the list sits. Small areas are excluded by default —
      DSS ${gloss('rounding', 'rounds counts to the nearest 5')}, which makes rates in tiny areas jump around.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label for="rk-metric">Measure</label>
        <select id="rk-metric">${METRICS.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select>
      </div>
      <div class="control-group">
        <label for="rk-state">State</label>
        <select id="rk-state">
          <option value="all">All</option>
          ${STATE_LIST.map((s) => `<option value="${esc(s)}">${esc(stateAbbr(s))}</option>`).join('')}
        </select>
      </div>
      <div class="control-group">
        <label for="rk-floor">Min population</label>
        <select id="rk-floor">${FLOORS.map((f) => `<option value="${f}">${formatNumber(f)}</option>`).join('')}</select>
      </div>
      <div class="control-group">
        <label>Order</label>
        <div class="chip-row">
          <button class="chip" data-dir="high" aria-pressed="true">Highest</button>
          <button class="chip" data-dir="low" aria-pressed="false">Lowest</button>
        </div>
      </div>
    </div>
    <div class="stat-grid" id="rk-stats"></div>
    <div class="panel">
      <div class="panel-head"><h2 id="rk-title"></h2><p id="rk-sub"></p></div>
      <div class="panel-body"><div class="rank-list" id="rk-list"></div></div>
    </div>`;

  const metricSel = container.querySelector('#rk-metric') as HTMLSelectElement;
  const stateSel = container.querySelector('#rk-state') as HTMLSelectElement;
  const floorSel = container.querySelector('#rk-floor') as HTMLSelectElement;
  metricSel.value = metric.key;
  floorSel.value = String(floor);

  const draw = () => {
    const pool = stateFilter === 'all' ? data.regions : data.regions.filter((r) => r.state === stateFilter);
    const eligible = rankable(pool, metric.get, floor);
    const values = eligible.map((r) => metric.get(r) as number);
    const med = median(values);
    const sorted = eligible
      .slice()
      .sort((a, b) =>
        direction === 'high'
          ? (metric.get(b) as number) - (metric.get(a) as number)
          : (metric.get(a) as number) - (metric.get(b) as number),
      )
      .slice(0, 40);

    const fmt = (v: number | null) => (metric.rate ? formatPercent(v) : formatNumber(v));
    const maxVal = Math.max(...sorted.map((r) => metric.get(r) as number), 0.0001);

    (container.querySelector('#rk-title') as HTMLElement).textContent =
      `${direction === 'high' ? 'Highest' : 'Lowest'} 40 — ${metric.label}`;
    (container.querySelector('#rk-sub') as HTMLElement).textContent =
      `${metric.blurb} Measured as ${metric.denom}. ${formatNumber(eligible.length)} areas qualify at a ${formatNumber(floor)}-resident floor.`;

    (container.querySelector('#rk-stats') as HTMLElement).innerHTML = `
      <div class="stat-tile"><div class="stat-label">National figure</div>
        <div class="stat-value">${metric.natKey ? formatPercent(data.summary.nationalRates[metric.natKey] ?? null) : formatNumber(data.summary.incomeSupportTotal)}</div>
        <div class="stat-sub">all of Australia</div></div>
      <div class="stat-tile"><div class="stat-label">Median area</div>
        <div class="stat-value">${fmt(med)}</div><div class="stat-sub">typical qualifying area</div></div>
      <div class="stat-tile"><div class="stat-label">Highest</div>
        <div class="stat-value">${fmt(eligible.length ? Math.max(...values) : null)}</div>
        <div class="stat-sub">${esc(eligible.length ? (eligible.slice().sort((a, b) => (metric.get(b) as number) - (metric.get(a) as number))[0].name) : '—')}</div></div>
      <div class="stat-tile"><div class="stat-label">Areas ranked</div>
        <div class="stat-value">${formatNumber(eligible.length)}</div><div class="stat-sub">of ${formatNumber(pool.length)}</div></div>`;

    const list = container.querySelector('#rk-list') as HTMLElement;
    if (!sorted.length) {
      list.innerHTML = `<div class="empty-state"><strong>No areas match</strong>Try a lower population floor or a different state.</div>`;
      return;
    }
    list.innerHTML = sorted
      .map((r, i) => {
        const v = metric.get(r) as number;
        const above = med !== null && v > med;
        const colour = !metric.rate ? '#1e3a5f' : above ? '#b45309' : '#0f766e';
        const tip = [
          `${r.name} (${stateAbbr(r.state)})`,
          `${metric.short}: ${fmt(v)}`,
          med !== null ? `Median area: ${fmt(med)}` : '',
          `Population: ${formatNumber(r.pop)}`,
          `Income support recipients: ${formatNumber(r.is)}`,
        ]
          .filter(Boolean)
          .join('\n');
        return `<div class="rank-row" data-code="${r.code}" role="button" tabindex="0" data-tip="${esc(tip)}">
          <span class="rank-num">${i + 1}</span>
          <span class="rank-name">${esc(r.name)}<span class="rank-sub">${esc(stateAbbr(r.state))}</span></span>
          <span class="rank-track"><span class="rank-fill" style="width:${((v / maxVal) * 100).toFixed(1)}%;background:${colour}"></span></span>
          <span class="rank-value">${fmt(v)}</span>
        </div>`;
      })
      .join('');
    list.querySelectorAll('.rank-row').forEach((row) => {
      const go = () => ctx.openRegion(row.getAttribute('data-code') as string);
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') go();
      });
    });
  };

  metricSel.addEventListener('change', () => {
    metric = METRIC_BY_KEY[metricSel.value] ?? metric;
    localStorage.setItem(STORE_METRIC, metric.key);
    draw();
  });
  stateSel.addEventListener('change', () => {
    stateFilter = stateSel.value;
    draw();
  });
  floorSel.addEventListener('change', () => {
    floor = Number(floorSel.value);
    draw();
  });
  container.querySelectorAll('[data-dir]').forEach((btn) => {
    btn.addEventListener('click', () => {
      direction = btn.getAttribute('data-dir') as 'high' | 'low';
      container.querySelectorAll('[data-dir]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.getAttribute('data-dir') === direction)),
      );
      draw();
    });
  });

  draw();
}
