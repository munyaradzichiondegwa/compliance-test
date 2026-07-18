import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import path from 'path';
import { db, UPLOADS_DIR } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';
import { computeCompositeScore, ragStatusFor, scoreForResponse, averageSectionScore, SectionScores, ragLabel } from '../utils/scoring';
import { recordTransition, addWorkingDays, getWorkflowConfig, getHistory } from '../utils/workflow';
import { notifyUser, notifyRole } from '../utils/notify';
import { autoDraftAssessmentNarrative, summarize } from '../utils/ai';
import { buildAssessmentReportPdf } from '../utils/pdf';

const router = Router();
router.use(authenticate);

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 15 * 1024 * 1024 } });

const CHECKLIST_TEMPLATE: { section: string; item_text: string }[] = [
  { section: 'governance', item_text: 'Board/Council meets at the legally required minimum frequency' },
  { section: 'governance', item_text: 'Institution has an approved and current strategic plan' },
  { section: 'governance', item_text: 'Clear segregation of oversight and executive management roles exists' },
  { section: 'controls', item_text: 'Internal audit function is established and independent' },
  { section: 'controls', item_text: 'Bank reconciliations are performed and reviewed monthly' },
  { section: 'controls', item_text: 'Fixed asset register is maintained and periodically verified' },
  { section: 'controls', item_text: 'Authorisation limits for expenditure are documented and enforced' },
  { section: 'procurement', item_text: 'Procurement committee is constituted per PRAZ regulations' },
  { section: 'procurement', item_text: 'Competitive bidding is used for purchases above the prescribed threshold' },
  { section: 'procurement', item_text: 'Supplier due-diligence checks are performed and documented' },
  { section: 'finance', item_text: 'Annual financial statements are prepared and externally audited' },
  { section: 'finance', item_text: 'Budget variance reports are reviewed quarterly by management' },
  { section: 'finance', item_text: 'Petty cash controls include dual authorisation' },
  { section: 'integrity', item_text: 'Integrity Committee is constituted and active' },
  { section: 'integrity', item_text: 'Conflict-of-interest declarations are collected annually from staff' },
  { section: 'integrity', item_text: 'Whistleblower policy is published and communicated to staff' },
];

function recalculate(assessmentId: string) {
  const items = db.prepare(`SELECT * FROM assessment_checklist_items WHERE assessment_id = ?`).all(assessmentId) as any[];
  const sectionScores: SectionScores = {
    governance: averageSectionScore(items.filter((i) => i.section === 'governance').map((i) => i.score)),
    controls: averageSectionScore(items.filter((i) => i.section === 'controls').map((i) => i.score)),
    procurement: averageSectionScore(items.filter((i) => i.section === 'procurement').map((i) => i.score)),
    finance: averageSectionScore(items.filter((i) => i.section === 'finance').map((i) => i.score)),
    integrity: averageSectionScore(items.filter((i) => i.section === 'integrity').map((i) => i.score)),
  };
  const composite = computeCompositeScore(sectionScores);
  const rag = ragStatusFor(composite);
  db.prepare(
    `UPDATE assessments SET governance_score=?, controls_score=?, procurement_score=?, finance_score=?, integrity_score=?, composite_score=?, rag_status=?, updated_at=datetime('now') WHERE id=?`
  ).run(sectionScores.governance, sectionScores.controls, sectionScores.procurement, sectionScores.finance, sectionScores.integrity, composite, rag, assessmentId);
  return { sectionScores, composite, rag };
}

// GET /api/v1/assessments — worklist, with common filters
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, institutionId, mine, province } = req.query as Record<string, string>;
    let sql = `SELECT a.*, i.name as institution_name, i.province as institution_province, u.name as officer_name
               FROM assessments a JOIN institutions i ON i.id = a.institution_id JOIN users u ON u.id = a.officer_id WHERE 1=1`;
    const params: any[] = [];
    if (status) {
      sql += ` AND a.status = ?`;
      params.push(status);
    }
    if (institutionId) {
      sql += ` AND a.institution_id = ?`;
      params.push(institutionId);
    }
    if (province) {
      sql += ` AND i.province = ?`;
      params.push(province);
    }
    if (mine === 'true') {
      sql += ` AND a.officer_id = ?`;
      params.push(req.user!.sub);
    }
    sql += ` ORDER BY a.updated_at DESC`;
    res.json(db.prepare(sql).all(...params));
  })
);

// GET /api/v1/assessments/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const assessment = db.prepare(`SELECT a.*, i.name as institution_name, i.type as institution_type, i.province, u.name as officer_name FROM assessments a JOIN institutions i ON i.id=a.institution_id JOIN users u ON u.id=a.officer_id WHERE a.id = ?`).get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const items = db.prepare(`SELECT * FROM assessment_checklist_items WHERE assessment_id = ? ORDER BY sort_order`).all(req.params.id);
    const evidence = db.prepare(`SELECT id, file_name, mime_type, size_bytes, uploaded_at FROM assessment_evidence WHERE assessment_id = ?`).all(req.params.id);
    const recommendations = db.prepare(`SELECT * FROM recommendations WHERE source_type='Assessment' AND source_id = ?`).all(req.params.id);
    const history = getHistory('assessment', req.params.id);
    res.json({ ...assessment, items, evidence, recommendations, history });
  })
);

// POST /api/v1/assessments — create a draft and its checklist skeleton
router.post(
  '/',
  requireRole('COMPLIANCE_OFFICER', 'SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { institutionId, scheduledDate } = req.body || {};
    if (!institutionId) return res.status(400).json({ error: 'institutionId is required' });
    const inst = db.prepare(`SELECT * FROM institutions WHERE id = ?`).get(institutionId);
    if (!inst) return res.status(404).json({ error: 'Institution not found' });

    const id = uuid();
    db.prepare(
      `INSERT INTO assessments (id, institution_id, officer_id, scheduled_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Draft', datetime('now'), datetime('now'))`
    ).run(id, institutionId, req.user!.sub, scheduledDate || new Date().toISOString().slice(0, 10));

    CHECKLIST_TEMPLATE.forEach((tpl, idx) => {
      db.prepare(`INSERT INTO assessment_checklist_items (id, assessment_id, section, item_text, response, score, comments, sort_order) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`).run(uuid(), id, tpl.section, tpl.item_text, idx);
    });

    recordTransition({ entityType: 'assessment', entityId: id, fromState: null, toState: 'Draft', actorUserId: req.user!.sub });
    writeAudit({ userId: req.user!.sub, action: 'ASSESSMENT_CREATED', entityType: 'assessment', entityId: id, details: { institutionId } });
    res.status(201).json({ id });
  })
);

// PUT /api/v1/assessments/:id/checklist — autosave one or many item responses
router.put(
  '/:id/checklist',
  asyncHandler(async (req, res) => {
    const assessment = db.prepare(`SELECT * FROM assessments WHERE id = ?`).get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!['Draft', 'Returned'].includes(assessment.status)) return res.status(400).json({ error: `Cannot edit checklist while status is ${assessment.status}` });

    const { items } = req.body || {}; // [{id, response, comments}]
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

    const stmt = db.prepare(`UPDATE assessment_checklist_items SET response = ?, score = ?, comments = ? WHERE id = ? AND assessment_id = ?`);
    const tx = db.transaction((rows: any[]) => {
      rows.forEach((it) => stmt.run(it.response ?? null, it.response ? scoreForResponse(it.response) : null, it.comments ?? null, it.id, req.params.id));
    });
    tx(items);

    const { sectionScores, composite, rag } = recalculate(req.params.id);
    res.json({ sectionScores, compositeScore: composite, ragStatus: rag, ragLabel: ragLabel(rag) });
  })
);

// POST /api/v1/assessments/:id/evidence — multipart upload
router.post(
  '/:id/evidence',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required (multipart/form-data field "file")' });
    const assessment = db.prepare(`SELECT * FROM assessments WHERE id = ?`).get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    const id = uuid();
    db.prepare(
      `INSERT INTO assessment_evidence (id, assessment_id, file_name, file_path, mime_type, size_bytes, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, req.params.id, req.file.originalname, req.file.path, req.file.mimetype, req.file.size, req.user!.sub);
    res.status(201).json({ id, fileName: req.file.originalname });
  })
);

// GET /api/v1/assessments/:id/evidence/:evidenceId — download
router.get(
  '/:id/evidence/:evidenceId',
  asyncHandler(async (req, res) => {
    const ev = db.prepare(`SELECT * FROM assessment_evidence WHERE id = ? AND assessment_id = ?`).get(req.params.evidenceId, req.params.id) as any;
    if (!ev) return res.status(404).json({ error: 'Evidence not found' });
    res.download(ev.file_path, ev.file_name);
  })
);

// PUT /api/v1/assessments/:id/geotag
router.put(
  '/:id/geotag',
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.body || {};
    if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'lat and lng are required' });
    db.prepare(`UPDATE assessments SET geotag_lat = ?, geotag_lng = ?, updated_at = datetime('now') WHERE id = ?`).run(lat, lng, req.params.id);
    res.json({ ok: true });
  })
);

// POST /api/v1/assessments/:id/ai-draft — AI-03 auto-draft narrative from checklist data
router.post(
  '/:id/ai-draft',
  asyncHandler(async (req, res) => {
    const assessment = db.prepare(`SELECT a.*, i.name as institution_name FROM assessments a JOIN institutions i ON i.id = a.institution_id WHERE a.id = ?`).get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    const items = db.prepare(`SELECT * FROM assessment_checklist_items WHERE assessment_id = ?`).all(req.params.id) as any[];

    const narrative = autoDraftAssessmentNarrative({
      institutionName: assessment.institution_name,
      sectionScores: { governance: assessment.governance_score, controls: assessment.controls_score, procurement: assessment.procurement_score, finance: assessment.finance_score, integrity: assessment.integrity_score },
      compositeScore: assessment.composite_score || 0,
      ragStatus: assessment.rag_status || 'Amber',
      items,
    });
    db.prepare(`UPDATE assessments SET findings_text = ?, ai_summary = ?, updated_at = datetime('now') WHERE id = ?`).run(narrative, summarize(narrative, 2), req.params.id);
    res.json({ narrative });
  })
);

// PUT /api/v1/assessments/:id/submit
router.put(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const assessment = db.prepare(`SELECT a.*, i.name as institution_name FROM assessments a JOIN institutions i ON i.id=a.institution_id WHERE a.id = ?`).get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!['Draft', 'Returned'].includes(assessment.status)) return res.status(400).json({ error: `Cannot submit from status ${assessment.status}` });

    const items = db.prepare(`SELECT * FROM assessment_checklist_items WHERE assessment_id = ?`).all(req.params.id) as any[];
    const incomplete = items.filter((i) => !i.response);
    if (incomplete.length > 0) {
      return res.status(400).json({ error: `${incomplete.length} checklist item(s) still need a response before submission`, incompleteItems: incomplete.map((i) => i.item_text) });
    }

    const { composite, rag } = recalculate(req.params.id);
    const config = getWorkflowConfig('AssessmentReview');
    const slaDue = addWorkingDays(new Date(), config?.sla_days ?? 5);

    db.prepare(`UPDATE assessments SET status = 'Submitted', submitted_at = datetime('now'), sla_due_at = ?, updated_at = datetime('now') WHERE id = ?`).run(slaDue.toISOString(), req.params.id);
    recordTransition({ entityType: 'assessment', entityId: req.params.id, fromState: assessment.status, toState: 'Submitted', actorUserId: req.user!.sub });
    writeAudit({ userId: req.user!.sub, action: 'ASSESSMENT_SUBMITTED', entityType: 'assessment', entityId: req.params.id, details: { composite, rag } });

    notifyRole('PREVENTION_HEAD', 'ASSESSMENT_SUBMITTED', {
      institutionName: assessment.institution_name,
      officerName: req.user!.name,
      score: composite.toFixed(1),
      rag,
      slaDays: config?.sla_days ?? 5,
    }, 'assessment', req.params.id);

    res.json({ ok: true, compositeScore: composite, ragStatus: rag });
  })
);

// PUT /api/v1/assessments/:id/review — approve or return
router.put(
  '/:id/review',
  requireRole('PREVENTION_HEAD', 'SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { decision, notes } = req.body || {}; // decision: 'approve' | 'return'
    const assessment = db.prepare(`SELECT a.*, i.name as institution_name FROM assessments a JOIN institutions i ON i.id=a.institution_id WHERE a.id = ?`).get(req.params.id) as any;
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!['Submitted', 'UnderReview'].includes(assessment.status)) return res.status(400).json({ error: `Cannot review from status ${assessment.status}` });

    if (decision === 'return') {
      db.prepare(`UPDATE assessments SET status = 'Returned', reviewed_by = ?, review_notes = ?, updated_at = datetime('now') WHERE id = ?`).run(req.user!.sub, notes || null, req.params.id);
      recordTransition({ entityType: 'assessment', entityId: req.params.id, fromState: assessment.status, toState: 'Returned', actorUserId: req.user!.sub, reason: notes });
      notifyUser(assessment.officer_id, 'ASSESSMENT_RETURNED', { institutionName: assessment.institution_name, reviewerName: req.user!.name, notes: notes || 'See reviewer comments in the Portal.' }, 'assessment', req.params.id);
      writeAudit({ userId: req.user!.sub, action: 'ASSESSMENT_RETURNED', entityType: 'assessment', entityId: req.params.id });
      return res.json({ ok: true, status: 'Returned' });
    }

    // Approve — auto-generate implementation matrix (recommendations) from non-compliant/partial items.
    db.prepare(`UPDATE assessments SET status = 'Approved', reviewed_by = ?, review_notes = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(req.user!.sub, notes || null, req.params.id);
    recordTransition({ entityType: 'assessment', entityId: req.params.id, fromState: assessment.status, toState: 'Approved', actorUserId: req.user!.sub });

    const items = db.prepare(`SELECT * FROM assessment_checklist_items WHERE assessment_id = ? AND response IN ('NonCompliant','PartiallyCompliant')`).all(req.params.id) as any[];
    const institution = db.prepare(`SELECT * FROM institutions WHERE id = ?`).get(assessment.institution_id) as any;
    const focalUser = institution.focal_person_user_id ? db.prepare(`SELECT * FROM users WHERE id = ?`).get(institution.focal_person_user_id) as any : null;

    let recCount = 0;
    items.forEach((item) => {
      const recId = uuid();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (item.response === 'NonCompliant' ? 21 : 35));
      db.prepare(
        `INSERT INTO recommendations (id, source_type, source_id, institution_id, description, category, priority, assigned_to_user_id, owner_name, due_date, status, created_at, updated_at)
         VALUES (?, 'Assessment', ?, ?, ?, ?, ?, ?, ?, ?, 'Assigned', datetime('now'), datetime('now'))`
      ).run(
        recId, req.params.id, assessment.institution_id,
        `Address ${item.response === 'NonCompliant' ? 'non-compliance' : 'partial compliance'} finding: "${item.item_text}"`,
        item.section.charAt(0).toUpperCase() + item.section.slice(1),
        item.response === 'NonCompliant' ? 'High' : 'Medium',
        focalUser ? focalUser.id : null,
        focalUser ? focalUser.name : 'Institution Focal Person',
        dueDate.toISOString().slice(0, 10)
      );
      recordTransition({ entityType: 'recommendation', entityId: recId, fromState: null, toState: 'Assigned', actorUserId: req.user!.sub, reason: 'Auto-generated from approved assessment' });
      if (focalUser) notifyUser(focalUser.id, 'RECOMMENDATION_ASSIGNED', { institutionName: assessment.institution_name, description: item.item_text, dueDate: dueDate.toISOString().slice(0, 10) }, 'recommendation', recId);
      recCount++;
    });

    db.prepare(`UPDATE assessments SET status = 'Closed', closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    recordTransition({ entityType: 'assessment', entityId: req.params.id, fromState: 'Approved', toState: 'Closed', actorUserId: req.user!.sub, reason: 'Implementation matrix generated' });

    notifyUser(assessment.officer_id, 'ASSESSMENT_APPROVED', { institutionName: assessment.institution_name, recCount: String(recCount) }, 'assessment', req.params.id);
    writeAudit({ userId: req.user!.sub, action: 'ASSESSMENT_APPROVED', entityType: 'assessment', entityId: req.params.id, details: { recommendationsGenerated: recCount } });

    res.json({ ok: true, status: 'Closed', recommendationsGenerated: recCount });
  })
);

// GET /api/v1/assessments/:id/report — generate & stream a PDF (Section 17)
router.get(
  '/:id/report',
  asyncHandler(async (req, res) => {
    const a = db.prepare(`SELECT a.*, i.name as institution_name, i.type as institution_type, i.province, u.name as officer_name FROM assessments a JOIN institutions i ON i.id=a.institution_id JOIN users u ON u.id=a.officer_id WHERE a.id = ?`).get(req.params.id) as any;
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    const items = db.prepare(`SELECT * FROM assessment_checklist_items WHERE assessment_id = ?`).all(req.params.id) as any[];
    const recs = db.prepare(`SELECT * FROM recommendations WHERE source_type='Assessment' AND source_id = ?`).all(req.params.id) as any[];

    const narrative = a.findings_text || autoDraftAssessmentNarrative({
      institutionName: a.institution_name,
      sectionScores: { governance: a.governance_score, controls: a.controls_score, procurement: a.procurement_score, finance: a.finance_score, integrity: a.integrity_score },
      compositeScore: a.composite_score || 0,
      ragStatus: a.rag_status || 'Amber',
      items,
    });

    const pdf = await buildAssessmentReportPdf({
      institutionName: a.institution_name,
      institutionType: a.institution_type,
      province: a.province,
      officerName: a.officer_name,
      assessmentDate: (a.scheduled_date || a.created_at || '').slice(0, 10),
      status: a.status,
      sectionScores: { governance: a.governance_score, controls: a.controls_score, procurement: a.procurement_score, finance: a.finance_score, integrity: a.integrity_score },
      compositeScore: a.composite_score || 0,
      ragStatus: a.rag_status || 'Amber',
      narrative,
      nonCompliantItems: items.filter((i) => i.response === 'NonCompliant').map((i) => ({ section: i.section, item_text: i.item_text, comments: i.comments })),
      recommendations: recs.map((r) => ({ description: r.description, owner_name: r.owner_name, due_date: r.due_date })),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Assessment_Report_${a.institution_name.replace(/\s+/g, '_')}.pdf"`);
    res.send(pdf);
  })
);

export default router;
