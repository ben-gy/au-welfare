// Per-SA2 slide-in profile. Opened from any view; target lives in the URL hash
// (#sa2=117031337) so a specific suburb can be linked to directly.

import type { Dataset, Region } from '../data';
import { INCOME_SUPPORT, SUPPLEMENTS, CARDS, FAMILY_ORDER, FAMILIES, FAMILY_KEYS } from '../payments';
import { esc, formatDelta, formatMonth, formatNumber, formatPercent, stateAbbr } from '../format';
import { gloss } from '../glossary';
import { sparkSvg } from '../utils/spark';
import { RANK_FLOOR, rankable } from '../analysis';

export interface Drilldown {
  open: (code: string) => void;
  close: () => void;
}

function rankOf(regions: Region[], region: Region, get: (r: Region) => number | null): string {
  const pool = rankable(regions, get);
  if (!pool.length || get(region) === null || region.pop < RANK_FLOOR) return '—';
  const sorted = pool.slice().sort((a, b) => (get(b) as number) - (get(a) as number));
  const idx = sorted.findIndex((r) => r.code === region.code);
  if (idx < 0) return '—';
  return `${formatNumber(idx + 1)} of ${formatNumber(sorted.length)}`;
}

function compareRow(label: string, value: number | null, national: number | null): string {
  const cls = value !== null && national !== null ? (value > national ? 'bad' : 'good') : '';
  return `<div class="kv-row">
    <span class="kv-key">${label}</span>
    <span class="kv-val ${cls}">${formatPercent(value)} <span style="color:var(--text-tertiary);font-weight:400">(${formatDelta(value, national)})</span></span>
  </div>`;
}

export function createDrilldown(data: Dataset, onNavigate?: () => void): Drilldown {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', 'Area profile');
  document.body.append(overlay, drawer);

  const close = () => {
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    if (location.hash.startsWith('#sa2=')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  };

  const render = (region: Region): string => {
    const nat = data.summary.nationalRates;
    const hist = data.history.regions[region.code];
    const quarters = data.history.quarters;

    // History series order from the pipeline: is, ap, wa, dsp, js
    const waSeries = hist ? hist[2] : [];
    const isSeries = hist ? hist[0] : [];

    const isTotal = region.is || 1;
    const familyRows = FAMILY_ORDER.map((f) => {
      const count = FAMILY_KEYS[f].reduce((s, k) => s + (region.payments[k] ?? 0), 0);
      return { f, count, share: count / isTotal };
    })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

    const paymentRows = (list: typeof INCOME_SUPPORT) =>
      list
        .map((p) => ({ p, n: region.payments[p.key] ?? 0 }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .map(
          (x) => `<div class="kv-row">
            <span class="kv-key" data-tip="${esc(x.p.blurb)}">${esc(x.p.label)}</span>
            <span class="kv-val">${formatNumber(x.n)}</span>
          </div>`,
        )
        .join('') || '<p class="note">None recorded.</p>';

    const maxFamily = Math.max(...familyRows.map((r) => r.count), 1);

    return `
      <div class="drawer-head">
        <div style="min-width:0">
          <h2>${esc(region.name)}</h2>
          <div class="drawer-sub">${esc(region.sa4 || region.sa3)} · ${esc(stateAbbr(region.state))} · SA2 ${esc(region.code)} · ${esc(formatMonth(data.summary.latestQuarter))}</div>
        </div>
        <button class="close-btn" aria-label="Close profile">&times;</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-section">
          <h3>Headline</h3>
          <div class="stat-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:0">
            <div class="stat-tile">
              <div class="stat-label">Working-age rate</div>
              <div class="stat-value">${formatPercent(region.rateWorking)}</div>
              <div class="stat-sub">${formatNumber(region.wa)} of ${formatNumber(region.pop1564)} aged 15–64</div>
            </div>
            <div class="stat-tile">
              <div class="stat-label">All income support</div>
              <div class="stat-value">${formatPercent(region.rateHeadline)}</div>
              <div class="stat-sub">${formatNumber(region.is)} of ${formatNumber(region.pop)} residents</div>
            </div>
          </div>
        </div>

        <div class="drawer-section">
          <h3>Compared with Australia</h3>
          <div class="kv-list">
            ${compareRow('Working-age income support', region.rateWorking, nat.working)}
            ${compareRow('All income support', region.rateHeadline, nat.headline)}
            ${compareRow('Age Pension take-up (65+)', region.ratePension, nat.pension)}
            ${compareRow('Disability Support Pension', region.rateDsp, nat.dsp)}
            ${compareRow('JobSeeker', region.rateJs, nat.js)}
            ${compareRow('Rent Assistance', region.rateCra, nat.cra)}
          </div>
          <p class="note">Green is below the national figure, orange above. Difference shown in percentage points.</p>
        </div>

        <div class="drawer-section">
          <h3>National rank</h3>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-key">Working-age rate</span><span class="kv-val">${rankOf(data.regions, region, (r) => r.rateWorking)}</span></div>
            <div class="kv-row"><span class="kv-key">All income support rate</span><span class="kv-val">${rankOf(data.regions, region, (r) => r.rateHeadline)}</span></div>
            <div class="kv-row"><span class="kv-key">Age Pension take-up</span><span class="kv-val">${rankOf(data.regions, region, (r) => r.ratePension)}</span></div>
          </div>
          <p class="note">Ranked highest-first among areas with at least ${formatNumber(RANK_FLOOR)} residents.</p>
        </div>

        ${
          waSeries.length
            ? `<div class="drawer-section">
          <h3>Trend · ${esc(formatMonth(quarters[0]))} to ${esc(formatMonth(quarters[quarters.length - 1]))}</h3>
          <div class="kv-row" style="background:none;padding-left:0">
            <span class="kv-key">Working-age recipients</span>
            <span class="kv-val">${formatNumber(waSeries[waSeries.length - 1])}</span>
          </div>
          <div data-tip="${esc(quarters.map((q, i) => `${formatMonth(q)}: ${formatNumber(waSeries[i])}`).join('\n'))}">${sparkSvg(waSeries, 400, 54)}</div>
          <div class="kv-row" style="background:none;padding-left:0;margin-top:8px">
            <span class="kv-key">All income support recipients</span>
            <span class="kv-val">${formatNumber(isSeries[isSeries.length - 1])}</span>
          </div>
          <div data-tip="${esc(quarters.map((q, i) => `${formatMonth(q)}: ${formatNumber(isSeries[i])}`).join('\n'))}">${sparkSvg(isSeries, 400, 54, '#1e3a5f')}</div>
        </div>`
            : ''
        }

        <div class="drawer-section">
          <h3>What kind of support</h3>
          ${familyRows
            .map(
              (r) => `<div style="margin-bottom:7px" data-tip="${esc(FAMILIES[r.f].blurb)}">
                <div class="kv-row" style="background:none;padding:0 0 2px">
                  <span class="kv-key">${esc(FAMILIES[r.f].label)}</span>
                  <span class="kv-val">${formatNumber(r.count)} · ${formatPercent(r.share, 0)}</span>
                </div>
                <div class="compare-bar"><span style="width:${((r.count / maxFamily) * 100).toFixed(1)}%;background:${FAMILIES[r.f].colour}"></span></div>
              </div>`,
            )
            .join('')}
          <p class="note">Share of this area's ${formatNumber(region.is)} ${gloss('income support', 'income support')} recipients.</p>
        </div>

        <div class="drawer-section">
          <h3>Income support payments</h3>
          <div class="kv-list">${paymentRows(INCOME_SUPPORT)}</div>
        </div>

        <div class="drawer-section">
          <h3>Supplements</h3>
          <div class="kv-list">${paymentRows(SUPPLEMENTS)}</div>
          <p class="note">Held alongside a payment — never added to the income support total.</p>
        </div>

        <div class="drawer-section">
          <h3>${gloss('concession card', 'Concession cards')}</h3>
          <div class="kv-list">${paymentRows(CARDS)}</div>
        </div>

        <div class="drawer-section">
          <h3>Population (ABS ERP ${data.summary.erpYear})</h3>
          <div class="kv-list">
            <div class="kv-row"><span class="kv-key">All residents</span><span class="kv-val">${formatNumber(region.pop)}</span></div>
            <div class="kv-row"><span class="kv-key">Aged 15–64</span><span class="kv-val">${formatNumber(region.pop1564)}</span></div>
            <div class="kv-row"><span class="kv-key">Aged 65+</span><span class="kv-val">${formatNumber(region.pop65)}</span></div>
          </div>
        </div>
      </div>`;
  };

  const open = (code: string) => {
    const region = data.byCode.get(code);
    if (!region) return;
    drawer.innerHTML = render(region);
    drawer.querySelector('.close-btn')?.addEventListener('click', close);
    drawer.scrollTop = 0;
    const body = drawer.querySelector('.drawer-body');
    if (body) body.scrollTop = 0;
    overlay.classList.add('open');
    drawer.classList.add('open');
    history.replaceState(null, '', `#sa2=${code}`);
    onNavigate?.();
  };

  overlay.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });

  return { open, close };
}
