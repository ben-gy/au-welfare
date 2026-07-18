// SA2 choropleth. Adapted from patterns/leafletMap.ts — real ABS boundaries,
// Leaflet-native tooltips on every polygon, and the map container isolated so
// Leaflet's panes cannot paint over drawers and modals.

import L from 'leaflet';
import type { ViewContext } from './types';
import { METRICS, METRIC_BY_KEY, type Metric, type Region } from '../data';
import { esc, formatMonth, formatNumber, formatPercent, stateAbbr } from '../format';
import { quantileBreaks, rampColour, TEAL_RAMP } from '../utils/scale';
import { gloss } from '../glossary';

const STORE_KEY = 'au-welfare.map.metric';
let cachedGeo: unknown | null = null;

function tooltipHtml(region: Region | undefined, name: string, metric: Metric): string {
  if (!region) {
    return `<strong>${esc(name)}</strong><div class="tip-row"><span>No payment data</span></div>`;
  }
  const value = metric.get(region);
  return `<strong>${esc(region.name)}</strong>
    <div class="tip-row"><span>${esc(metric.short)}</span><b>${metric.rate ? formatPercent(value) : formatNumber(value)}</b></div>
    <div class="tip-row"><span>Income support</span><b>${formatNumber(region.is)}</b></div>
    <div class="tip-row"><span>Population</span><b>${formatNumber(region.pop)}</b></div>
    <div class="tip-row"><span>${esc(stateAbbr(region.state))}</span><b>click for detail</b></div>`;
}

export async function renderMap(container: HTMLElement, ctx: ViewContext): Promise<void> {
  const { data } = ctx;
  const stored = localStorage.getItem(STORE_KEY);
  let metric: Metric = METRIC_BY_KEY[stored ?? ''] ?? METRIC_BY_KEY.rateWorking;

  container.innerHTML = `
    <div class="view-intro">
      <h2>Where income support is received</h2>
      <p>Every ${gloss('sa2', 'SA2 area')} in Australia — about a suburb each — shaded by the measure you choose.
      The default is the ${gloss('working-age rate', 'working-age rate')}, which strips out the Age Pension so
      the map reflects economic circumstances rather than how old an area is. Hover any area for its numbers;
      click to open its full profile.</p>
    </div>
    <div class="controls">
      <div class="control-group">
        <label for="map-metric">Measure</label>
        <select id="map-metric">
          ${METRICS.filter((m) => m.rate).map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}
        </select>
      </div>
      <span class="note" id="map-denom" style="margin:0"></span>
    </div>
    <div class="panel">
      <div class="panel-body" style="padding:var(--space-md)">
        <div class="map-shell">
          <div class="map-canvas"></div>
          <div class="map-legend">
            <div class="legend-title" id="map-legend-title"></div>
            <div class="legend-scale" id="map-legend-scale"></div>
            <div class="legend-ticks" id="map-legend-ticks"></div>
            <div class="note" style="margin-top:5px" id="map-legend-note"></div>
          </div>
        </div>
      </div>
    </div>
    <p class="chart-caption" id="map-caption"></p>`;

  const canvas = container.querySelector('.map-canvas') as HTMLElement;
  const select = container.querySelector('#map-metric') as HTMLSelectElement;
  select.value = metric.key;

  const map = L.map(canvas, { minZoom: 3, maxZoom: 12, zoomControl: true, scrollWheelZoom: false });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO',
    subdomains: 'abcd',
    minZoom: 3,
    maxZoom: 12,
  }).addTo(map);
  map.setView([-27.5, 134], 4);

  let breaks: number[] = [];

  const styleFor = (code: string) => {
    const region = data.byCode.get(code);
    const value = region ? metric.get(region) : null;
    return {
      fillColor: rampColour(value, breaks),
      fillOpacity: value === null ? 0.35 : 0.85,
      color: '#ffffff',
      weight: 0.4,
    };
  };

  const recomputeBreaks = () => {
    const values = data.regions.map((r) => metric.get(r)).filter((v): v is number => v !== null);
    breaks = quantileBreaks(values, TEAL_RAMP.length);
  };

  const updateLegend = () => {
    (container.querySelector('#map-legend-title') as HTMLElement).textContent = metric.short;
    const scale = container.querySelector('#map-legend-scale') as HTMLElement;
    scale.innerHTML = TEAL_RAMP.map(
      (c, i) =>
        `<span class="legend-swatch" style="background:${c}" data-tip="${
          i === 0 ? `Lowest ${Math.round(100 / TEAL_RAMP.length)}%` : `${formatPercent(breaks[i - 1])} and above`
        }"></span>`,
    ).join('');
    const ticks = container.querySelector('#map-legend-ticks') as HTMLElement;
    ticks.innerHTML = `<span>${formatPercent(breaks[0])}</span><span>${formatPercent(breaks[breaks.length - 1])}</span>`;
    (container.querySelector('#map-legend-note') as HTMLElement).textContent =
      'Seven equal-sized groups of areas (quantiles).';
    (container.querySelector('#map-denom') as HTMLElement).textContent = metric.denom;
    (container.querySelector('#map-caption') as HTMLElement).textContent =
      `${metric.blurb} Grey areas have too few residents for a reliable rate. ` +
      `Figures for ${formatMonth(data.summary.latestQuarter)}; boundaries ABS ASGS 2021.`;
  };

  recomputeBreaks();
  updateLegend();

  let layer: L.GeoJSON | null = null;
  try {
    if (!cachedGeo) {
      const res = await fetch('data/sa2.geojson');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cachedGeo = await res.json();
    }
    layer = L.geoJSON(cachedGeo as GeoJSON.GeoJsonObject, {
      attribution: 'Boundaries: ABS ASGS 2021 (CC BY 4.0)',
      style: (f) => styleFor(String(f?.properties?.sa2_code_2021 ?? '')),
      onEachFeature: (f, lyr) => {
        const code = String(f.properties?.sa2_code_2021 ?? '');
        const name = String(f.properties?.sa2_name_2021 ?? '');
        const region = data.byCode.get(code);
        lyr.bindTooltip(() => tooltipHtml(region, name, metric), { sticky: true, className: 'map-tip' });
        lyr.on({
          mouseover: () => (lyr as L.Path).setStyle({ weight: 2, color: '#10203a' }),
          mouseout: () => layer?.resetStyle(lyr as L.Path),
          click: () => {
            if (region) ctx.openRegion(region.code);
          },
        });
      },
    }).addTo(map);

    // Zero-size defence: Leaflet mis-measures a container that hasn't laid out yet.
    requestAnimationFrame(() => {
      map.invalidateSize();
      const b = layer?.getBounds();
      if (b && b.isValid()) map.fitBounds(b, { padding: [10, 10] });
    });
  } catch (err) {
    canvas.innerHTML = `<div class="empty-state"><strong>Map unavailable</strong>
      Boundary data could not be loaded (${esc((err as Error).message)}). Every other view still works.</div>`;
  }

  select.addEventListener('change', () => {
    metric = METRIC_BY_KEY[select.value] ?? metric;
    localStorage.setItem(STORE_KEY, metric.key);
    recomputeBreaks();
    updateLegend();
    layer?.setStyle((f) => styleFor(String(f?.properties?.sa2_code_2021 ?? '')));
  });

  // Leaflet keeps running after the view is swapped out unless it is torn down.
  ctx.onDispose(() => map.remove());
}
