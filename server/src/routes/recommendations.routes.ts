import { Router } from 'express';
import multer from 'multer';
import { db, UPLOADS_DIR } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';
import { recordTransition } from '../utils/workflow';
import { notifyUser, notifyRole } from '../utils/notify';
import { toCsv } from '../utils/csv';

const router = Router();
router.use(authenticate);
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 15 * 1024 * 1024 } });

// GET /api/v1/recommendations
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, institutionId, overdue, mine } = req.query as Record<string, string>;
    let sql = `SELECT r.*, i.name as institution_name, i.province, u.name as assigned_to_name FROM recommendations r
               JOIN institutions i ON i.id = r.institution_id LEFT JOIN users u ON u.id = r.assigned_to_user_id WHERE 1=1`;
    const params: any[] = [];
    if (status) {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    if (institutionId) {
      sql += ` AND r.institution_id = ?`;
      params.push(institutionId);
    }
    if (overdue === 'true') {
      sql += ` AND r.due_date < date('now') AND r.status NOT IN ('Closed','Verified')`;
    }
    if (mine === 'true') {
      sql += ` AND r.assigned_to_user_id = ?`;
      params.push(req.user!.sub);
    }
    sql += ` ORDER BY r.due_date ASC`;
    const rows = db.prepare(sql).all(...params) as any[];
    const withAge = rows.map((r) => ({ ...r, daysOverdue: ['Closed', 'Verified'].includes(r.status) ? 0 : Math.max(0, Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000)) }));
    res.json(withAge);
  })
);

// GET /api/v1/recommendations/register/export.csv — Recommendation Register (Section 17)
router.get(
  '/register/export.csv',
  asyncHandler(async (req, res) => {
    const rows = db.prepare(`
      SELECT r.description, i.name as institution, i.province, r.category, r.priority, r.owner_name, r.due_date, r.status, r.escalation_level
      FROM recommendations r JOIN institutions i ON i.id = r.institution_id ORDER BY r.due_date ASC
    `).all();
    const csv = toCsv(rows as any[]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Recommendation_Register.csv"');
    res.send(csv);
  })
);

// GET /api/v1/recommendations/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rec = db.prepare(`SELECT r.*, i.name as institution_name FROM recommendations r JOIN institutions i ON i.id = r.institution_id WHERE r.id = ?`).get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
    res.json(rec);
  })
);

// PUT /api/v1/recommendations/:id/respond — Institution Focal Person submits evidence of implementation
router.put(
  '/:id/respond',
  requireRole('INSTITUTION_FOCAL_PERSON', 'SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { responseText } = req.body || {};
    if (!responseText) return res.status(400).json({ error: 'responseText is required' });
    const rec = db.prepare(`SELECT r.*, i.name as institution_name FROM recommendations r JOIN institutions i ON i.id = r.institution_id WHERE r.id = ?`).get(req.params.id) as any;
    if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
    if (!['Assigned', 'Created', 'Incomplete'].includes(rec.status)) return res.status(400).json({ error: `Cannot respond from status ${rec.status}` });

    db.prepare(`UPDATE recommendations SET status = 'ResponseSubmitted', response_text = ?, responded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(responseText, req.params.id);
    recordTransition({ entityType: 'recommendation', entityId: req.params.id, fromState: rec.status, toState: 'ResponseSubmitted', actorUserId: req.user!.sub });
    notifyRole('MONITORING_OFFICER', 'RECOMMENDATION_ASSIGNED', { institutionName: rec.institution_name, description: rec.description, dueDate: rec.due_date }, 'recommendation', req.params.id);
    writeAudit({ userId: req.user!.sub, action: 'RECOMMENDATION_RESPONSE_SUBMITTED', entityType: 'recommendation', entityId: req.params.id });
    res.json({ ok: true, status: 'ResponseSubmitted' });
  })
);

// POST /api/v1/recommendations/:id/evidence
router.post(
  '/:id/evidence',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    db.prepare(`UPDATE recommendations SET response_evidence_path = ?, updated_at = datetime('now') WHERE id = ?`).run(req.file.path, req.params.id);
    res.status(201).json({ ok: true, fileName: req.file.originalname });
  })
);

// PUT /api/v1/recommendations/:id/verify — Monitoring Officer verifies (closes) or rejects
router.put(
  '/:id/verify',
  requireRole('MONITORING_OFFICER', 'SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { decision, notes } = req.body || {}; // 'verify' | 'reject'
    const rec = db.prepare(`SELECT r.*, i.name as institution_name FROM recommendations r JOIN institutions i ON i.id = r.institution_id WHERE r.id = ?`).get(req.params.id) as any;
    if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
    if (rec.status !== 'ResponseSubmitted') return res.status(400).json({ error: `Cannot verify from status ${rec.status}` });

    if (decision === 'reject') {
      db.prepare(`UPDATE recommendations SET status = 'Incomplete', verification_notes = ?, updated_at = datetime('now') WHERE id = ?`).run(notes || null, req.params.id);
      recordTransition({ entityType: 'recommendation', entityId: req.params.id, fromState: 'ResponseSubmitted', toState: 'Incomplete', actorUserId: req.user!.sub, reason: notes });
      if (rec.assigned_to_user_id) notifyUser(rec.assigned_to_user_id, 'RECOMMENDATION_REJECTED', { description: rec.description, notes: notes || 'Insufficient evidence' }, 'recommendation', req.params.id);
      writeAudit({ userId: req.user!.sub, action: 'RECOMMENDATION_REJECTED', entityType: 'recommendation', entityId: req.params.id });
      return res.json({ ok: true, status: 'Incomplete' });
    }

    db.prepare(`UPDATE recommendations SET status = 'Closed', verified_by = ?, verified_at = datetime('now'), verification_notes = ?, updated_at = datetime('now') WHERE id = ?`).run(req.user!.sub, notes || null, req.params.id);
    recordTransition({ entityType: 'recommendation', entityId: req.params.id, fromState: 'ResponseSubmitted', toState: 'Closed', actorUserId: req.user!.sub });
    if (rec.assigned_to_user_id) notifyUser(rec.assigned_to_user_id, 'RECOMMENDATION_VERIFIED', { description: rec.description }, 'recommendation', req.params.id);
    writeAudit({ userId: req.user!.sub, action: 'RECOMMENDATION_VERIFIED', entityType: 'recommendation', entityId: req.params.id });
    res.json({ ok: true, status: 'Closed' });
  })
);

export default router;
