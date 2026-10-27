import { v4 as uuid } from 'uuid';
import { db } from '../db';

/** Version string stamped on every AI output so reviewers know which logic produced it. */
export const MODEL_VERSIONS: Record<string, string> = {
  assessment_narrative: 'template-narrative/1.0',
  review_summary: 'extractive-summary/1.0',
  duplicate_detection: 'token-jaccard/1.0',
  trend_prediction: 'ols-trend/1.0',
};

export const AI_EXPLANATIONS: Record<string, { method: string; limitations: string }> = {
  assessment_narrative: { method: 'Deterministic narrative assembled from checklist responses and section scores; no generative model is involved.', limitations: 'Cannot see evidence documents or context; wording must be checked against the actual assessment.' },
  review_summary: { method: 'Extractive summary: the highest-scoring sentences by keyword frequency are kept verbatim.', limitations: 'May omit nuance; it never adds facts that are not in the source text.' },
  duplicate_detection: { method: 'Similarity of word sets (Jaccard index) between a new finding and existing findings.', limitations: 'Paraphrased findings with different vocabulary may not be flagged; a match is a prompt for review, not a verdict.' },
  trend_prediction: { method: 'Ordinary least squares line through past composite scores; slope > 1.5 or < -1.5 points per cycle is called Improving or Deteriorating.', limitations: 'Few data points give low confidence; it cannot anticipate events such as leadership change.' },
};

export function logAi(opts: {
  feature: keyof typeof MODEL_VERSIONS; entityType: string; entityId?: string | null; institutionId?: string | null;
  input?: string; output: string; factors?: Record<string, unknown>; confidence?: string | number | null; userId?: string | null;
}) {
  const id = uuid();
  const base = AI_EXPLANATIONS[opts.feature];
  const explanation = { ...base, factors: opts.factors ?? {}, confidence: opts.confidence ?? null };
  db.prepare(`INSERT INTO ai_decisions (id, feature, entity_type, entity_id, institution_id, model_version, input_summary, output_text, explanation, generated_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, opts.feature, opts.entityType, opts.entityId ?? null, opts.institutionId ?? null, MODEL_VERSIONS[opts.feature], (opts.input || '').slice(0, 500), opts.output.slice(0, 8000), JSON.stringify(explanation), opts.userId ?? null);
  return { id, explanation };
}
