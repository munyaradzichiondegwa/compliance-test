import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import { db, UPLOADS_DIR } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';
import { recordTransition, getWorkflowConfig, addWorkingDays, getHistory } from '../utils/workflow';
import { notifyUser, notifyRole } from '../utils/notify';
import { summarize, findDuplicates } from '../utils/ai';

const router = Router();
router.use(authenticate);
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 25 * 1024 * 1024 } });

// GET /api/v1/systems-reviews
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, institutionId, mine } = req.query as Record<string, string>;
    let sql = `SELECT r.*, i.name as institution_name, u.name as lead_reviewer_name FROM systems_reviews r
               JOIN institutions i ON i.id = r.institution_id JOIN users u ON u.id = r.lead_reviewer_id WHERE 1=1`;
    const params: any[] = [];
    if (status) {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    if (institutionId) {
      sql += ` AND r.institution_id = ?`;
      params.push(institutionId);
    }
    if (mine === 'true') {
      sql += ` AND (r.lead_reviewer_id = ? OR EXISTS (SELECT 1 FROM systems_review_reviewers rr WHERE rr.review_id = r.id AND rr.user_id = ?))`;
      params.push(req.user!.sub, req.user!.sub);
    }
    sql += ` ORDER BY r.started_at DESC`;
    res.json(db.prepare(sql).all(...params));
  })
);

// GET /api/v1/systems-reviews/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const review = db.prepare(`SELECT r.*, i.name as institution_name FROM systems_reviews r JOIN institutions i ON i.id = r.institution_id WHERE r.id = ?`).get(req.params.id);
    if (!review) return res.status(404).json({ error: 'Systems review not found' });
    const reviewers = db.prepare(`SELECT rr.role_in_review, u.id, u.name, u.email FROM systems_review_reviewers rr JOIN users u ON u.id = rr.user_id WHERE rr.review_id = ?`).all(req.params.id);
    const documents = db.prepare(`SELECT * FROM systems_review_documents WHERE review_id = ?`).all(req.params.id) as any[];
    const documentsWithVersions = documents.map((d) => ({ ...d, versions: db.prepare(`SELECT id, version_no, file_name, change_note, uploaded_by, uploaded_at FROM systems_review_document_versions WHERE document_id = ? ORDER BY version_no DESC`).all(d.id) }));
    const findings = db.prepare(`SELECT f.*, u.name as created_by_name FROM systems_review_findings f LEFT JOIN users u ON u.id = f.created_by WHERE f.review_id = ? ORDER BY f.created_at DESC`).all(req.params.id);
    const history = getHistory('systems_review', req.params.id);
    res.json({ ...review, reviewers, documents: documentsWithVersions, findings, history });
  })
);

// POST /api/v1/systems-reviews
router.post(
  '/',
  requireRole('SYSTEMS_REVIEWER', 'SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { institutionId, title, scope, reviewerIds } = req.body || {};
    if (!institutionId || !title) return res.status(400).json({ error: 'institutionId and title are required' });
    const id = uuid();
    db.prepare(`INSERT INTO systems_reviews (id, institution_id, lead_reviewer_id, title, scope, status, started_at, created_at) VALUES (?, ?, ?, ?, ?, 'Draft', datetime('now'), datetime('now'))`).run(id, institutionId, req.user!.sub, title, scope || null);
    db.prepare(`INSERT INTO systems_review_reviewers (review_id, user_id, role_in_review) VALUES (?, ?, 'Lead Reviewer')`).run(id, req.user!.sub);

    const inst = db.prepare(`SELECT name FROM institutions WHERE id = ?`).get(institutionId) as any;
    (reviewerIds || []).forEach((uid: string) => {
      if (uid !== req.user!.sub) {
        db.prepare(`INSERT OR IGNORE INTO systems_review_reviewers (review_id, user_id, role_in_review) VALUES (?, ?, 'Contributor')`).run(id, uid);
        notifyUser(uid, 'SYSTEMS_REVIEW_ASSIGNED', { title, institutionName: inst?.name || '' }, 'systems_review', id);
      }
    });

    recordTransition({ entityType: 'systems_review', entityId: id, fromState: null, toState: 'Draft', actorUserId: req.user!.sub });
    writeAudit({ userId: req.user!.sub, action: 'SYSTEMS_REVIEW_CREATED', entityType: 'systems_review', entityId: id });
    res.status(201).json({ id });
  })
);

// PUT /api/v1/systems-reviews/:id/status — move through InProgress / UnderApproval / Approved / Closed
router.put(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status, executiveSummary } = req.body || {};
    const allowed = ['Draft', 'InProgress', 'UnderApproval', 'Approved', 'Closed'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    const review = db.prepare(`SELECT * FROM systems_reviews WHERE id = ?`).get(req.params.id) as any;
    if (!review) return res.status(404).json({ error: 'Systems review not found' });

    if (status === 'Approved' && !['PREVENTION_HEAD', 'SUPER_ADMIN'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Only the Prevention Head can approve a systems review' });
    }

    let slaDue: string | null = null;
    let completedAt: string | null = null;
    if (status === 'UnderApproval') {
      const config = getWorkflowConfig('SystemsReviewApproval');
      slaDue = addWorkingDays(new Date(), config?.sla_days ?? 10).toISOString();
    }
    if (status === 'Closed' || status === 'Approved') completedAt = new Date().toISOString();

    db.prepare(`UPDATE systems_reviews SET status = ?, executive_summary = COALESCE(?, executive_summary), completed_at = COALESCE(?, completed_at) WHERE id = ?`).run(
      status, executiveSummary || null, completedAt, req.params.id
    );
    if (executiveSummary) {
      db.prepare(`UPDATE systems_reviews SET ai_summary = ? WHERE id = ?`).run(summarize(executiveSummary, 3), req.params.id);
    }
    recordTransition({ entityType: 'systems_review', entityId: req.params.id, fromState: review.status, toState: status, actorUserId: req.user!.sub });

    if (status === 'UnderApproval') {
      notifyRole('PREVENTION_HEAD', 'SYSTEMS_REVIEW_ASSIGNED', { title: review.title, institutionName: '' }, 'systems_review', req.params.id);
    }
    writeAudit({ userId: req.user!.sub, action: 'SYSTEMS_REVIEW_STATUS_CHANGED', entityType: 'systems_review', entityId: req.params.id, details: { status } });
    res.json({ ok: true, status });
  })
);

// POST /api/v1/systems-reviews/:id/documents — new document (first version)
router.post(
  '/:id/documents',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const docId = uuid();
    db.prepare(`INSERT INTO systems_review_documents (id, review_id, title, current_version_no, created_at) VALUES (?, ?, ?, 1, datetime('now'))`).run(docId, req.params.id, title);
    db.prepare(
      `INSERT INTO systems_review_document_versions (id, document_id, version_no, file_path, file_name, change_note, uploaded_by, uploaded_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, datetime('now'))`
    ).run(uuid(), docId, req.file?.path || null, req.file?.originalname || `${title}.txt`, 'Initial version', req.user!.sub);
    res.status(201).json({ id: docId });
  })
);

// POST /api/v1/systems-reviews/:id/documents/:docId/versions — new version (version control)
router.post(
  '/:id/documents/:docId/versions',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { changeNote } = req.body || {};
    const doc = db.prepare(`SELECT * FROM systems_review_documents WHERE id = ?`).get(req.params.docId) as any;
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const nextVersion = doc.current_version_no + 1;
    db.prepare(
      `INSERT INTO systems_review_document_versions (id, document_id, version_no, file_path, file_name, change_note, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(uuid(), req.params.docId, nextVersion, req.file?.path || null, req.file?.originalname || `${doc.title}_v${nextVersion}.txt`, changeNote || null, req.user!.sub);
    db.prepare(`UPDATE systems_review_documents SET current_version_no = ? WHERE id = ?`).run(nextVersion, req.params.docId);
    res.status(201).json({ versionNo: nextVersion });
  })
);

// GET /api/v1/systems-reviews/:id/documents/:docId/versions/:versionId/download
router.get(
  '/:id/documents/:docId/versions/:versionId/download',
  asyncHandler(async (req, res) => {
    const v = db.prepare(`SELECT * FROM systems_review_document_versions WHERE id = ?`).get(req.params.versionId) as any;
    if (!v || !v.file_path) return res.status(404).json({ error: 'Version not found' });
    res.download(v.file_path, v.file_name);
  })
);

// POST /api/v1/systems-reviews/:id/findings — create a finding, running AI-02 duplicate detection first
router.post(
  '/:id/findings',
  asyncHandler(async (req, res) => {
    const { findingText, category, severity, evidenceRef } = req.body || {};
    if (!findingText) return res.status(400).json({ error: 'findingText is required' });

    const existing = db.prepare(`SELECT id, finding_text as text FROM systems_review_findings`).all() as { id: string; text: string }[];
    const matches = findDuplicates(findingText, existing);

    const id = uuid();
    db.prepare(
      `INSERT INTO systems_review_findings (id, review_id, finding_text, category, severity, evidence_ref, duplicate_of_finding_id, similarity_score, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, req.params.id, findingText, category || null, severity || 'Medium', evidenceRef || null, matches[0]?.id || null, matches[0]?.score || null, req.user!.sub);

    res.status(201).json({ id, possibleDuplicates: matches.slice(0, 5) });
  })
);

// GET /api/v1/systems-reviews/findings/:findingId/duplicates — re-check duplicates for an existing finding
router.get(
  '/findings/:findingId/duplicates',
  asyncHandler(async (req, res) => {
    const finding = db.prepare(`SELECT * FROM systems_review_findings WHERE id = ?`).get(req.params.findingId) as any;
    if (!finding) return res.status(404).json({ error: 'Finding not found' });
    const existing = db.prepare(`SELECT id, finding_text as text FROM systems_review_findings WHERE id != ?`).all(req.params.findingId) as { id: string; text: string }[];
    const matches = findDuplicates(finding.finding_text, existing);
    res.json(matches.slice(0, 5));
  })
);

export default router;
