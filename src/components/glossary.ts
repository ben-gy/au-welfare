// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Click-to-show glossary popovers for [data-term] spans anywhere in the document.
// Delegated, so views can render glossary links without wiring anything up.

import { lookup } from '../glossary';
import { esc } from '../format';

let pop: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'glossary-pop';
    pop.style.display = 'none';
    pop.setAttribute('role', 'dialog');
    document.body.appendChild(pop);
  }
  return pop;
}

function hide(): void {
  if (pop) pop.style.display = 'none';
}

function show(target: Element, term: string): void {
  const entry = lookup(term);
  if (!entry) return;
  const el = ensure();
  el.innerHTML = `<h4>${esc(entry.term)}</h4><p>${esc(entry.definition)}</p>`;
  el.style.display = 'block';

  // Position under the trigger, flipped up or nudged inward at the viewport edge.
  const r = target.getBoundingClientRect();
  const pr = el.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 6;
  if (left + pr.width > window.innerWidth - 12) left = window.innerWidth - pr.width - 12;
  if (top + pr.height > window.innerHeight - 12) top = r.top - pr.height - 6;
  el.style.left = `${Math.max(12, left)}px`;
  el.style.top = `${Math.max(12, top)}px`;
}

export function initGlossary(): void {
  document.addEventListener('click', (e) => {
    const trigger = (e.target as Element)?.closest?.('[data-term]');
    if (trigger) {
      e.stopPropagation();
      const term = trigger.getAttribute('data-term') || '';
      const el = ensure();
      // Clicking the same trigger again closes it.
      if (el.style.display === 'block' && el.dataset.term === term) {
        hide();
        return;
      }
      el.dataset.term = term;
      show(trigger, term);
      return;
    }
    if (!(e.target as Element)?.closest?.('.glossary-pop')) hide();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element)?.matches?.('[data-term]')) {
      e.preventDefault();
      (e.target as HTMLElement).click();
    }
  });

  window.addEventListener('resize', hide);
  window.addEventListener('scroll', hide, true);
}
