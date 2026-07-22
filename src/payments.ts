// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
// The payment taxonomy. Mirrors pipeline/aggregate.mjs — keep the keys in sync.
//
// The distinction that matters everywhere on this site: INCOME_SUPPORT payments
// are mutually exclusive (a person receives at most one), so they can be summed
// into a headcount. SUPPLEMENTS and CARDS are held *alongside* an income support
// payment, so summing them would count the same person several times.

export interface PaymentDef {
  key: string;
  label: string;
  short: string;
  family: FamilyKey;
  blurb: string;
}

export type FamilyKey = 'pension' | 'disability' | 'carer' | 'unemployment' | 'parenting' | 'study' | 'other';

export const FAMILIES: Record<FamilyKey, { label: string; colour: string; blurb: string }> = {
  pension: {
    label: 'Age Pension',
    colour: '#1e3a5f',
    blurb: 'Income support for people at or above Age Pension age (67).',
  },
  disability: {
    label: 'Disability',
    colour: '#0f766e',
    blurb: 'Disability Support Pension — for people unable to work 15+ hours a week due to a permanent condition.',
  },
  carer: {
    label: 'Carer',
    colour: '#7c3aed',
    blurb: 'Carer Payment — income support for someone providing constant care to a person with disability or illness.',
  },
  unemployment: {
    label: 'Unemployment',
    colour: '#c2410c',
    blurb: 'JobSeeker Payment and Youth Allowance (other) — for people looking for work.',
  },
  parenting: {
    label: 'Parenting',
    colour: '#be185d',
    blurb: 'Parenting Payment for the principal carer of a young child.',
  },
  study: {
    label: 'Study',
    colour: '#0369a1',
    blurb: 'Austudy, Youth Allowance (student) and ABSTUDY living allowance — for students and apprentices.',
  },
  other: {
    label: 'Other',
    colour: '#64748b',
    blurb: 'Special Benefit — a discretionary payment for people in severe hardship who qualify for nothing else.',
  },
};

export const INCOME_SUPPORT: PaymentDef[] = [
  { key: 'ap', label: 'Age Pension', short: 'Age Pension', family: 'pension', blurb: 'Paid to people 67 and over who meet the income and assets tests.' },
  { key: 'dsp', label: 'Disability Support Pension', short: 'DSP', family: 'disability', blurb: 'For people with a permanent physical, intellectual or psychiatric condition that stops them working 15+ hours a week.' },
  { key: 'cp', label: 'Carer Payment', short: 'Carer Payment', family: 'carer', blurb: 'Income support for someone who cannot work because they provide constant care.' },
  { key: 'js', label: 'JobSeeker Payment', short: 'JobSeeker', family: 'unemployment', blurb: 'The main unemployment payment for people aged 22 to Age Pension age.' },
  { key: 'pps', label: 'Parenting Payment Single', short: 'Parenting (single)', family: 'parenting', blurb: 'For single principal carers of a child under 14.' },
  { key: 'ppp', label: 'Parenting Payment Partnered', short: 'Parenting (partnered)', family: 'parenting', blurb: 'For partnered principal carers of a child under 6.' },
  { key: 'yao', label: 'Youth Allowance (other)', short: 'YA (job seeker)', family: 'unemployment', blurb: 'The unemployment payment for job seekers under 22.' },
  { key: 'yas', label: 'Youth Allowance (student and apprentice)', short: 'YA (student)', family: 'study', blurb: 'For full-time students and apprentices under 25.' },
  { key: 'aus', label: 'Austudy', short: 'Austudy', family: 'study', blurb: 'For full-time students and apprentices aged 25 and over.' },
  { key: 'abl', label: 'ABSTUDY (Living allowance)', short: 'ABSTUDY', family: 'study', blurb: 'Living allowance for Aboriginal and Torres Strait Islander students and apprentices.' },
  { key: 'sb', label: 'Special Benefit', short: 'Special Benefit', family: 'other', blurb: 'A discretionary payment for people in severe financial hardship who qualify for no other payment.' },
];

export const SUPPLEMENTS: PaymentDef[] = [
  { key: 'cra', label: 'Commonwealth Rent Assistance', short: 'Rent Assistance', family: 'other', blurb: 'A supplement for renters already receiving a payment — not a payment on its own.' },
  { key: 'ftba', label: 'Family Tax Benefit A', short: 'FTB A', family: 'parenting', blurb: 'Per-child family payment, paid to most families with dependent children.' },
  { key: 'ftbb', label: 'Family Tax Benefit B', short: 'FTB B', family: 'parenting', blurb: 'Extra help for single-parent and single-income families.' },
  { key: 'ftbac', label: 'Family Tax Benefit A Children', short: 'FTB A children', family: 'parenting', blurb: 'The number of children covered by FTB A (not a count of recipients).' },
  { key: 'ca', label: 'Carer Allowance', short: 'Carer Allowance', family: 'carer', blurb: 'A supplement for carers — can be held alongside work or another payment.' },
  { key: 'cachc', label: 'Carer Allowance (Child Health Care Card only)', short: 'Carer Allowance (HCC)', family: 'carer', blurb: 'Health Care Card for a child with disability, without the allowance.' },
  { key: 'abn', label: 'ABSTUDY (Non-living allowance)', short: 'ABSTUDY (other)', family: 'study', blurb: 'ABSTUDY components other than the living allowance.' },
];

export const CARDS: PaymentDef[] = [
  { key: 'pcc', label: 'Pension Concession Card', short: 'Pension Concession', family: 'pension', blurb: 'Concession card automatically issued with most pensions.' },
  { key: 'hcc', label: 'Health Care Card', short: 'Health Care Card', family: 'other', blurb: 'Concession card for people on lower payments or low incomes.' },
  { key: 'cshc', label: 'Commonwealth Seniors Health Card', short: 'Seniors Health Card', family: 'pension', blurb: 'For self-funded retirees of Age Pension age who fail the pension income test.' },
  { key: 'lic', label: 'Low Income Card', short: 'Low Income Card', family: 'other', blurb: 'Concession card based on income alone, for people not on a payment.' },
];

export const ALL_PAYMENTS: PaymentDef[] = [...INCOME_SUPPORT, ...SUPPLEMENTS, ...CARDS];

export const PAYMENT_BY_KEY: Record<string, PaymentDef> = Object.fromEntries(
  ALL_PAYMENTS.map((p) => [p.key, p]),
);

/** Income support keys grouped into the seven families used by the matrix view. */
export const FAMILY_KEYS: Record<FamilyKey, string[]> = INCOME_SUPPORT.reduce(
  (acc, p) => {
    acc[p.family].push(p.key);
    return acc;
  },
  { pension: [], disability: [], carer: [], unemployment: [], parenting: [], study: [], other: [] } as Record<FamilyKey, string[]>,
);

export const FAMILY_ORDER: FamilyKey[] = ['pension', 'disability', 'carer', 'unemployment', 'parenting', 'study', 'other'];
