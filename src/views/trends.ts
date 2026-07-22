// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// 14 years of national income support recipients, monthly.
//
// This is the only view with real long-run history, and it carries the one event
// everybody remembers: JobSeeker/Newstart roughly doubling within weeks in April
// 2020. Indexed mode is offered because the Age Pension is so much larger than
// everything else that absolute lines flatten every other payment.

import type { ViewContext } from './types';
import { INCOME_SUPPORT, PAYMENT_BY_KEY, FAMILIES } from '../payments';
import { esc, formatCompact, formatMonth, formatNumber } from '../format';
import { linearScale, niceTicks } from '../utils/scale';

const W = 1080;
const H = 560;
const M = { top: 22, right: 150, bottom: 46, left: 62 };

const SERIES_COLOURS: Record<string, string> = {
  ap: FAMILIES.pension.colour,
  dsp: FAMILIES.disability.colour,
  cp: FAMILIES.carer.colour,
  js: FAMILIES.unemployment.colour,
  pps: FAMILIES.parenting.colour,
  ppp: '#e07aa8',
  yao: '#ea8a5a',
  yas: FAMILIES.study.colour,
  aus: '#5eafd6',
  abl: '#8b6db5',
  sb: FAMILIES.other.colour,
};

const ANNOTATIONS = [
  { month: '2020-04', label: 'COVID-19: JobSeeker doubles', detail: 'Coronavirus Supplement and the suspension of mutual obligations more than doubled the unemployment caseload within two months.' },
  { month: '2020-03', label: '', detail: '' },
  { month: '2022-09', label: 'Supplement withdrawn', detail: 'By late 2022 the pandemic-era caseload had unwound and JobSeeker numbers returned near their pre-COVID level.' },
];

export function renderTrends(container: HTMLElement, ctx: ViewContext): void {
  const { national } = ctx.data;
  const months = national.months;
  let indexed = false;
  const hidden = new Set<string>(['abl', 'sb', 'aus']);

  container.innerHTML = `
    <div class="view-intro">
      <h2>Fourteen years of income support</h2>
      <p>Every income support payment, nationally, month by month from ${esc(formatMonth(months[0]))} to
      ${esc(formatMonth(months[months.length - 1]))}. Click a payment in the legend to show or hide it.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label>Scale</label>
        <div class="chip-row">
          <button class="chip" data-mode="abs" aria-pressed="true">Recipients</button>
          <button class="chip" data-mode="idx" aria-pressed="false">Indexed (start = 100)</button>
        </div>
      </div>
      <span class="note" style="margin:0">Hover the chart for every payment's value in that month.</span>
    </div>
    <div class="panel">
      <div class="panel-body">
        <div class="chart-wrap" id="tr-wrap"></div>
        <div class="legend" id="tr-legend"></div>
        <p class="chart-caption" id="tr-caption"></p>
      </div>
    </div>
    <div class="panel" style="margin-top:var(--space-lg)">
      <div class="panel-head"><h2>What moved, and when</h2><p>The turning points visible above.</p></div>
      <div class="panel-body"><div class="insight-grid" id="tr-notes"></div></div>
    </div>`;

  const wrap = container.querySelector('#tr-wrap') as HTMLElement;

  const draw = () => {
    const visible = INCOME_SUPPORT.filter((p) => !hidden.has(p.key) && national.series[p.key]);
    const values = (key: string): (number | null)[] => {
      const raw = national.series[key] ?? [];
      if (!indexed) return raw;
      const base = raw.find((v) => v !== null && v > 0) ?? null;
      if (!base) return raw.map(() => null);
      return raw.map((v) => (v === null ? null : (v / base) * 100));
    };

    let maxY = 0;
    for (const p of visible) {
      for (const v of values(p.key)) if (v !== null && v > maxY) maxY = v;
    }
    maxY = maxY || 1;

    const sx = linearScale(0, Math.max(1, months.length - 1), M.left, W - M.right);
    const sy = linearScale(0, maxY, H - M.bottom, M.top);
    const ticks = niceTicks(0, maxY, 6);

    // Year gridlines at each January.
    const yearIdx = months
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.endsWith('-01'))
      .filter((_, n) => n % 2 === 0);

    const lines = visible.map((p) => {
      const vals = values(p.key);
      let d = '';
      let started = false;
      vals.forEach((v, i) => {
        if (v === null) {
          started = false;
          return;
        }
        d += `${started ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)} `;
        started = true;
      });
      const last = vals.map((v, i) => ({ v, i })).filter((x) => x.v !== null).pop();
      return { p, d: d.trim(), endY: last ? sy(last.v as number) : null };
    });

    // De-collide the end-of-line labels: several payments finish within a few
    // hundred recipients of each other and their labels would sit on top of one
    // another. Push them apart top-down with a minimum gap.
    const GAP = 13;
    const labelled = lines
      .filter((l) => l.endY !== null)
      .sort((a, b) => (a.endY as number) - (b.endY as number));
    let prev = -Infinity;
    for (const l of labelled) {
      const y = Math.max(l.endY as number, prev + GAP);
      l.endY = y;
      prev = y;
    }

    const paths = lines
      .map(
        (l) => `<path class="mark" d="${l.d}" fill="none" stroke="${SERIES_COLOURS[l.p.key]}" stroke-width="1.9"
                  stroke-linejoin="round" aria-label="${esc(l.p.label)}" />`,
      )
      .join('') +
      labelled
        .map(
          (l) => `<text x="${(W - M.right + 8).toFixed(1)}" y="${(l.endY as number).toFixed(1)}" dominant-baseline="middle"
               font-size="11" fill="${SERIES_COLOURS[l.p.key]}" font-weight="600">${esc(l.p.short)}</text>`,
        )
        .join('');

    // Annotation labels sit on alternating rows, and flip to the left of their rule
    // when they would otherwise run off the plot — two labels on the same baseline
    // overlapped into an unreadable smear.
    const annotated = ANNOTATIONS.filter((a) => a.label && months.includes(a.month));
    const annotations = annotated
      .map((a, n) => {
        const i = months.indexOf(a.month);
        const x = sx(i);
        const y = M.top + 12 + (n % 2) * 16;
        const flip = x > W - M.right - 130;
        return `<line x1="${x.toFixed(1)}" y1="${M.top}" x2="${x.toFixed(1)}" y2="${H - M.bottom}"
                  stroke="#b45309" stroke-width="1" stroke-dasharray="4 3" />
                <text x="${(x + (flip ? -5 : 5)).toFixed(1)}" y="${y}" text-anchor="${flip ? 'end' : 'start'}"
                  font-size="10.5" fill="#b45309" font-weight="600">${esc(a.label)}</text>`;
      })
      .join('');

    // One invisible hover column per month: a real tooltip on every data position.
    const colW = (W - M.right - M.left) / Math.max(1, months.length - 1);
    const hovers = months
      .map((m, i) => {
        const rows = visible
          .map((p) => {
            const v = national.series[p.key]?.[i];
            return v === null || v === undefined ? null : `${p.short}: ${formatNumber(v)}`;
          })
          .filter(Boolean)
          .join('\n');
        return `<rect class="mark" x="${(sx(i) - colW / 2).toFixed(1)}" y="${M.top}" width="${Math.max(colW, 1).toFixed(1)}"
                 height="${H - M.bottom - M.top}" fill="transparent" data-tip="${esc(`${formatMonth(m)}\n\n${rows}`)}" />`;
      })
      .join('');

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Monthly national income support recipients since ${esc(formatMonth(months[0]))}">
        ${ticks.map((t) => `<line class="grid-line" x1="${M.left}" y1="${sy(t).toFixed(1)}" x2="${W - M.right}" y2="${sy(t).toFixed(1)}" />`).join('')}
        ${yearIdx.map(({ i }) => `<line class="grid-line" x1="${sx(i).toFixed(1)}" y1="${M.top}" x2="${sx(i).toFixed(1)}" y2="${H - M.bottom}" stroke-dasharray="2 4" />`).join('')}
        ${annotations}
        ${paths}
        ${hovers}
        <line class="axis-line" x1="${M.left}" y1="${H - M.bottom}" x2="${W - M.right}" y2="${H - M.bottom}" />
        <line class="axis-line" x1="${M.left}" y1="${M.top}" x2="${M.left}" y2="${H - M.bottom}" />
        ${ticks
          .map(
            (t) => `<text class="axis-label" x="${M.left - 8}" y="${sy(t).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${
              indexed ? Math.round(t) : formatCompact(t)
            }</text>`,
          )
          .join('')}
        ${yearIdx
          .map(({ m, i }) => `<text class="axis-label" x="${sx(i).toFixed(1)}" y="${H - M.bottom + 16}" text-anchor="middle">${m.slice(0, 4)}</text>`)
          .join('')}
        <text class="axis-label" x="${-(M.top + H - M.bottom) / 2}" y="15" text-anchor="middle" transform="rotate(-90)" font-weight="600">
          ${indexed ? `Indexed (${esc(formatMonth(months[0]))} = 100)` : 'Recipients'}
        </text>
      </svg>`;

    (container.querySelector('#tr-legend') as HTMLElement).innerHTML = INCOME_SUPPORT.filter(
      (p) => national.series[p.key],
    )
      .map(
        (p) => `<button class="legend-item" data-key="${p.key}" style="opacity:${hidden.has(p.key) ? 0.35 : 1};cursor:pointer"
          data-tip="${esc(p.blurb)}" aria-pressed="${!hidden.has(p.key)}">
          <span class="legend-swatch" style="background:${SERIES_COLOURS[p.key]}"></span>${esc(p.short)}</button>`,
      )
      .join('');
    container.querySelectorAll('#tr-legend [data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-key') as string;
        if (hidden.has(k)) hidden.delete(k);
        else hidden.add(k);
        draw();
      });
    });

    const ap = national.series.ap;
    const js = national.series.js;
    (container.querySelector('#tr-caption') as HTMLElement).textContent = indexed
      ? `Each payment starts at 100 in ${formatMonth(months[0])}, so the lines show proportional change rather than size. This is the only way to see small payments move at all next to the Age Pension.`
      : `Absolute recipient counts. The Age Pension (${formatNumber(ap?.[ap.length - 1] ?? 0)}) dwarfs every other payment, which is precisely why area-level welfare rates are dominated by age structure. JobSeeker currently sits at ${formatNumber(js?.[js.length - 1] ?? 0)}.`;

    (container.querySelector('#tr-notes') as HTMLElement).innerHTML = ANNOTATIONS.filter((a) => a.label)
      .map(
        (a) => `<div class="insight-card info">
          <span class="insight-badge">${esc(formatMonth(a.month))}</span>
          <h3>${esc(a.label)}</h3><p>${esc(a.detail)}</p></div>`,
      )
      .join('');
  };

  container.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      indexed = btn.getAttribute('data-mode') === 'idx';
      container.querySelectorAll('[data-mode]').forEach((b) =>
        b.setAttribute('aria-pressed', String((b.getAttribute('data-mode') === 'idx') === indexed)),
      );
      draw();
    });
  });

  // Keep the payment lookup referenced so the taxonomy stays the single source.
  void PAYMENT_BY_KEY;
  draw();
}
