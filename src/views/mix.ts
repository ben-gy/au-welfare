// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Payment-mix matrix. Rows = areas, columns = payment families, cell = that family's
// share of the area's income support caseload.
//
// Two areas can post identical headline rates and be nothing alike: one carrying
// pensioners, another carrying disability, a third carrying unemployment. That is
// exactly what a share-based heatmap makes visible and a ranking cannot.

import type { ViewContext } from './types';
import type { Region } from '../data';
import { FAMILIES, FAMILY_KEYS, FAMILY_ORDER, type FamilyKey } from '../payments';
import { esc, formatNumber, formatPercent, stateAbbr } from '../format';
import { RANK_FLOOR } from '../analysis';
import { gloss } from '../glossary';

export interface MixRow { region: Region; shares: Record<FamilyKey, number>; total: number }

/** Compute family shares for a region. Exported for tests: shares must sum to ~1. */
export function familyShares(region: Region): { shares: Record<FamilyKey, number>; total: number } {
  const total = FAMILY_ORDER.reduce(
    (s, f) => s + FAMILY_KEYS[f].reduce((t, k) => t + (region.payments[k] ?? 0), 0),
    0,
  );
  const shares = {} as Record<FamilyKey, number>;
  for (const f of FAMILY_ORDER) {
    const count = FAMILY_KEYS[f].reduce((t, k) => t + (region.payments[k] ?? 0), 0);
    shares[f] = total > 0 ? count / total : 0;
  }
  return { shares, total };
}

const SORTS: { key: string; label: string; sort: (rows: MixRow[]) => MixRow[] }[] = [
  { key: 'size', label: 'Largest caseload', sort: (r) => r.slice().sort((a, b) => b.total - a.total) },
  ...FAMILY_ORDER.map((f) => ({
    key: f,
    label: `Most ${FAMILIES[f].label.toLowerCase()}`,
    sort: (r: MixRow[]) => r.slice().sort((a, b) => b.shares[f] - a.shares[f]),
  })),
];

export function renderMix(container: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  let sortKey = 'size';
  let limit = 45;

  const allRows: MixRow[] = data.regions
    .filter((r) => r.pop >= RANK_FLOOR && r.is > 0)
    .map((r) => {
      const { shares, total } = familyShares(r);
      return { region: r, shares, total };
    });

  container.innerHTML = `
    <div class="view-intro">
      <h2>Payment mix</h2>
      <p>What kind of support an area's caseload is actually made of. Each row is an area; each column is a family of
      payments; the cell is that family's share of the area's ${gloss('income support', 'income support')} recipients.
      Sort by a column to find the places where one kind of payment dominates.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label for="mx-sort">Sort by</label>
        <select id="mx-sort">${SORTS.map((s) => `<option value="${s.key}">${esc(s.label)}</option>`).join('')}</select>
      </div>
      <div class="control-group">
        <label for="mx-limit">Rows</label>
        <select id="mx-limit"><option value="45">45</option><option value="100">100</option><option value="250">250</option></select>
      </div>
      <span class="note" style="margin:0">Darker = a larger share of that area's caseload. Click a row for the area profile.</span>
    </div>
    <div class="panel">
      <div class="panel-body">
        <div class="matrix-scroll"><table class="matrix" id="mx-table"></table></div>
        <div class="legend" id="mx-legend"></div>
        <p class="chart-caption">Shares run across each row and sum to 100%. Areas under ${formatNumber(RANK_FLOOR)} residents
        are excluded — with counts rounded to the nearest 5, small-area shares are mostly rounding noise.</p>
      </div>
    </div>`;

  const draw = () => {
    const sorter = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];
    const rows = sorter.sort(allRows).slice(0, limit);
    const table = container.querySelector('#mx-table') as HTMLElement;

    table.innerHTML = `
      <thead><tr>
        <th></th>
        ${FAMILY_ORDER.map((f) => `<th class="col-head" data-tip="${esc(FAMILIES[f].blurb)}">${esc(FAMILIES[f].label)}</th>`).join('')}
        <th class="col-head" data-tip="Total income support recipients in this area">Total</th>
      </tr></thead>
      <tbody>
        ${rows
          .map((row) => {
            const cells = FAMILY_ORDER.map((f) => {
              const share = row.shares[f];
              const count = Math.round(share * row.total);
              // Alpha ramps with share; text flips to white once the cell is dark.
              const alpha = Math.min(1, 0.06 + share * 1.5);
              const tip = `${row.region.name}\n${FAMILIES[f].label}: ${formatNumber(count)} (${formatPercent(share, 1)})\n\n${FAMILIES[f].blurb}`;
              return `<td><div class="cell" style="background:${FAMILIES[f].colour}${Math.round(alpha * 255).toString(16).padStart(2, '0')};color:${alpha > 0.55 ? '#fff' : 'var(--text-secondary)'}"
                data-code="${row.region.code}" data-tip="${esc(tip)}">${share >= 0.005 ? formatPercent(share, 0) : ''}</div></td>`;
            }).join('');
            return `<tr>
              <th class="row-head" data-code="${row.region.code}" data-tip="${esc(`${row.region.name} (${stateAbbr(row.region.state)})\n${formatNumber(row.total)} income support recipients`)}">${esc(row.region.name)}</th>
              ${cells}
              <td><div class="cell mono" style="background:var(--bg-elevated)" data-code="${row.region.code}">${formatNumber(row.total)}</div></td>
            </tr>`;
          })
          .join('')}
      </tbody>`;

    table.querySelectorAll('[data-code]').forEach((el) => {
      el.addEventListener('click', () => ctx.openRegion(el.getAttribute('data-code') as string));
    });

    (container.querySelector('#mx-legend') as HTMLElement).innerHTML = FAMILY_ORDER.map(
      (f) => `<span class="legend-item"><span class="legend-swatch" style="background:${FAMILIES[f].colour}"></span>${esc(FAMILIES[f].label)}</span>`,
    ).join('');
  };

  (container.querySelector('#mx-sort') as HTMLSelectElement).addEventListener('change', (e) => {
    sortKey = (e.target as HTMLSelectElement).value;
    draw();
  });
  (container.querySelector('#mx-limit') as HTMLSelectElement).addEventListener('change', (e) => {
    limit = Number((e.target as HTMLSelectElement).value);
    draw();
  });

  draw();
}
