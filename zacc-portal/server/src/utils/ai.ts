// AI & Machine Learning Module — PRD Section 10.6.
//
// Engineering note (read this before assuming a hidden LLM call is involved):
// per Section 10.6's own note, "no institutional or whistleblower data is
// transmitted to third-party AI services without explicit DPO approval." In
// keeping with that constraint — and because this environment has no
// provisioned LLM API credentials for a standalone server to call — every
// feature below is a genuine, self-contained, deterministic implementation
// (extractive summarisation, token-similarity duplicate detection, linear
// trend projection, keyword relevance search) that runs entirely on
// ZACC-controlled infrastructure with no external network call. Each
// function is a real, working implementation, not a stub — but it is
// intentionally "Phase 4-appropriate" statistical/heuristic AI rather than
// a generative model. The clearly marked extension point at the bottom shows
// exactly where a real LLM (e.g. via Claude's API, once DPO-approved) would
// be wired in later without changing any calling code.

const STOPWORDS = new Set([
  'the','a','an','and','or','but','is','are','was','were','be','been','being','to','of','in','on','for',
  'with','as','by','at','from','that','this','these','those','it','its','into','has','have','had','not',
  'no','than','then','so','such','which','who','whom','will','shall','should','would','can','could','may',
  'might','must','also','there','their','they','them','he','she','his','her','we','our','you','your',
]);

function tokenize(text: string): string[] {
  const raw = (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => !STOPWORDS.has(t) && t.length > 2);
  return raw.map(stem);
}

/** Minimal, explainable suffix-stripping stemmer (not a full Porter stemmer) —
 * enough to match common inflections ("requisitions" / "requisition",
 * "approved" / "approving") without the complexity or false-collision risk
 * of a full stemming library. */
function stem(word: string): string {
  if (word.endsWith('ies') && word.length > 5) return word.slice(0, -3) + 'y';
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 4) return word.slice(0, -1);
  return word;
}

// ---------------------------------------------------------------------------
// AI-01: Auto-summarisation (extractive, word-frequency sentence scoring)
// ---------------------------------------------------------------------------
export function summarize(text: string, maxSentences = 4): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  if (sentences.length <= maxSentences) return clean;

  const freq: Record<string, number> = {};
  tokenize(clean).forEach((tok) => {
    freq[tok] = (freq[tok] || 0) + 1;
  });

  const scored = sentences.map((sentence, idx) => {
    const toks = tokenize(sentence);
    const score = toks.reduce((sum, t) => sum + (freq[t] || 0), 0) / Math.max(toks.length, 1);
    return { sentence: sentence.trim(), score, idx };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.idx - b.idx); // restore original reading order

  return top.map((s) => s.sentence).join(' ');
}

// ---------------------------------------------------------------------------
// AI-02: Duplicate finding detection (Jaccard token-similarity)
// ---------------------------------------------------------------------------
export function textSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach((t) => {
    if (setB.has(t)) intersection++;
  });
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface DuplicateMatch {
  id: string;
  score: number;
}

export function findDuplicates<T extends { id: string; text: string }>(
  candidate: string,
  existing: T[],
  threshold = 0.28
): DuplicateMatch[] {
  return existing
    .map((e) => ({ id: e.id, score: textSimilarity(candidate, e.text) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// AI-03: Auto-drafting of Compliance Assessment Reports from checklist data
// ---------------------------------------------------------------------------
export interface ChecklistItemForDraft {
  section: string;
  item_text: string;
  response: string | null;
  comments: string | null;
}

export function autoDraftAssessmentNarrative(params: {
  institutionName: string;
  sectionScores: Record<string, number | null>;
  compositeScore: number;
  ragStatus: string;
  items: ChecklistItemForDraft[];
}): string {
  const { institutionName, sectionScores, compositeScore, ragStatus, items } = params;
  const nonCompliant = items.filter((i) => i.response === 'NonCompliant');
  const partial = items.filter((i) => i.response === 'PartiallyCompliant');

  const sectionLines = Object.entries(sectionScores)
    .map(([k, v]) => `${capitalize(k)}: ${v !== null && v !== undefined ? v.toFixed(0) : 'N/A'}/100`)
    .join(', ');

  let narrative = `This assessment of ${institutionName} produced a composite compliance score of ${compositeScore.toFixed(1)}/100, classified as ${ragStatus}. Section results were: ${sectionLines}. `;

  if (nonCompliant.length > 0) {
    narrative += `${nonCompliant.length} checklist item(s) were assessed as non-compliant, most notably: ${nonCompliant
      .slice(0, 3)
      .map((i) => `"${i.item_text}"`)
      .join('; ')}. `;
  }
  if (partial.length > 0) {
    narrative += `A further ${partial.length} item(s) were partially compliant and represent the fastest route to score improvement. `;
  }
  if (nonCompliant.length === 0 && partial.length === 0) {
    narrative += `No non-compliant or partially compliant items were recorded in this cycle. `;
  }
  narrative += `Recommendations have been auto-generated against each non-compliant and partially-compliant item, with owners and due dates assigned per the institution's implementation matrix.`;
  return narrative;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// AI-04: Predictive risk modelling (ordinary least squares trend projection)
// ---------------------------------------------------------------------------
export interface TrendPoint {
  date: string;
  score: number;
}

export interface TrendPrediction {
  slope: number;
  predictedNextScore: number;
  trend: 'Improving' | 'Deteriorating' | 'Stable';
  confidence: 'Low' | 'Medium' | 'High';
}

export function predictTrend(points: TrendPoint[]): TrendPrediction | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  const xs = sorted.map((_, i) => i);
  const ys = sorted.map((p) => p.score);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const predictedNextScore = Math.max(0, Math.min(100, slope * n + intercept));

  let trend: TrendPrediction['trend'] = 'Stable';
  if (slope > 1.5) trend = 'Improving';
  else if (slope < -1.5) trend = 'Deteriorating';

  const confidence: TrendPrediction['confidence'] = n >= 5 ? 'High' : n >= 3 ? 'Medium' : 'Low';

  return { slope: Math.round(slope * 100) / 100, predictedNextScore: Math.round(predictedNextScore * 100) / 100, trend, confidence };
}

// ---------------------------------------------------------------------------
// AI-05: Natural-language search (keyword/TF relevance ranking)
// ---------------------------------------------------------------------------
export interface SearchDoc {
  id: string;
  title: string;
  text: string;
  entityType: string;
}

export interface SearchResult {
  id: string;
  title: string;
  entityType: string;
  score: number;
  snippet: string;
}

export function nlSearch(query: string, docs: SearchDoc[], limit = 10): SearchResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const results = docs.map((doc) => {
    const docTokens = tokenize(doc.text + ' ' + doc.title);
    const docFreq: Record<string, number> = {};
    docTokens.forEach((t) => (docFreq[t] = (docFreq[t] || 0) + 1));
    let score = 0;
    queryTokens.forEach((qt) => {
      if (docFreq[qt]) score += docFreq[qt];
      if (doc.title.toLowerCase().includes(qt)) score += 3; // title matches weighted higher
    });
    const snippet = buildSnippet(doc.text, queryTokens);
    return { id: doc.id, title: doc.title, entityType: doc.entityType, score, snippet };
  });

  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function buildSnippet(text: string, queryTokens: string[]): string {
  const lower = text.toLowerCase();
  for (const qt of queryTokens) {
    const idx = lower.indexOf(qt);
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + 100);
      return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
    }
  }
  return text.slice(0, 140) + (text.length > 140 ? '…' : '');
}

// ---------------------------------------------------------------------------
// Extension point for a future real LLM integration (documented, not wired):
//
// export async function llmSummarize(text: string): Promise<string> {
//   // Once DPO approval + API credentials are provisioned:
//   // const res = await fetch('https://api.anthropic.com/v1/messages', { ... });
//   // return res.content...
// }
// ---------------------------------------------------------------------------
