// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// The workhorse table: every SA2, sortable and searchable, with a sparkline of the
// working-age caseload across the published quarters. Accepts a filter payload from
// the Distribution view (click a bin -> land here with just those areas).

import type { ViewContext } from './types';
import type { Region } from '../data';
import { esc, formatMonth, formatNumber, formatPercent, stateAbbr, STATE_LIST } from '../format';
import { sparkSvg } from '../utils/spark';
import { gloss } from '../glossary';

type SortKey = 'name' | 'state' | 'pop' | 'is' | 'rateHeadline' | 'rateWorking' | 'ratePension' | 'rateDsp' | 'rateJs';

interface Column {
  key: SortKey;
  label: string;
  num: boolean;
  tip: string;
  get: (r: Region) => number | string | null;
  fmt: (r: Region) => string;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Area', num: false, tip: 'ABS SA2 — roughly a suburb', get: (r) => r.name, fmt: (r) => esc(r.name) },
  { key: 'state', label: 'State', num: false, tip: 'State or territory', get: (r) => r.state, fmt: (r) => `<span class="state-pill">${esc(stateAbbr(r.state))}</span>` },
  { key: 'pop', label: 'Population', num: true, tip: 'ABS Estimated Resident Population', get: (r) => r.pop, fmt: (r) => formatNumber(r.pop) },
  { key: 'is', label: 'Recipients', num: true, tip: 'Income support recipients (11 mutually exclusive payments)', get: (r) => r.is, fmt: (r) => formatNumber(r.is) },
  { key: 'rateWorking', label: 'Working-age', num: true, tip: 'Income support other than Age Pension, share of 15–64 population', get: (r) => r.rateWorking, fmt: (r) => formatPercent(r.rateWorking) },
  { key: 'rateHeadline', label: 'All support', num: true, tip: 'All income support recipients, share of total population', get: (r) => r.rateHeadline, fmt: (r) => formatPercent(r.rateHeadline) },
  { key: 'ratePension', label: 'Pension take-up', num: true, tip: 'Age Pension recipients, share of 65+ population', get: (r) => r.ratePension, fmt: (r) => formatPercent(r.ratePension) },
  { key: 'rateDsp', label: 'DSP', num: true, tip: 'Disability Support Pension, share of 15–64 population', get: (r) => r.rateDsp, fmt: (r) => formatPercent(r.rateDsp) },
  { key: 'rateJs', label: 'JobSeeker', num: true, tip: 'JobSeeker Payment, share of 15–64 population', get: (r) => r.rateJs, fmt: (r) => formatPercent(r.rateJs) },
];

export interface ExplorerFilter { codes?: string[]; label?: string }

const PAGE = 100;

export function renderExplorer(container: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  const incoming = ctx.payload as ExplorerFilter | undefined;

  let query = '';
  let stateFilter = 'all';
  let sortKey: SortKey = 'rateWorking';
  let sortDesc = true;
  let limit = PAGE;
  let codeFilter: Set<string> | null = incoming?.codes ? new Set(incoming.codes) : null;

  container.innerHTML = `
    <div class="view-intro">
      <h2>Explorer</h2>
      <p>Every one of the ${formatNumber(data.regions.length)} ${gloss('sa2', 'SA2 areas')} in Australia. Search for a
      suburb, sort by any column, and click a row for the full profile. The sparkline shows working-age recipients
      across the ${data.summary.quarters.length} published quarters.</p>
    </div>
    <div class="controls">
      <div class="control-group" style="flex:1 1 260px;min-width:0">
        <label for="ex-search" class="sr-only">Search</label>
        <input id="ex-search" class="text-input" style="width:100%" type="search" placeholder="Search suburb, region or state…" value="${esc(incoming?.label ? '' : '')}" />
      </div>
      <div class="control-group">
        <label for="ex-state">State</label>
        <select id="ex-state"><option value="all">All</option>${STATE_LIST.map((s) => `<option value="${esc(s)}">${esc(stateAbbr(s))}</option>`).join('')}</select>
      </div>
      <div id="ex-filter-chip"></div>
    </div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr>
          ${COLUMNS.map((c) => `<th class="sortable ${c.num ? 'num' : ''}" data-key="${c.key}" data-tip="${esc(c.tip)}" style="${c.num ? 'text-align:right' : ''}">${esc(c.label)}<span class="sort-arrow" data-arrow="${c.key}"></span></th>`).join('')}
          <th data-tip="Working-age recipients across the published quarters">Trend</th>
        </tr></thead>
        <tbody id="ex-body"></tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-md);margin-top:var(--space-md);flex-wrap:wrap">
      <span class="note" id="ex-count" style="margin:0"></span>
      <button class="chip" id="ex-more">Show more</button>
    </div>`;

  const body = container.querySelector('#ex-body') as HTMLElement;
  const searchInput = container.querySelector('#ex-search') as HTMLInputElement;
  const moreBtn = container.querySelector('#ex-more') as HTMLButtonElement;

  const chipHost = container.querySelector('#ex-filter-chip') as HTMLElement;
  const renderChip = () => {
    chipHost.innerHTML = codeFilter
      ? `<button class="chip" aria-pressed="true" id="ex-clear-filter">${esc(incoming?.label ?? 'Filtered')} — clear ✕</button>`
      : '';
    chipHost.querySelector('#ex-clear-filter')?.addEventListener('click', () => {
      codeFilter = null;
      renderChip();
      draw();
    });
  };

  const filtered = (): Region[] => {
    const q = query.trim().toLowerCase();
    let rows = data.regions;
    if (codeFilter) rows = rows.filter((r) => codeFilter?.has(r.code));
    if (stateFilter !== 'all') rows = rows.filter((r) => r.state === stateFilter);
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.sa3.toLowerCase().includes(q) ||
          r.sa4.toLowerCase().includes(q) ||
          r.state.toLowerCase().includes(q) ||
          stateAbbr(r.state).toLowerCase() === q,
      );
    }
    const col = COLUMNS.find((c) => c.key === sortKey) as Column;
    return rows.slice().sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      // Nulls always sort last, whichever direction the column is sorted in.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = typeof av === 'string' ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return sortDesc ? -cmp : cmp;
    });
  };

  const draw = () => {
    const rows = filtered();
    const shown = rows.slice(0, limit);
    body.innerHTML =
      shown
        .map((r) => {
          const hist = data.history.regions[r.code];
          const spark = hist ? sparkSvg(hist[2], 88, 20) : '';
          const tipSeries = hist
            ? data.history.quarters.map((q, i) => `${formatMonth(q)}: ${formatNumber(hist[2][i])}`).join('\n')
            : 'No history';
          return `<tr data-code="${r.code}" tabindex="0">
            ${COLUMNS.map(
              (c) => `<td class="${c.num ? 'num' : c.key === 'name' ? 'name' : ''}">${c.fmt(r)}</td>`,
            ).join('')}
            <td data-tip="${esc(tipSeries)}">${spark}</td>
          </tr>`;
        })
        .join('') ||
      `<tr><td colspan="${COLUMNS.length + 1}"><div class="empty-state"><strong>Nothing matches</strong>Try a different search or clear the filters.</div></td></tr>`;

    (container.querySelector('#ex-count') as HTMLElement).textContent =
      `Showing ${formatNumber(shown.length)} of ${formatNumber(rows.length)} areas · figures for ${formatMonth(data.summary.latestQuarter)}`;
    moreBtn.style.display = shown.length < rows.length ? '' : 'none';

    container.querySelectorAll('[data-arrow]').forEach((el) => {
      el.textContent = el.getAttribute('data-arrow') === sortKey ? (sortDesc ? '▾' : '▴') : '';
    });

    body.querySelectorAll('tr[data-code]').forEach((row) => {
      const go = () => ctx.openRegion(row.getAttribute('data-code') as string);
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') go();
      });
    });
  };

  container.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key') as SortKey;
      if (key === sortKey) sortDesc = !sortDesc;
      else {
        sortKey = key;
        sortDesc = key !== 'name' && key !== 'state';
      }
      limit = PAGE;
      draw();
    });
  });

  let debounce: number | undefined;
  searchInput.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      query = searchInput.value;
      limit = PAGE;
      draw();
    }, 300);
  });
  (container.querySelector('#ex-state') as HTMLSelectElement).addEventListener('change', (e) => {
    stateFilter = (e.target as HTMLSelectElement).value;
    limit = PAGE;
    draw();
  });
  moreBtn.addEventListener('click', () => {
    limit += PAGE * 4;
    draw();
  });

  renderChip();
  draw();
}
