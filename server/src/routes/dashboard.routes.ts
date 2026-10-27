import { logAi, AI_EXPLANATIONS } from '../utils/aiGov';
import { isInstitutionRole, staffOnly } from '../middleware/scope';
import { Router } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { predictTrend } from '../utils/ai';

const router = Router();
router.use(authenticate);

// GET /api/v1/dashboard/overview — top-line KPIs for any signed-in user. Institution users see their own
// institution only; Provincial Heads see their province; everyone else sees the national picture.
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    let instId: string | null = null;
    let prov: string | null = null;
    if (isInstitutionRole(u.role)) { if (!u.institutionId) return res.status(403).json({ error: 'No institution is linked to your account' }); instId = u.institutionId; }
    else if (u.role === 'PROVINCIAL_HEAD') prov = (db.prepare(`SELECT province FROM users WHERE id = ?`).get(u.sub) as any)?.province || null;
    const scopeI = `(? IS NULL OR i.id = ?) AND (? IS NULL OR i.province = ?)`;
    const sp = [instId, instId, prov, prov];
    const institutions = db.prepare(`SELECT COUNT(*) c FROM institutions i WHERE i.status='Active' AND ${scopeI}`).get(...sp) as { c: number };
    const assessmentsThisYear = db.prepare(`SELECT COUNT(*) c FROM assessments a JOIN institutions i ON i.id = a.institution_id WHERE a.status='Closed' AND a.created_at >= date('now','start of year') AND ${scopeI}`).get(...sp) as { c: number };
    const openRecs = db.prepare(`SELECT COUNT(*) c FROM recommendations r JOIN institutions i ON i.id = r.institution_id WHERE r.status NOT IN ('Closed','Verified') AND ${scopeI}`).get(...sp) as { c: number };
    const overdueRecs = db.prepare(`SELECT COUNT(*) c FROM recommendations r JOIN institutions i ON i.id = r.institution_id WHERE r.status NOT IN ('Closed','Verified') AND r.due_date < date('now') AND ${scopeI}`).get(...sp) as { c: number };
    const openWb = instId ? { c: 0 } : db.prepare(`SELECT COUNT(*) c FROM whistleblower_reports WHERE status NOT IN ('Closed','Insufficient')`).get() as { c: number };
    const avgScore = db.prepare(`SELECT AVG(a.composite_score) a FROM assessments a JOIN institutions i ON i.id = a.institution_id WHERE a.status = 'Closed' AND a.composite_score IS NOT NULL AND ${scopeI}`).get(...sp) as { a: number | null };
    const ragCounts = db.prepare(`
      SELECT a.rag_status, COUNT(*) c FROM assessments a JOIN institutions i ON i.id = a.institution_id
      INNER JOIN (SELECT institution_id, MAX(COALESCE(closed_at, created_at)) as maxDate FROM assessments WHERE status='Closed' GROUP BY institution_id) latest
      ON latest.institution_id = a.institution_id AND COALESCE(a.closed_at, a.created_at) = latest.maxDate
      WHERE ${scopeI} GROUP BY a.rag_status
    `).all(...sp);
    // engagement pipeline (counts only)
    const awaiting = isInstitutionRole(u.role) ? 0 : (db.prepare(`SELECT COUNT(*) c FROM engagements e JOIN institutions i ON i.id = e.institution_id WHERE e.current_step IS NOT NULL AND ${scopeI}`).get(...sp) as { c: number }).c;

    res.json({
      activeInstitutions: institutions.c,
      assessmentsThisYear: assessmentsThisYear.c,
      openRecommendations: openRecs.c,
      overdueRecommendations: overdueRecs.c,
      openWhistleblowerCases: openWb.c,
      avgComplianceScore: avgScore.a ? Math.round(avgScore.a * 10) / 10 : null,
      ragDistribution: ragCounts,
      engagementsAwaitingDecision: awaiting,
      scope: instId ? 'institution' : prov ? 'province' : 'national',
    });
  })
);

// Everything below is analytics for ZACC staff only.
router.use(staffOnly);

// GET /api/v1/dashboard/aud-01-overdue-recommendations — aged 30/60/90 buckets
router.get(
  '/aud-01-overdue-recommendations',
  asyncHandler(async (_req, res) => {
    const rows = db.prepare(`
      SELECT r.*, i.name as institution_name, CAST(julianday('now') - julianday(r.due_date) AS INTEGER) as daysOverdue
      FROM recommendations r JOIN institutions i ON i.id = r.institution_id
      WHERE r.status NOT IN ('Closed','Verified') AND r.due_date < date('now')
      ORDER BY daysOverdue DESC
    `).all() as any[];
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    rows.forEach((r) => {
      if (r.daysOverdue <= 30) buckets['0-30']++;
      else if (r.daysOverdue <= 60) buckets['31-60']++;
      else if (r.daysOverdue <= 90) buckets['61-90']++;
      else buckets['90+']++;
    });
    res.json({ buckets, items: rows });
  })
);

// GET /api/v1/dashboard/aud-02-high-risk-institutions — institutions with an open risk score > 19
router.get(
  '/aud-02-high-risk-institutions',
  asyncHandler(async (_req, res) => {
    const rows = db.prepare(`
      SELECT i.id, i.name, i.province, i.risk_level, MAX(r.inherent_score) as maxRiskScore
      FROM institutions i JOIN corruption_risks r ON r.institution_id = i.id
      WHERE r.treatment_status = 'Open'
      GROUP BY i.id HAVING maxRiskScore > 19
      ORDER BY maxRiskScore DESC
    `).all();
    res.json(rows);
  })
);

// GET /api/v1/dashboard/aud-03-upcoming-deadlines
router.get(
  '/aud-03-upcoming-deadlines',
  asyncHandler(async (_req, res) => {
    const recs = db.prepare(`
      SELECT r.id, r.description, r.due_date, i.name as institution_name, 'Recommendation' as type
      FROM recommendations r JOIN institutions i ON i.id = r.institution_id
      WHERE r.status NOT IN ('Closed','Verified') AND r.due_date BETWEEN date('now') AND date('now','+14 days')
    `).all();
    const pledges = db.prepare(`
      SELECT p.id, p.title as description, p.expiry_date as due_date, i.name as institution_name, 'Pledge Expiry' as type
      FROM pledges p LEFT JOIN institutions i ON i.id = p.institution_id
      WHERE p.expiry_date BETWEEN date('now') AND date('now','+30 days')
    `).all();
    res.json([...recs, ...pledges].sort((a: any, b: any) => a.due_date.localeCompare(b.due_date)));
  })
);

// GET /api/v1/dashboard/aud-04-committee-performance
router.get(
  '/aud-04-committee-performance',
  asyncHandler(async (_req, res) => {
    const committees = db.prepare(`SELECT c.id, c.institution_id, i.name as institution_name FROM integrity_committees c JOIN institutions i ON i.id = c.institution_id`).all() as any[];
    const result = committees.map((c) => {
      const trainingStats = db.prepare(`SELECT COUNT(*) total, SUM(completed) completed FROM committee_trainings WHERE committee_id = ?`).get(c.id) as { total: number; completed: number };
      const meetingCount = db.prepare(`SELECT COUNT(*) c FROM committee_meetings WHERE committee_id = ? AND meeting_date >= date('now','-180 days')`).get(c.id) as { c: number };
      const planStats = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='Complete' THEN 1 ELSE 0 END) complete FROM committee_action_plans WHERE committee_id = ?`).get(c.id) as { total: number; complete: number };
      return {
        institutionName: c.institution_name,
        trainingCompletionRate: trainingStats.total > 0 ? Math.round(((trainingStats.completed || 0) / trainingStats.total) * 100) : null,
        meetingsLast6Months: meetingCount.c,
        actionPlanCompletionRate: planStats.total > 0 ? Math.round(((planStats.complete || 0) / planStats.total) * 100) : null,
      };
    });
    res.json(result);
  })
);

// GET /api/v1/dashboard/aud-05-case-referral-trends — monthly referral counts
router.get(
  '/aud-05-case-referral-trends',
  asyncHandler(async (_req, res) => {
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) c FROM whistleblower_status_updates WHERE status = 'Referred' GROUP BY month ORDER BY month
    `).all();
    res.json(rows);
  })
);

// GET /api/v1/dashboard/aud-06-implementation-rate — systems-review-originated recs closure rate
router.get(
  '/aud-06-implementation-rate',
  asyncHandler(async (_req, res) => {
    const bySource = db.prepare(`
      SELECT source_type, COUNT(*) total, SUM(CASE WHEN status IN ('Closed','Verified') THEN 1 ELSE 0 END) closed
      FROM recommendations GROUP BY source_type
    `).all() as { source_type: string; total: number; closed: number }[];
    res.json(bySource.map((r) => ({ sourceType: r.source_type, total: r.total, closed: r.closed, rate: r.total > 0 ? Math.round((r.closed / r.total) * 100) : null })));
  })
);

// GET /api/v1/dashboard/predictive/:institutionId — AI-04 trend projection for one institution
router.get(
  '/predictive/:institutionId',
  asyncHandler(async (req, res) => {
    const rows = db.prepare(`SELECT created_at as date, composite_score as score FROM assessments WHERE institution_id = ? AND composite_score IS NOT NULL ORDER BY created_at ASC`).all(req.params.institutionId) as any[];
    const prediction = predictTrend(rows);
    let aiDecisionId: string | null = null;
    if (prediction) aiDecisionId = logAi({ feature: 'trend_prediction', entityType: 'institution', entityId: req.params.institutionId, institutionId: req.params.institutionId, input: `${rows.length} assessments`, output: JSON.stringify(prediction), factors: { dataPoints: rows.length, slopePerCycle: prediction.slope }, confidence: prediction.confidence, userId: req.user!.sub }).id;
    res.json({ history: rows, prediction, aiDecisionId, explanation: AI_EXPLANATIONS.trend_prediction, requiresHumanReview: true });
  })
);

export default router;
