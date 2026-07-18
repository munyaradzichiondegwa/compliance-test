// Risk Scoring Engine — PRD Section 10.4.
// RSK-01: Risk Score = Likelihood x Impact, 1-25 scale.
// RSK-02: Low (1-5), Medium (6-12), High (13-19), Critical (20-25).
// RSK-03: Residual Risk after mitigation effectiveness is applied.

export type RiskCategory = 'Low' | 'Medium' | 'High' | 'Critical';

export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

export function riskCategory(score: number): RiskCategory {
  if (score >= 20) return 'Critical';
  if (score >= 13) return 'High';
  if (score >= 6) return 'Medium';
  return 'Low';
}

export function riskCategoryColor(category: RiskCategory): string {
  switch (category) {
    case 'Critical':
      return '#7f1d1d';
    case 'High':
      return '#dc2626';
    case 'Medium':
      return '#f59e0b';
    case 'Low':
      return '#16a34a';
  }
}

/**
 * Effectiveness ratings map to a percentage reduction applied to the
 * inherent likelihood x impact score in order to derive a residual score
 * (RSK-03). Where explicit residual likelihood/impact values are recorded
 * against a mitigation, those take precedence (more accurate than a flat
 * percentage reduction).
 */
const EFFECTIVENESS_REDUCTION: Record<'Low' | 'Medium' | 'High', number> = {
  Low: 0.15,
  Medium: 0.4,
  High: 0.65,
};

export function residualScoreFromEffectiveness(
  inherentScore: number,
  effectiveness: 'Low' | 'Medium' | 'High'
): number {
  const reduction = EFFECTIVENESS_REDUCTION[effectiveness];
  return Math.round(inherentScore * (1 - reduction));
}

export interface HeatMapCell {
  likelihood: number;
  impact: number;
  score: number;
  category: RiskCategory;
  count: number;
}

export function buildHeatMap(risks: { likelihood: number; impact: number }[]): HeatMapCell[] {
  const cells: HeatMapCell[] = [];
  for (let l = 1; l <= 5; l++) {
    for (let i = 1; i <= 5; i++) {
      const score = riskScore(l, i);
      const count = risks.filter((r) => r.likelihood === l && r.impact === i).length;
      cells.push({ likelihood: l, impact: i, score, category: riskCategory(score), count });
    }
  }
  return cells;
}
