import { db } from '../db';

// Procurement Monitoring red-flag rules — PRD Section 10.1 ("PRAZ eGP
// integration, automated red-flag alert system"). Each rule below runs
// against the full procurement history for the institution and returns the
// flags that apply to the record being evaluated.

export const SINGLE_SOURCE_THRESHOLD = 25000; // USD
export const SPLIT_PURCHASE_WINDOW_DAYS = 30;
export const SPLIT_PURCHASE_THRESHOLD = 40000; // USD combined, same supplier+institution
export const SUPPLIER_CONCENTRATION_WINDOW_DAYS = 60;
export const SUPPLIER_CONCENTRATION_INSTITUTION_COUNT = 3;

export interface ProcurementRecordInput {
  institution_id: string;
  supplier_name: string;
  contract_number: string | null;
  value: number;
  method: string;
  procurement_date: string;
}

export function evaluateRedFlags(record: ProcurementRecordInput, excludeId?: string): string[] {
  const flags: string[] = [];

  // Rule 1: single-sourcing above threshold
  if (record.method === 'SingleSource' && record.value >= SINGLE_SOURCE_THRESHOLD) {
    flags.push(`Single-source award of $${record.value.toLocaleString()} exceeds the $${SINGLE_SOURCE_THRESHOLD.toLocaleString()} threshold requiring open tender justification.`);
  }

  // Rule 2: missing contract number
  if (!record.contract_number || record.contract_number.trim() === '') {
    flags.push('Missing contract number.');
  } else {
    // Rule 3: duplicate contract number across the system
    const dup = db
      .prepare(`SELECT id FROM procurement_records WHERE contract_number = ? AND id != ?`)
      .get(record.contract_number, excludeId ?? '') as { id: string } | undefined;
    if (dup) flags.push(`Contract number "${record.contract_number}" duplicates an existing record.`);
  }

  // Rule 4: possible split purchase — same supplier + institution, recent window, combined value over threshold
  const windowStart = new Date(record.procurement_date);
  windowStart.setDate(windowStart.getDate() - SPLIT_PURCHASE_WINDOW_DAYS);
  const recent = db
    .prepare(
      `SELECT value FROM procurement_records
       WHERE institution_id = ? AND supplier_name = ? AND id != ?
       AND procurement_date >= ? AND procurement_date <= ?`
    )
    .all(record.institution_id, record.supplier_name, excludeId ?? '', windowStart.toISOString().slice(0, 10), record.procurement_date) as { value: number }[];
  const combined = recent.reduce((sum, r) => sum + r.value, 0) + record.value;
  if (recent.length >= 1 && combined >= SPLIT_PURCHASE_THRESHOLD && record.value < SINGLE_SOURCE_THRESHOLD) {
    flags.push(`Possible split purchase: ${recent.length + 1} awards to "${record.supplier_name}" within ${SPLIT_PURCHASE_WINDOW_DAYS} days total $${combined.toLocaleString()}.`);
  }

  // Rule 5: supplier concentration across many institutions in a short window (possible favouritism / conflict of interest)
  const concWindowStart = new Date(record.procurement_date);
  concWindowStart.setDate(concWindowStart.getDate() - SUPPLIER_CONCENTRATION_WINDOW_DAYS);
  const crossInst = db
    .prepare(
      `SELECT DISTINCT institution_id FROM procurement_records
       WHERE supplier_name = ? AND id != ? AND procurement_date >= ? AND procurement_date <= ?`
    )
    .all(record.supplier_name, excludeId ?? '', concWindowStart.toISOString().slice(0, 10), record.procurement_date) as { institution_id: string }[];
  const distinctInstitutions = new Set(crossInst.map((r) => r.institution_id));
  distinctInstitutions.add(record.institution_id);
  if (distinctInstitutions.size >= SUPPLIER_CONCENTRATION_INSTITUTION_COUNT) {
    flags.push(`Supplier "${record.supplier_name}" has won contracts at ${distinctInstitutions.size} different institutions within ${SUPPLIER_CONCENTRATION_WINDOW_DAYS} days.`);
  }

  return flags;
}
