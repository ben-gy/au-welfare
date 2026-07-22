// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// About modal: what this is, where the data comes from, how to read it, and —
// most importantly — what it cannot tell you.

import type { Dataset } from '../data';
import { esc, formatMonth, formatNumber, formatPercent } from '../format';

export function createAbout(data: Dataset): { open: () => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'About Welfare Payments');

  const s = data.summary;
  modal.innerHTML = `
    <div class="modal-head">
      <h2>About this site</h2>
      <button class="close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      <h3>What this shows</h3>
      <p>How many people receive each Australian government payment, in every one of the
      ${formatNumber(s.regionCount)} SA2 areas (roughly suburbs) the ABS divides the country into, and in
      all ${formatNumber(s.electorateCount)} federal electorates. The latest figures are for
      ${esc(formatMonth(s.latestQuarter))}.</p>

      <h3>The one thing worth understanding</h3>
      <p>The Age Pension is by far the largest payment — ${formatNumber(s.totals.ap)} of
      ${formatNumber(s.incomeSupportTotal)} income support recipients. So any measure that includes it
      mostly measures <em>how old an area is</em>. A coastal retirement town and a struggling outer
      suburb can post the same headline rate for completely different reasons.</p>
      <p>That is why the default measure here is the <strong>working-age rate</strong>: everyone on a
      payment other than the Age Pension, as a share of the 15–64 population. Nationally that is
      ${formatPercent(s.nationalRates.working)}, against a headline rate of
      ${formatPercent(s.nationalRates.headline)}.</p>

      <h3>Where the data comes from</h3>
      <ul>
        <li><strong>Payment counts</strong> — Department of Social Services, <em>DSS Payment Demographics</em>,
        published quarterly by SA2 and by electoral division on data.gov.au.</li>
        <li><strong>National monthly history</strong> — DSS <em>Income Support Recipients Monthly Time Series</em>
        (${data.national.months.length} months from ${esc(formatMonth(data.national.months[0]))}).</li>
        <li><strong>Population denominators</strong> — ABS Estimated Resident Population by SA2 and age,
        ${s.erpYear} release.</li>
        <li><strong>Boundaries</strong> — ABS ASGS 2021 (SA2) and the Digital Atlas of Australia
        (federal electorates), both CC BY 4.0.</li>
      </ul>

      <h3>How to read the numbers — and the traps</h3>
      <ul>
        <li><strong>Counts are rounded to the nearest 5</strong> by DSS for privacy. A published 0 may mean
        "fewer than 5". Rankings here exclude areas under 5,000 residents for this reason.</li>
        <li><strong>Payments are not added up across the board.</strong> A person can hold Rent Assistance,
        Family Tax Benefit and a concession card <em>alongside</em> their payment. Only the 11 mutually
        exclusive income support payments are summed into a headcount; supplements and cards are
        reported separately and never folded into a total.</li>
        <li><strong>Rates for very small areas are suppressed.</strong> Industrial estates and airports have
        a handful of residents, so rounding produces nonsense rates. ${formatNumber(s.suppressed.working)}
        areas have no published working-age rate for this reason.</li>
        <li><strong>Population is from ${s.erpYear}</strong> while payments are from ${esc(formatMonth(s.latestQuarter))},
        so rates in fast-growing suburbs run slightly high.</li>
        <li><strong>The JobSeeker rate is not the unemployment rate.</strong> It counts people receiving a
        payment, not everyone looking for work — many job seekers do not qualify.</li>
        <li><strong>Electorate figures are counts only.</strong> The ABS does not publish population by 2024
        electoral division, so no per-capita rates are shown there rather than inventing a denominator.</li>
      </ul>

      <h3>How often it updates</h3>
      <p>DSS publishes quarterly. An automated pipeline re-runs after each release and rebuilds this
      site. Data last built ${esc(new Date(s.generated).toISOString().slice(0, 10))}.</p>

      <h3>A note on framing</h3>
      <p>This site reports where payments are received. It does not measure fraud, dependency or
      merit, and the numbers should not be read that way. Most recipients are pensioners, carers,
      people with a disability, parents and students.</p>
    </div>`;

  document.body.append(overlay, modal);

  const close = () => {
    overlay.classList.remove('open');
    modal.classList.remove('open');
  };
  const open = () => {
    overlay.classList.add('open');
    modal.classList.add('open');
    (modal.querySelector('.close-btn') as HTMLElement)?.focus();
  };

  overlay.addEventListener('click', close);
  modal.querySelector('.close-btn')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close };
}
