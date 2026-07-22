// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Auto-detected findings. Everything here comes from analysis.ts, so the claims
// are computed from the current data rather than written by hand and left to rot.

import type { ViewContext } from './types';
import { computeInsights } from '../analysis';
import { esc, formatMonth, formatNumber, formatPercent } from '../format';
import { gloss } from '../glossary';

const BADGE: Record<string, string> = { info: 'Pattern', warn: 'Watch', alert: 'Notable' };

export function renderInsights(container: HTMLElement, ctx: ViewContext): void {
  const { data } = ctx;
  const insights = computeInsights(data);
  const s = data.summary;

  container.innerHTML = `
    <div class="view-intro">
      <h2>Insights</h2>
      <p>Findings computed directly from the current release — outliers, concentrations and turning points the
      dataset produces on its own. Cards about a single area open that area's profile.</p>
    </div>
    <div class="stat-grid">
      <div class="stat-tile"><div class="stat-label">Income support recipients</div>
        <div class="stat-value">${formatNumber(s.incomeSupportTotal)}</div>
        <div class="stat-sub">${esc(formatMonth(s.latestQuarter))}, all payments</div></div>
      <div class="stat-tile"><div class="stat-label">Excluding Age Pension</div>
        <div class="stat-value">${formatNumber(s.workingAgeTotal)}</div>
        <div class="stat-sub">${formatPercent(s.workingAgeTotal / s.incomeSupportTotal, 0)} of the total</div></div>
      <div class="stat-tile"><div class="stat-label">Working-age rate</div>
        <div class="stat-value">${formatPercent(s.nationalRates.working)}</div>
        <div class="stat-sub">of the 15–64 population</div></div>
      <div class="stat-tile"><div class="stat-label">Age Pension take-up</div>
        <div class="stat-value">${formatPercent(s.nationalRates.pension)}</div>
        <div class="stat-sub">of the 65+ population</div></div>
    </div>
    <div class="insight-grid" id="in-grid">
      ${insights
        .map(
          (i) => `<article class="insight-card ${i.severity} ${i.regionCode ? 'clickable' : ''}"
            ${i.regionCode ? `data-code="${i.regionCode}" role="button" tabindex="0"` : ''}>
            <span class="insight-badge">${esc(BADGE[i.severity] ?? i.severity)}</span>
            <h3>${esc(i.title)}</h3>
            <p>${esc(i.detail)}</p>
            ${i.regionCode ? '<p class="note">Click for the full area profile →</p>' : ''}
          </article>`,
        )
        .join('')}
    </div>
    <div class="panel" style="margin-top:var(--space-lg)">
      <div class="panel-head"><h2>How these are worked out</h2>
      <p>Every figure above is recomputed from the latest data each time the site is built — none of it is
      hand-written commentary.</p></div>
      <div class="panel-body">
        <ul style="padding-left:1.15rem;color:var(--text-secondary);font-size:var(--font-size-sm)">
          <li>Areas under ${formatNumber(5000)} residents are excluded from every ranking and finding, because DSS
          ${gloss('rounding', 'rounds counts to the nearest 5')} and small-area rates are dominated by that rounding.</li>
          <li>Rates use ABS Estimated Resident Population for ${s.erpYear} as the denominator, against payment counts
          for ${esc(formatMonth(s.latestQuarter))}.</li>
          <li>"Working-age" means everyone on an income support payment other than the Age Pension, over the 15–64
          population. DSP recipients move onto the Age Pension at pension age, so the numerator is working-age by
          construction.</li>
          <li>Growth findings compare the first and last of the ${s.quarters.length} published quarters
          (${esc(formatMonth(s.quarters[0]))} to ${esc(formatMonth(s.quarters[s.quarters.length - 1]))}), and are
          affected by population growth as well as economic change.</li>
        </ul>
      </div>
    </div>`;

  container.querySelectorAll('#in-grid [data-code]').forEach((card) => {
    const go = () => ctx.openRegion(card.getAttribute('data-code') as string);
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') go();
    });
  });
}
