import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';
import { riskScore, riskCategory, residualScoreFromEffectiveness, buildHeatMap } from '../utils/riskEngine';
import { toCsv } from '../utils/csv';

const router = Router();
router.use(authenticate);

// GET /api/v1/risk-register
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { institutionId, category, treatmentStatus, province } = req.query as Record<string, string>;
    let sql = `SELECT r.*, i.name as institution_name, u.name as owner_name FROM corruption_risks r
               LEFT JOIN institutions i ON i.id = r.institution_id LEFT JOIN users u ON u.id = r.owner_id WHERE 1=1`;
    const params: any[] = [];
    if (institutionId) {
      sql += ` AND r.institution_id = ?`;
      params.push(institutionId);
    }
    if (province) {
      sql += ` AND i.province = ?`;
      params.push(province);
    }
    if (category) {
      sql += ` AND r.category = ?`;
      params.push(category);
    }
    if (treatmentStatus) {
      sql += ` AND r.treatment_status = ?`;
      params.push(treatmentStatus);
    }
    sql += ` ORDER BY r.inherent_score DESC`;
    const rows = db.prepare(sql).all(...params) as any[];
    res.json(rows.map((r) => ({ ...r, category_band: riskCategory(r.inherent_score) })));
  })
);

// GET /api/v1/risk-register/heatmap — RSK-04 5x5 heat map data
router.get(
  '/heatmap',
  asyncHandler(async (req, res) => {
    const { institutionId, province } = req.query as Record<string, string>;
    let sql = `SELECT likelihood, impact FROM corruption_risks WHERE 1=1`;
    const params: any[] = [];
    if (province) {
      sql += ` AND institution_id IN (SELECT id FROM institutions WHERE province = ?)`;
      params.push(province);
    }
    if (institutionId) {
      sql += ` AND institution_id = ?`;
      params.push(institutionId);
    }
    const risks = db.prepare(sql).all(...params) as { likelihood: number; impact: number }[];
    res.json(buildHeatMap(risks));
  })
);

// GET /api/v1/risk-register/export.csv
router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const province = (req.query.province as string) || null;
    const rows = db.prepare(`
      SELECT r.name, r.category, i.name as institution, r.likelihood, r.impact, r.inherent_score, r.treatment_status, r.review_date
      FROM corruption_risks r LEFT JOIN institutions i ON i.id = r.institution_id WHERE (? IS NULL OR i.province = ?) ORDER BY r.inherent_score DESC
    `).all(province, province);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Corruption_Risk_Register.csv"');
    res.send(toCsv(rows as any[]));
  })
);

// GET /api/v1/risk-register/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const risk = db.prepare(`SELECT r.*, i.name as institution_name, u.name as owner_name FROM corruption_risks r LEFT JOIN institutions i ON i.id = r.institution_id LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?`).get(req.params.id);
    if (!risk) return res.status(404).json({ error: 'Risk not found' });
    const mitigations = db.prepare(`SELECT * FROM risk_mitigations WHERE risk_id = ? ORDER BY created_at DESC`).all(req.params.id);
    res.json({ ...risk, mitigations });
  })
);

// POST /api/v1/risk-register
router.post(
  '/',
  requireRole('SUPER_ADMIN', 'GM_PREVENTION', 'MANAGER_COMPLIANCE', 'PROVINCIAL_HEAD', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'INTEGRITY_COMMITTEE_CHAIR', 'INSTITUTION_FOCAL_PERSON'),
  asyncHandler(async (req, res) => {
    const { institutionId, name, description, category, likelihood, impact, ownerId, reviewDate, linkedAssessmentId, linkedReviewId } = req.body || {};
    if (!name || !category || !likelihood || !impact) return res.status(400).json({ error: 'name, category, likelihood and impact are required' });
    if (likelihood < 1 || likelihood > 5 || impact < 1 || impact > 5) return res.status(400).json({ error: 'likelihood and impact must be between 1 and 5' });

    const id = uuid();
    const inherent = riskScore(likelihood, impact);
    db.prepare(
      `INSERT INTO corruption_risks (id, institution_id, name, description, category, likelihood, impact, inherent_score, owner_id, review_date, treatment_status, linked_assessment_id, linked_review_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, datetime('now'), datetime('now'))`
    ).run(id, institutionId || null, name, description || null, category, likelihood, impact, inherent, ownerId || req.user!.sub, reviewDate || null, linkedAssessmentId || null, linkedReviewId || null);

    writeAudit({ userId: req.user!.sub, action: 'RISK_CREATED', entityType: 'corruption_risk', entityId: id, details: { inherentScore: inherent, category: riskCategory(inherent) } });
    res.status(201).json({ id, inherentScore: inherent, category: riskCategory(inherent) });
  })
);

// PUT /api/v1/risk-register/:id
router.put(
  '/:id',
  requireRole('SUPER_ADMIN', 'GM_PREVENTION', 'MANAGER_COMPLIANCE', 'PROVINCIAL_HEAD', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'INTEGRITY_COMMITTEE_CHAIR', 'INSTITUTION_FOCAL_PERSON'),
  asyncHandler(async (req, res) => {
    const risk = db.prepare(`SELECT * FROM corruption_risks WHERE id = ?`).get(req.params.id) as any;
    if (!risk) return res.status(404).json({ error: 'Risk not found' });
    const { likelihood, impact, treatmentStatus, reviewDate, description } = req.body || {};
    const newLikelihood = likelihood ?? risk.likelihood;
    const newImpact = impact ?? risk.impact;
    const inherent = riskScore(newLikelihood, newImpact);
    db.prepare(`UPDATE corruption_risks SET likelihood=?, impact=?, inherent_score=?, treatment_status=COALESCE(?,treatment_status), review_date=COALESCE(?,review_date), description=COALESCE(?,description), updated_at=datetime('now') WHERE id=?`).run(
      newLikelihood, newImpact, inherent, treatmentStatus || null, reviewDate || null, description || null, req.params.id
    );
    writeAudit({ userId: req.user!.sub, action: 'RISK_UPDATED', entityType: 'corruption_risk', entityId: req.params.id });
    res.json({ ok: true, inherentScore: inherent, category: riskCategory(inherent) });
  })
);

// POST /api/v1/risk-register/:id/mitigations — RSK-03 residual risk
router.post(
  '/:id/mitigations',
  requireRole('SUPER_ADMIN', 'GM_PREVENTION', 'MANAGER_COMPLIANCE', 'PROVINCIAL_HEAD', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'INTEGRITY_COMMITTEE_CHAIR', 'INSTITUTION_FOCAL_PERSON'),
  asyncHandler(async (req, res) => {
    const { description, effectiveness, implementedDate, residualLikelihood, residualImpact } = req.body || {};
    if (!description || !effectiveness) return res.status(400).json({ error: 'description and effectiveness are required' });
    const risk = db.prepare(`SELECT * FROM corruption_risks WHERE id = ?`).get(req.params.id) as any;
    if (!risk) return res.status(404).json({ error: 'Risk not found' });

    const residual = residualLikelihood && residualImpact ? riskScore(residualLikelihood, residualImpact) : residualScoreFromEffectiveness(risk.inherent_score, effectiveness);

    const id = uuid();
    db.prepare(
      `INSERT INTO risk_mitigations (id, risk_id, description, effectiveness, implemented_date, residual_likelihood, residual_impact, residual_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, req.params.id, description, effectiveness, implementedDate || new Date().toISOString().slice(0, 10), residualLikelihood || null, residualImpact || null, residual);

    db.prepare(`UPDATE corruption_risks SET treatment_status = 'Mitigated', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    writeAudit({ userId: req.user!.sub, action: 'RISK_MITIGATION_ADDED', entityType: 'corruption_risk', entityId: req.params.id, details: { residualScore: residual } });
    res.status(201).json({ id, residualScore: residual, residualCategory: riskCategory(residual) });
  })
);

// GET /api/v1/risk-register/trends/:institutionId — RSK-05 trend analysis
router.get(
  '/trends/:institutionId',
  asyncHandler(async (req, res) => {
    const rows = db.prepare(`SELECT created_at, inherent_score FROM corruption_risks WHERE institution_id = ? ORDER BY created_at ASC`).all(req.params.institutionId) as any[];
    const byMonth: Record<string, number[]> = {};
    rows.forEach((r) => {
      const month = r.created_at.slice(0, 7);
      byMonth[month] = byMonth[month] || [];
      byMonth[month].push(r.inherent_score);
    });
    const trend = Object.entries(byMonth).map(([month, scores]) => ({ month, avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 }));
    res.json(trend);
  })
);

export default router;
