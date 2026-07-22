// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// The political geography. 150 federal electorates, mapped and ranked.
//
// Deliberately counts-only: the ABS does not publish population by 2024 electoral
// division, and inventing a denominator (enrolment, or 2021-boundary population)
// would produce rates that look authoritative and are not. Composition — what
// *kind* of support an electorate's caseload is made of — needs no denominator
// and is the more interesting comparison anyway.

import L from 'leaflet';
import type { ViewContext } from './types';
import type { Electorate } from '../data';
import { esc, formatMonth, formatNumber, formatPercent, stateAbbr } from '../format';
import { quantileBreaks, rampColour, TEAL_RAMP } from '../utils/scale';
import { FAMILIES, FAMILY_KEYS, FAMILY_ORDER } from '../payments';
import { gloss } from '../glossary';

let cachedGeo: unknown | null = null;

const MEASURES = [
  { key: 'is', label: 'All income support recipients', get: (e: Electorate) => e.latest.is },
  { key: 'wa', label: 'Working-age recipients (excl. Age Pension)', get: (e: Electorate) => e.latest.wa },
  { key: 'ap', label: 'Age Pension recipients', get: (e: Electorate) => e.latest.ap },
  { key: 'dsp', label: 'Disability Support Pension', get: (e: Electorate) => e.latest.dsp },
  { key: 'js', label: 'JobSeeker Payment', get: (e: Electorate) => e.latest.js },
  { key: 'cra', label: 'Commonwealth Rent Assistance', get: (e: Electorate) => e.latest.cra },
];

export async function renderElectorates(container: HTMLElement, ctx: ViewContext): Promise<void> {
  const { data } = ctx;
  let measure = MEASURES[0];
  let selected: string | null = null;

  const byName = new Map(data.electorates.map((e) => [e.name.toLowerCase(), e]));

  container.innerHTML = `
    <div class="view-intro">
      <h2>Electorates</h2>
      <p>The same payments, cut by ${gloss('ced', 'federal electorate')} — the geography that decides who sits in
      Parliament. Shown as recipient counts rather than rates: the ABS does not publish population for the current
      electoral boundaries, and this site will not invent a denominator to manufacture a rate. Click an electorate to
      see what its caseload is made of.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label for="ce-measure">Measure</label>
        <select id="ce-measure">${MEASURES.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select>
      </div>
      <span class="note" style="margin:0">Electorates hold roughly equal numbers of voters, so counts are broadly comparable between them.</span>
    </div>
    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h2>Map</h2><p id="ce-map-sub"></p></div>
        <div class="panel-body" style="padding:var(--space-md)">
          <div class="map-shell">
            <div class="map-canvas" style="height:520px"></div>
            <div class="map-legend">
              <div class="legend-title" id="ce-legend-title"></div>
              <div class="legend-scale" id="ce-legend-scale"></div>
              <div class="legend-ticks" id="ce-legend-ticks"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2 id="ce-rank-title"></h2><p>Click a bar to see the electorate's payment mix below.</p></div>
        <div class="panel-body"><div class="rank-list" id="ce-rank" style="max-height:520px;overflow-y:auto"></div></div>
      </div>
    </div>
    <div class="panel" style="margin-top:var(--space-lg)">
      <div class="panel-head"><h2 id="ce-detail-title">What each caseload is made of</h2><p id="ce-detail-sub"></p></div>
      <div class="panel-body"><div id="ce-detail"></div></div>
    </div>`;

  const canvas = container.querySelector('.map-canvas') as HTMLElement;
  const map = L.map(canvas, { minZoom: 3, maxZoom: 10, zoomControl: true, scrollWheelZoom: false });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO',
    subdomains: 'abcd',
    minZoom: 3,
    maxZoom: 10,
  }).addTo(map);
  map.setView([-27.5, 134], 4);

  let breaks: number[] = [];
  const recompute = () => {
    breaks = quantileBreaks(data.electorates.map(measure.get), TEAL_RAMP.length);
  };

  const styleFor = (name: string) => {
    const e = byName.get(name.toLowerCase());
    return {
      fillColor: e ? rampColour(measure.get(e), breaks) : '#f1f5f9',
      fillOpacity: e ? 0.85 : 0.3,
      color: selected && e && e.name === selected ? '#10203a' : '#ffffff',
      weight: selected && e && e.name === selected ? 2.4 : 0.5,
    };
  };

  const renderDetail = () => {
    const host = container.querySelector('#ce-detail') as HTMLElement;
    const sub = container.querySelector('#ce-detail-sub') as HTMLElement;
    const list = selected
      ? [byName.get(selected.toLowerCase())].filter(Boolean as unknown as (x: Electorate | undefined) => x is Electorate)
      : data.electorates
          .slice()
          .sort((a, b) => b.latest.is - a.latest.is)
          .slice(0, 12);

    sub.textContent = selected
      ? `${selected} — share of its ${formatNumber(list[0]?.latest.is ?? 0)} income support recipients by payment family.`
      : 'The twelve largest caseloads in the country, broken into payment families. Select an electorate on the map or in the list to isolate it.';

    host.innerHTML = list
      .map((e) => {
        const total = e.latest.is || 1;
        const segs = FAMILY_ORDER.map((f) => {
          const count = FAMILY_KEYS[f].reduce((s, k) => s + (e.latest[k] ?? 0), 0);
          return { f, count, share: count / total };
        }).filter((s) => s.count > 0);
        return `<div style="margin-bottom:12px">
          <div class="kv-row" style="background:none;padding:0 0 3px">
            <span class="kv-key" style="font-weight:600;color:var(--text-primary)">${esc(e.name)} <span class="state-pill">${esc(stateAbbr(e.state))}</span></span>
            <span class="kv-val">${formatNumber(e.latest.is)}</span>
          </div>
          <div style="display:flex;height:20px;border-radius:4px;overflow:hidden;background:var(--bg-elevated)">
            ${segs
              .map(
                (s) => `<span class="mark" style="width:${(s.share * 100).toFixed(2)}%;background:${FAMILIES[s.f].colour}"
                  data-tip="${esc(`${e.name}\n${FAMILIES[s.f].label}: ${formatNumber(s.count)} (${formatPercent(s.share, 1)})\n\n${FAMILIES[s.f].blurb}`)}"></span>`,
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('');
  };

  const renderRank = () => {
    const sorted = data.electorates.slice().sort((a, b) => measure.get(b) - measure.get(a));
    const max = Math.max(...sorted.map(measure.get), 1);
    (container.querySelector('#ce-rank-title') as HTMLElement).textContent = `Ranked — ${measure.label}`;
    const host = container.querySelector('#ce-rank') as HTMLElement;
    host.innerHTML = sorted
      .map((e, i) => {
        const v = measure.get(e);
        const tip = [
          `${e.name} (${stateAbbr(e.state)})`,
          `${measure.label}: ${formatNumber(v)}`,
          `All income support: ${formatNumber(e.latest.is)}`,
          `Age Pension: ${formatNumber(e.latest.ap)}`,
          `Working-age: ${formatNumber(e.latest.wa)}`,
        ].join('\n');
        return `<div class="rank-row" data-name="${esc(e.name)}" role="button" tabindex="0" data-tip="${esc(tip)}"
            style="${selected === e.name ? 'background:var(--accent-soft)' : ''}">
          <span class="rank-num">${i + 1}</span>
          <span class="rank-name">${esc(e.name)}<span class="rank-sub">${esc(stateAbbr(e.state))}</span></span>
          <span class="rank-track"><span class="rank-fill" style="width:${((v / max) * 100).toFixed(1)}%;background:#1e3a5f"></span></span>
          <span class="rank-value">${formatNumber(v)}</span>
        </div>`;
      })
      .join('');
    host.querySelectorAll('.rank-row').forEach((row) => {
      const go = () => select(row.getAttribute('data-name'));
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') go();
      });
    });
  };

  const updateLegend = () => {
    (container.querySelector('#ce-legend-title') as HTMLElement).textContent = measure.label;
    (container.querySelector('#ce-legend-scale') as HTMLElement).innerHTML = TEAL_RAMP.map(
      (c, i) => `<span class="legend-swatch" style="background:${c}" data-tip="${i === 0 ? 'Fewest' : `${formatNumber(Math.round(breaks[i - 1]))}+`}"></span>`,
    ).join('');
    (container.querySelector('#ce-legend-ticks') as HTMLElement).innerHTML =
      `<span>${formatNumber(Math.round(breaks[0]))}</span><span>${formatNumber(Math.round(breaks[breaks.length - 1]))}</span>`;
    (container.querySelector('#ce-map-sub') as HTMLElement).textContent =
      `${formatNumber(data.electorates.length)} divisions, ${formatMonth(data.summary.cedLatest)}. Boundaries: Digital Atlas of Australia, March 2025.`;
  };

  let layer: L.GeoJSON | null = null;
  const select = (name: string | null) => {
    selected = selected === name ? null : name;
    layer?.setStyle((f) => styleFor(String(f?.properties?.div ?? '')));
    renderRank();
    renderDetail();
  };

  recompute();
  updateLegend();
  renderRank();
  renderDetail();

  try {
    if (!cachedGeo) {
      const res = await fetch('data/electorates.geojson');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cachedGeo = await res.json();
    }
    layer = L.geoJSON(cachedGeo as GeoJSON.GeoJsonObject, {
      attribution: 'Boundaries: Digital Atlas of Australia (CC BY 4.0)',
      style: (f) => styleFor(String(f?.properties?.div ?? '')),
      onEachFeature: (f, lyr) => {
        const name = String(f.properties?.div ?? '');
        const e = byName.get(name.toLowerCase());
        lyr.bindTooltip(
          () =>
            e
              ? `<strong>${esc(e.name)}</strong>
                 <div class="tip-row"><span>${esc(measure.label)}</span><b>${formatNumber(measure.get(e))}</b></div>
                 <div class="tip-row"><span>All income support</span><b>${formatNumber(e.latest.is)}</b></div>
                 <div class="tip-row"><span>${esc(stateAbbr(e.state))}</span><b>click to select</b></div>`
              : `<strong>${esc(name)}</strong><div class="tip-row"><span>No data</span></div>`,
          { sticky: true, className: 'map-tip' },
        );
        lyr.on({
          mouseover: () => (lyr as L.Path).setStyle({ weight: 2, color: '#10203a' }),
          mouseout: () => layer?.setStyle((ff) => styleFor(String(ff?.properties?.div ?? ''))),
          click: () => select(name),
        });
      },
    }).addTo(map);
    requestAnimationFrame(() => {
      map.invalidateSize();
      const b = layer?.getBounds();
      if (b && b.isValid()) map.fitBounds(b, { padding: [8, 8] });
    });
  } catch (err) {
    canvas.innerHTML = `<div class="empty-state"><strong>Map unavailable</strong>${esc((err as Error).message)}</div>`;
  }

  (container.querySelector('#ce-measure') as HTMLSelectElement).addEventListener('change', (e) => {
    measure = MEASURES.find((m) => m.key === (e.target as HTMLSelectElement).value) ?? measure;
    recompute();
    updateLegend();
    renderRank();
    layer?.setStyle((f) => styleFor(String(f?.properties?.div ?? '')));
  });

  ctx.onDispose(() => map.remove());
}
