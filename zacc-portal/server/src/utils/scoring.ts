// Compliance Assessment weighted scoring engine.
// PRD Section 10.1: Governance 20%, Internal Controls 25%, Procurement 20%,
// Financial Management 20%, Integrity 15%.
// Acceptance criteria: composite score + RAG status computed within 2s of submission
// (in practice this is a synchronous calculation, so it is instantaneous).

export const SECTION_WEIGHTS = {
  governance: 0.2,
  controls: 0.25,
  procurement: 0.2,
  finance: 0.2,
  integrity: 0.15,
} as const;

export type SectionKey = keyof typeof SECTION_WEIGHTS;

export interface SectionScores {
  governance: number | null;
  controls: number | null;
  procurement: number | null;
  finance: number | null;
  integrity: number | null;
}

export type RagStatus = 'Red' | 'Amber' | 'Green';

export function computeCompositeScore(scores: SectionScores): number {
  let total = 0;
  let weightUsed = 0;
  (Object.keys(SECTION_WEIGHTS) as SectionKey[]).forEach((key) => {
    const val = scores[key];
    if (val !== null && val !== undefined && !Number.isNaN(val)) {
      total += val * SECTION_WEIGHTS[key];
      weightUsed += SECTION_WEIGHTS[key];
    }
  });
  if (weightUsed === 0) return 0;
  // Normalise so partially-completed checklists still produce a meaningful
  // provisional score (renormalised across weights actually supplied),
  // while a fully completed checklist uses the exact PRD weights unmodified.
  const normalised = weightUsed < 0.999 ? total / weightUsed : total;
  return Math.round(normalised * 100) / 100;
}

export function ragStatusFor(compositeScore: number): RagStatus {
  if (compositeScore >= 75) return 'Green';
  if (compositeScore >= 50) return 'Amber';
  return 'Red';
}

export function ragLabel(status: RagStatus): string {
  switch (status) {
    case 'Green':
      return 'Green (Compliant)';
    case 'Amber':
      return 'Amber (Partially Compliant)';
    case 'Red':
      return 'Red (Non-Compliant)';
  }
}

/** Response-level scoring used to roll individual checklist items up into a section score. */
export function scoreForResponse(response: string): number | null {
  switch (response) {
    case 'Compliant':
      return 100;
    case 'PartiallyCompliant':
      return 50;
    case 'NonCompliant':
      return 0;
    case 'NotApplicable':
      return null; // excluded from the section average entirely
    default:
      return null;
  }
}

export function averageSectionScore(itemScores: (number | null)[]): number | null {
  const applicable = itemScores.filter((s): s is number => s !== null && s !== undefined);
  if (applicable.length === 0) return null;
  const sum = applicable.reduce((a, b) => a + b, 0);
  return Math.round((sum / applicable.length) * 100) / 100;
}
