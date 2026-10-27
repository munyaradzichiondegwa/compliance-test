import { Router } from 'express';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';
import { HttpError } from '../engagement/engine';

// AI governance: explainability, human-override log and bias monitoring (Section on AI controls).
const router = Router();
router.use(authenticate);
const REVIEWERS = ['COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MANAGER_COMPLIANCE', 'GM_PREVENTION', 'PROVINCIAL_HEAD', 'SUPER_ADMIN'];
const OVERSIGHT = ['GM_PREVENTION', 'MANAGER_COMPLIANCE', 'AUDITOR', 'SUPER_ADMIN'];
const parse = (r: any) => ({ ...r, explanation: JSON.parse(r.explanation || '{}') });

router.get('/decisions', requireRole(...REVIEWERS, 'AUDITOR'), asyncHandler(async (req, res) => {
  const { feature, action, institutionId } = req.query as Record<string, string>;
  let sql = `SELECT d.*, i.name AS institution_name, g.name AS generated_by_name, h.name AS human_name FROM ai_decisions d LEFT JOIN institutions i ON i.id = d.institution_id LEFT JOIN users g ON g.id = d.generated_by LEFT JOIN users h ON h.id = d.human_user_id WHERE 1=1`;
  const p: any[] = [];
  if (feature) { sql += ` AND d.feature = ?`; p.push(feature); }
  if (action) { sql += ` AND d.human_action = ?`; p.push(action); }
  if (institutionId) { sql += ` AND d.institution_id = ?`; p.push(institutionId); }
  res.json((db.prepare(sql + ` ORDER BY d.generated_at DESC LIMIT 300`).all(...p) as any[]).map(parse));
}));

router.get('/decisions/:id', requireRole(...REVIEWERS, 'AUDITOR'), asyncHandler(async (req, res) => {
  const d = db.prepare(`SELECT * FROM ai_decisions WHERE id = ?`).get(req.params.id) as any;
  if (!d) throw new HttpError(404, 'Not found');
  res.json(parse(d));
}));

// A human must act on an AI output. Modified/Overridden need a reason; accepted/modified narrative text is applied.
router.post('/decisions/:id/review', requireRole(...REVIEWERS), asyncHandler(async (req, res) => {
  const d = db.prepare(`SELECT * FROM ai_decisions WHERE id = ?`).get(req.params.id) as any;
  if (!d) throw new HttpError(404, 'Not found');
  if (d.human_action !== 'Pending') throw new HttpError(400, 'This AI output has already been reviewed');
  const { action, reason, finalText } = req.body || {};
  if (!['Accepted', 'Modified', 'Overridden'].includes(action)) throw new HttpError(400, 'action must be Accepted, Modified or Overridden');
  if (action !== 'Accepted' && (!reason || String(reason).trim().length < 5)) throw new HttpError(400, 'A reason is required when modifying or overriding an AI output');
  if (action === 'Modified' && !finalText) throw new HttpError(400, 'finalText is required when modifying');
  const final = action === 'Accepted' ? d.output_text : action === 'Modified' ? String(finalText) : null;
  db.transaction(() => {
    db.prepare(`UPDATE ai_decisions SET human_action = ?, human_user_id = ?, human_reason = ?, final_text = ?, acted_at = datetime('now') WHERE id = ?`).run(action, req.user!.sub, reason || null, final, d.id);
    if (d.feature === 'assessment_narrative' && d.entity_id && final) db.prepare(`UPDATE assessments SET findings_text = ?, updated_at = datetime('now') WHERE id = ?`).run(final, d.entity_id);
    if (d.feature === 'assessment_narrative' && d.entity_id && action === 'Overridden') db.prepare(`UPDATE assessments SET ai_summary = NULL WHERE id = ?`).run(d.entity_id);
    if (d.feature === 'review_summary' && d.entity_id && final) db.prepare(`UPDATE systems_reviews SET ai_summary = ? WHERE id = ?`).run(final, d.entity_id);
  })();
  writeAudit({ userId: req.user!.sub, action: `AI_${action.toUpperCase()}`, entityType: 'ai_decision', entityId: d.id, details: { feature: d.feature } });
  res.json({ ok: true });
}));

// Bias & quality monitoring: override rates per feature and user, and outcome disparities across provinces / institution types.
router.get('/bias', requireRole(...OVERSIGHT), asyncHandler(async (_req, res) => {
  const features = db.prepare(`SELECT feature, COUNT(*) AS total, SUM(human_action = 'Pending') AS pending, SUM(human_action = 'Accepted') AS accepted, SUM(human_action = 'Modified') AS modified, SUM(human_action = 'Overridden') AS overridden FROM ai_decisions GROUP BY feature`).all() as any[];
  const withRates = features.map((f) => { const reviewed = f.total - f.pending; return { ...f, reviewed, overrideRate: reviewed ? Math.round(((f.modified + f.overridden) / reviewed) * 1000) / 10 : null, alert: reviewed >= 5 && (f.modified + f.overridden) / reviewed > 0.4 ? 'High override rate — review the logic' : null }; });

  // Disparity: share of institutions with a "Deteriorating" trend prediction or a Red-rated narrative, by province and type.
  const rows = db.prepare(`SELECT d.feature, d.output_text, i.province, i.type FROM ai_decisions d JOIN institutions i ON i.id = d.institution_id WHERE d.feature IN ('trend_prediction','assessment_narrative')`).all() as any[];
  const flagged = (r: any) => (r.feature === 'trend_prediction' ? /Deteriorating/.test(r.output_text) : /classified as Red/.test(r.output_text));
  const overall = rows.length ? rows.filter(flagged).length / rows.length : 0;
  const disparity = (key: 'province' | 'type') => {
    const g: Record<string, { n: number; f: number }> = {};
    rows.forEach((r) => { const k = r[key]; g[k] = g[k] || { n: 0, f: 0 }; g[k].n++; if (flagged(r)) g[k].f++; });
    return Object.entries(g).map(([group, v]) => { const rate = v.f / v.n; return { group, n: v.n, adverseRate: Math.round(rate * 1000) / 10, ratioToOverall: overall ? Math.round((rate / overall) * 100) / 100 : null, alert: v.n >= 3 && overall > 0 && rate / overall > 1.5 ? 'Adverse AI outcomes are over-represented in this group — check data quality' : null }; }).sort((a, b) => b.adverseRate - a.adverseRate);
  };
  const byUser = db.prepare(`SELECT u.name, COUNT(*) AS reviewed, SUM(d.human_action IN ('Modified','Overridden')) AS changed FROM ai_decisions d JOIN users u ON u.id = d.human_user_id WHERE d.human_action != 'Pending' GROUP BY u.id ORDER BY changed DESC`).all();
  res.json({ overallAdverseRate: Math.round(overall * 1000) / 10, sampleSize: rows.length, features: withRates, byProvince: disparity('province'), byInstitutionType: disparity('type'), reviewers: byUser,
    controls: ['Every AI output is logged with model version, inputs and explanation', 'A named human must accept, modify or override each output; reasons are mandatory for changes', 'Overrides and disparities are monitored here and reviewed by the General Manager'] });
}));

export default router;
