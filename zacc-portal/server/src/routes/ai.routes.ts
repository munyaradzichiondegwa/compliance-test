import { Router } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { nlSearch, SearchDoc } from '../utils/ai';

const router = Router();
router.use(authenticate);

// GET /api/v1/ai/search?q=... — AI-05 natural-language search across the corpus
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) || '';
    if (!q.trim()) return res.json([]);

    const docs: SearchDoc[] = [];

    const findings = db.prepare(`SELECT f.id, f.finding_text, r.title FROM systems_review_findings f JOIN systems_reviews r ON r.id = f.review_id`).all() as any[];
    findings.forEach((f) => docs.push({ id: f.id, title: `Finding — ${f.title}`, text: f.finding_text, entityType: 'systems_review_finding' }));

    const assessments = db.prepare(`SELECT a.id, a.findings_text, i.name as inst_name FROM assessments a JOIN institutions i ON i.id = a.institution_id WHERE a.findings_text IS NOT NULL`).all() as any[];
    assessments.forEach((a) => docs.push({ id: a.id, title: `Assessment — ${a.inst_name}`, text: a.findings_text, entityType: 'assessment' }));

    const recs = db.prepare(`SELECT r.id, r.description, i.name as inst_name FROM recommendations r JOIN institutions i ON i.id = r.institution_id`).all() as any[];
    recs.forEach((r) => docs.push({ id: r.id, title: `Recommendation — ${r.inst_name}`, text: r.description, entityType: 'recommendation' }));

    const risks = db.prepare(`SELECT id, name, description FROM corruption_risks`).all() as any[];
    risks.forEach((r) => docs.push({ id: r.id, title: `Risk — ${r.name}`, text: r.description || r.name, entityType: 'corruption_risk' }));

    const results = nlSearch(q, docs, 15);
    res.json(results);
  })
);

export default router;
