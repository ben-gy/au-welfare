// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// Domain glossary. Every jargon term used in the UI has an entry here, surfaced
// through the ℹ affordance (see components/glossary.ts). Assume the reader knows
// nothing about social security or ABS geography.

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  'income support': {
    term: 'Income support payment',
    definition:
      'A payment you live on, rather than a top-up: Age Pension, JobSeeker, Disability Support Pension, Carer Payment, Parenting Payment, Youth Allowance, Austudy, ABSTUDY living allowance and Special Benefit. A person receives at most one of these at a time, which is why they can be added together into a headcount.',
  },
  'working-age rate': {
    term: 'Working-age income support rate',
    definition:
      'Everyone on an income support payment other than the Age Pension, divided by the number of people aged 15–64 who live there. This is the measure that tracks economic disadvantage, because it is not affected by how many retirees an area has.',
  },
  'headline rate': {
    term: 'All income support rate',
    definition:
      'Every income support recipient, including Age Pensioners, divided by the total population. It is the number most often quoted, and the most misleading: a coastal retirement town scores high for reasons that have nothing to do with hardship.',
  },
  'pension take-up': {
    term: 'Age Pension take-up',
    definition:
      'Age Pension recipients divided by the number of residents aged 65 and over. The Age Pension is means-tested, so a low take-up rate means many local retirees have enough income or assets to be ineligible — it reads as a measure of retiree wealth.',
  },
  sa2: {
    term: 'SA2 (Statistical Area Level 2)',
    definition:
      'The ABS geography used here — roughly a suburb or a group of small towns, with a median population near 10,000. There are 2,454 of them covering all of Australia, which makes SA2 the finest geography DSS publishes payment data for.',
  },
  ced: {
    term: 'Commonwealth Electoral Division',
    definition:
      'A federal electorate — the area represented by one member of the House of Representatives. There are 150, each with roughly equal numbers of enrolled voters, redistributed periodically by the AEC.',
  },
  erp: {
    term: 'Estimated Resident Population (ERP)',
    definition:
      'The ABS official population count for an area, updated annually between censuses. It is the denominator for every rate on this site.',
  },
  dsp: {
    term: 'Disability Support Pension (DSP)',
    definition:
      'Income support for people whose permanent physical, intellectual or psychiatric condition prevents them working 15 or more hours a week. Recipients transfer to the Age Pension when they reach pension age.',
  },
  jobseeker: {
    term: 'JobSeeker Payment',
    definition:
      'The main unemployment payment, for people aged 22 up to Age Pension age who are looking for work or temporarily unable to work. It replaced Newstart Allowance in March 2020.',
  },
  cra: {
    term: 'Commonwealth Rent Assistance',
    definition:
      'A supplement paid on top of another payment to people who rent privately. It is not a payment you can receive on its own, so it is never counted in the income support total.',
  },
  ftb: {
    term: 'Family Tax Benefit',
    definition:
      'A per-child payment for families with dependent children, paid at two rates (A and B). Most families with children receive some FTB, including many who work full time, so it is not counted as income support.',
  },
  'concession card': {
    term: 'Concession card',
    definition:
      'An entitlement card (Pension Concession, Health Care, Low Income, Commonwealth Seniors Health) giving cheaper medicines and services. Cards are held alongside payments, so counting them as welfare recipients would count many people twice.',
  },
  rounding: {
    term: 'Rounding to the nearest 5',
    definition:
      'DSS rounds every published count to the nearest 5 to protect privacy. A published 0 can therefore mean "nobody" or "fewer than 5". For small areas this makes rates jumpy, which is why rankings on this site exclude areas under 5,000 residents.',
  },
  'pension illusion': {
    term: 'The Pension Illusion',
    definition:
      'The effect this site is built around: because the Age Pension is by far the largest payment, any welfare measure that includes it mostly measures how old an area is. Two areas with identical headline rates can have completely different working-age rates.',
  },
  quarter: {
    term: 'Reference quarter',
    definition:
      'DSS publishes a snapshot of everyone receiving each payment at a point in time, four times a year (March, June, September, December). Figures are a count of people on the books at that date, not a count over the whole quarter.',
  },
};

export function lookup(term: string): GlossaryEntry | null {
  return GLOSSARY[term.toLowerCase()] ?? null;
}

/** Markup for an inline glossary affordance. */
export function gloss(term: string, label?: string): string {
  const entry = lookup(term);
  const text = label ?? entry?.term ?? term;
  if (!entry) return text;
  return `<span class="glossary-link" data-term="${term.toLowerCase()}" role="button" tabindex="0" aria-label="Definition of ${entry.term}">${text}<span class="glossary-icon" aria-hidden="true">i</span></span>`;
}
