// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import './styles.css';
import { loadData, type Dataset, type Region } from './data';
import { hideTooltip, initTooltip } from './components/tooltip';
import { initGlossary } from './components/glossary';
import { createAbout } from './components/about';
import { createDrilldown } from './components/drilldown';
import type { ViewContext, ViewRenderer } from './views/types';
import { renderMap } from './views/map';
import { renderIllusion } from './views/illusion';
import { renderRankings } from './views/rankings';
import { renderExplorer } from './views/explorer';
import { renderElectorates } from './views/electorates';
import { renderMix } from './views/mix';
import { renderTrends } from './views/trends';
import { renderDistribution } from './views/distribution';
import { renderInsights } from './views/insights';
import { esc, formatMonth, formatNumber, formatPercent, stateAbbr } from './format';

// Nav labels are words only — never counts (a count in a tab label is stale the
// moment a filter changes, and reads as clutter).
const VIEWS: { key: string; label: string; render: ViewRenderer }[] = [
  { key: 'map', label: 'Map', render: renderMap },
  { key: 'illusion', label: 'Pension Illusion', render: renderIllusion },
  { key: 'rankings', label: 'Rankings', render: renderRankings },
  { key: 'explorer', label: 'Explorer', render: renderExplorer },
  { key: 'electorates', label: 'Electorates', render: renderElectorates },
  { key: 'mix', label: 'Payment Mix', render: renderMix },
  { key: 'trends', label: 'Trends', render: renderTrends },
  { key: 'distribution', label: 'Distribution', render: renderDistribution },
  { key: 'insights', label: 'Insights', render: renderInsights },
];

const VIEW_STORE = 'au-welfare.view';
const app = document.getElementById('app') as HTMLElement;

function shellHtml(data: Dataset): string {
  const s = data.summary;
  return `
    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <h1>Welfare Payments</h1>
          <span class="tag">income support by Australian suburb · ${esc(formatMonth(s.latestQuarter))}</span>
        </div>
        <div class="header-spacer"></div>
        <div class="header-search">
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input id="global-search" type="search" placeholder="Find a suburb…" aria-label="Search for a suburb or area" autocomplete="off" />
          <div class="search-results" id="search-results" role="listbox"></div>
        </div>
        <button class="icon-btn" id="about-btn" aria-label="About this site and its data">?</button>
      </div>
    </header>
    <nav class="view-nav" aria-label="Views">
      <div class="view-nav-inner" role="tablist">
        ${VIEWS.map(
          (v) => `<button class="view-tab" role="tab" data-view="${v.key}" aria-selected="false">${esc(v.label)}</button>`,
        ).join('')}
      </div>
    </nav>
    <main class="main-content" id="view-host"></main>
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-col">
          <strong>Welfare Payments</strong>
          <p>Recipient counts for every Australian government payment, by SA2 area and federal electorate.
          ${formatNumber(s.regionCount)} areas · ${esc(formatMonth(s.latestQuarter))}.</p>
          <p>Counts are rounded to the nearest 5 by DSS. Payments are not summed with supplements or concession
          cards, because people hold those alongside a payment.</p>
        </div>
        <div class="footer-col">
          <strong>Sources</strong>
          <p>Payment data: <a href="https://data.gov.au/data/dataset/dss-payment-demographic-data" target="_blank" rel="noopener">DSS Payment Demographics</a> (CC BY 4.0).
          Population: ABS Estimated Resident Population ${s.erpYear}.
          Boundaries: ABS ASGS 2021 and the Digital Atlas of Australia.</p>
          <p>Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> · <a href="https://sites.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a></p>
        </div>
      </div>
    </footer>`;
}

function boot(data: Dataset): void {
  app.innerHTML = shellHtml(data);
  initTooltip();
  initGlossary();

  const about = createAbout(data);
  const drilldown = createDrilldown(data);
  const host = document.getElementById('view-host') as HTMLElement;

  let disposers: (() => void)[] = [];
  let current = '';

  const setView = (key: string, payload?: unknown) => {
    const view = VIEWS.find((v) => v.key === key) ?? VIEWS[0];
    disposers.forEach((fn) => {
      try {
        fn();
      } catch {
        /* a failed teardown must not block navigation */
      }
    });
    disposers = [];
    // A tooltip anchored to an element this view is about to destroy would
    // otherwise stay pinned to the screen forever.
    hideTooltip();
    current = view.key;
    localStorage.setItem(VIEW_STORE, view.key);

    document.querySelectorAll('.view-tab').forEach((tab) =>
      tab.setAttribute('aria-selected', String(tab.getAttribute('data-view') === view.key)),
    );

    host.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const ctx: ViewContext = {
      data,
      openRegion: (code) => drilldown.open(code),
      setView,
      payload,
      onDispose: (fn) => disposers.push(fn),
    };
    // Views may be async (the two that load boundary files).
    Promise.resolve()
      .then(() => {
        host.innerHTML = '';
        return view.render(host, ctx);
      })
      .catch((err) => {
        host.innerHTML = `<div class="error-box"><h2>This view failed to load</h2>
          <p>${esc((err as Error).message)}</p><button id="retry-view">Try again</button></div>`;
        document.getElementById('retry-view')?.addEventListener('click', () => setView(view.key, payload));
      });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  document.querySelectorAll('.view-tab').forEach((tab) =>
    tab.addEventListener('click', () => setView(tab.getAttribute('data-view') as string)),
  );
  document.getElementById('about-btn')?.addEventListener('click', () => about.open());

  // ---- global search ----
  const input = document.getElementById('global-search') as HTMLInputElement;
  const results = document.getElementById('search-results') as HTMLElement;

  const runSearch = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      results.innerHTML = '';
      return;
    }
    const matches: Region[] = [];
    for (const r of data.regions) {
      if (r.name.toLowerCase().includes(q) || r.sa3.toLowerCase().includes(q)) matches.push(r);
      if (matches.length >= 40) break;
    }
    matches.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || b.pop - a.pop;
    });
    results.innerHTML = matches
      .slice(0, 12)
      .map(
        (r) => `<button class="search-result" data-code="${r.code}" role="option">
          <span class="sr-name">${esc(r.name)}</span>
          <span class="sr-meta">${esc(stateAbbr(r.state))} · ${formatPercent(r.rateWorking)}</span>
        </button>`,
      )
      .join('');
    results.querySelectorAll('[data-code]').forEach((btn) =>
      btn.addEventListener('click', () => {
        drilldown.open(btn.getAttribute('data-code') as string);
        results.innerHTML = '';
        input.value = '';
      }),
    );
  };

  let debounce: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(runSearch, 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      results.innerHTML = '';
      input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as Element)?.closest?.('.header-search')) results.innerHTML = '';
  });

  // ---- initial view + deep link ----
  const stored = localStorage.getItem(VIEW_STORE);
  setView(VIEWS.some((v) => v.key === stored) ? (stored as string) : 'map');

  const hashCode = /^#sa2=(\d+)$/.exec(location.hash)?.[1];
  if (hashCode) drilldown.open(hashCode);

  window.addEventListener('hashchange', () => {
    const code = /^#sa2=(\d+)$/.exec(location.hash)?.[1];
    if (code) drilldown.open(code);
  });

  void current;
}

function showError(message: string): void {
  app.innerHTML = `<div class="error-box">
    <h2>Could not load the data</h2>
    <p>${esc(message)}</p>
    <p style="margin-top:8px;color:var(--text-tertiary);font-size:var(--font-size-sm)">
      This is usually a temporary network problem.</p>
    <button id="retry">Try again</button>
  </div>`;
  document.getElementById('retry')?.addEventListener('click', () => start());
}

let controller: AbortController | null = null;

function start(): void {
  controller?.abort();
  controller = new AbortController();
  app.innerHTML = `<div class="loading">
    <div class="spinner"></div>
    <p style="color:var(--text-secondary)">Loading payment data for 2,454 areas…</p>
  </div>`;
  loadData(controller.signal)
    .then(boot)
    .catch((err) => {
      if ((err as Error).name === 'AbortError') return;
      showError((err as Error).message);
    });
}

start();
