// Types for the pure helpers the frontend tests import from the pipeline.
// The pipeline itself runs as plain ESM in Node; this only exists so the same
// parser that ships is the one under test, without duplicating it in TypeScript.

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
