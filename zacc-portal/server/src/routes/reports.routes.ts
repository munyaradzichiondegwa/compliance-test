import { Router } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { buildScorecardPdf } from '../utils/pdf';

const router = Router();
router.use(authenticate);

// GET /api/v1/reports/catalogue — what's available, and how each is generated
router.get(
  '/catalogue',
  asyncHandler(async (_req, res) => {
    res.json([
      { code: 'ASSESSMENT_REPORT', name: 'Compliance Assessment Report', format: 'PDF', endpoint: 'GET /api/v1/assessments/:id/report' },
      { code: 'SCORECARD', name: 'Institutional Scorecard', format: 'PDF', endpoint: 'GET /api/v1/reports/scorecard/:institutionId' },
      { code: 'RECOMMENDATION_REGISTER', name: 'Recommendation Register', format: 'CSV', endpoint: 'GET /api/v1/recommendations/register/export.csv' },
      { code: 'RISK_REGISTER', name: 'Corruption Risk Register', format: 'CSV', endpoint: 'GET /api/v1/risk-register/export.csv' },
      { code: 'AUDIT_LOG', name: 'Audit Log Export', format: 'CSV', endpoint: 'GET /api/v1/audit-logs/export.csv' },
    ]);
  })
);

// GET /api/v1/reports/scorecard/:institutionId
router.get(
  '/scorecard/:institutionId',
  asyncHandler(async (req, res) => {
    const inst = db.prepare(`SELECT * FROM institutions WHERE id = ?`).get(req.params.institutionId) as any;
    if (!inst) return res.status(404).json({ error: 'Institution not found' });

    const history = db.prepare(`SELECT created_at, composite_score, rag_status FROM assessments WHERE institution_id = ? AND composite_score IS NOT NULL ORDER BY created_at ASC`).all(req.params.institutionId) as any[];
    const latest = history[history.length - 1];
    const openRecs = db.prepare(`SELECT COUNT(*) c FROM recommendations WHERE institution_id = ? AND status NOT IN ('Closed','Verified')`).get(req.params.institutionId) as { c: number };
    const closedRecs = db.prepare(`SELECT COUNT(*) c FROM recommendations WHERE institution_id = ? AND status IN ('Closed','Verified')`).get(req.params.institutionId) as { c: number };
    const openRisks = db.prepare(`SELECT name, category, inherent_score FROM corruption_risks WHERE institution_id = ? AND treatment_status = 'Open' ORDER BY inherent_score DESC`).all(req.params.institutionId) as any[];

    const pdf = await buildScorecardPdf({
      institutionName: inst.name,
      province: inst.province,
      sector: inst.sector,
      riskLevel: inst.risk_level,
      latestScore: latest ? latest.composite_score : null,
      latestRag: latest ? latest.rag_status : null,
      assessmentHistory: history.map((h) => ({ date: h.created_at.slice(0, 10), score: h.composite_score, rag: h.rag_status })),
      openRecommendations: openRecs.c,
      closedRecommendations: closedRecs.c,
      openRisks: openRisks.map((r) => ({ name: r.name, category: r.category, score: r.inherent_score })),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Scorecard_${inst.name.replace(/\s+/g, '_')}.pdf"`);
    res.send(pdf);
  })
);

export default router;
