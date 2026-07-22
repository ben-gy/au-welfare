// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Inline sparkline path generation. Pure so the geometry can be tested.

export interface SparkGeometry { path: string; area: string; lastX: number; lastY: number }

/**
 * Build an SVG polyline path for `values` inside a w x h box.
 * A flat series renders along the vertical middle rather than dividing by zero.
 */
export function sparkPath(values: number[], w: number, h: number, pad = 1): SparkGeometry {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return { path: '', area: '', lastX: 0, lastY: h / 2 };
  if (clean.length === 1) {
    const y = h / 2;
    return { path: `M0,${y} L${w},${y}`, area: '', lastX: w, lastY: y };
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min;
  const innerH = h - pad * 2;
  const pts = clean.map((v, i) => {
    const x = (i / (clean.length - 1)) * w;
    const y = span === 0 ? h / 2 : pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as [number, number];
  });
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${path} L${w.toFixed(2)},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  return { path, area, lastX: last[0], lastY: last[1] };
}

export function sparkSvg(values: number[], w = 92, h = 22, colour = '#0f766e'): string {
  const g = sparkPath(values, w, h);
  if (!g.path) return '';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${g.area}" fill="${colour}" fill-opacity="0.1" />
    <path d="${g.path}" fill="none" stroke="${colour}" stroke-width="1.4" stroke-linejoin="round" />
    <circle cx="${g.lastX.toFixed(2)}" cy="${g.lastY.toFixed(2)}" r="1.9" fill="${colour}" />
  </svg>`;
}
