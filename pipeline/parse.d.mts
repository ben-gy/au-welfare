// Types for the pure parsers in parse.mjs. The pipeline runs as plain ESM in Node;
// this exists so the frontend tests can exercise the exact parser that ships,
// rather than a TypeScript reimplementation of it.

export interface ErpEntry { total: number; working: number; senior: number }

export const MIN_DENOM: { total: number; working: number; senior: number };

export function parseCsv(text: string): string[][];
export function csvObjects(text: string): Record<string, string>[];
export function num(v: unknown): number;
export function safeRate(numer: number, denom: number, floor?: number): number | null;
export function incomeSupportTotal(vals: Record<string, number>): number;
export function serialToMonth(serial: number): string;
export function parseErp(csvText: string): { year: number; pop: Map<string, ErpEntry> };
export function unzip(buf: Buffer): Map<string, Buffer>;
export function parseNationalXlsx(buf: Buffer): { months: string[]; series: Record<string, (number | null)[]> };
export const ALL_PAYMENTS: Record<string, string>;
export const IS_KEYS: string[];
export const INCOME_SUPPORT: Record<string, string>;
export const SUPPLEMENTARY: Record<string, string>;
export const CARDS: Record<string, string>;
