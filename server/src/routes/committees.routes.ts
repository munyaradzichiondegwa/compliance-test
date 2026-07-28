import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';

const router = Router();
router.use(authenticate);

// GET /api/v1/committees
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { institutionId } = req.query as Record<string, string>;
    let sql = `SELECT c.*, i.name as institution_name FROM integrity_committees c JOIN institutions i ON i.id = c.institution_id WHERE 1=1`;
    const params: any[] = [];
    if (institutionId) {
      sql += ` AND c.institution_id = ?`;
      params.push(institutionId);
    }
    res.json(db.prepare(sql).all(...params));
  })
);

// GET /api/v1/committees/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const committee = db.prepare(`SELECT c.*, i.name as institution_name FROM integrity_committees c JOIN institutions i ON i.id = c.institution_id WHERE c.id = ?`).get(req.params.id);
    if (!committee) return res.status(404).json({ error: 'Committee not found' });
    const members = db.prepare(`SELECT * FROM committee_members WHERE committee_id = ? ORDER BY CASE position WHEN 'Chair' THEN 0 WHEN 'Secretary' THEN 1 ELSE 2 END, name`).all(req.params.id);
    const trainings = db.prepare(`SELECT t.*, m.name as member_name FROM committee_trainings t LEFT JOIN committee_members m ON m.id = t.member_id WHERE t.committee_id = ? ORDER BY training_date DESC`).all(req.params.id);
    const meetings = db.prepare(`SELECT * FROM committee_meetings WHERE committee_id = ? ORDER BY meeting_date DESC`).all(req.params.id);
    const actionPlans = db.prepare(`SELECT * FROM committee_action_plans WHERE committee_id = ? ORDER BY due_date ASC`).all(req.params.id);
    res.json({ ...committee, members, trainings, meetings, actionPlans });
  })
);

// POST /api/v1/committees
router.post(
  '/',
  requireRole('INTEGRITY_COMMITTEE_CHAIR', 'SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { institutionId, charterText, formedDate } = req.body || {};
    if (!institutionId) return res.status(400).json({ error: 'institutionId is required' });
    const id = uuid();
    db.prepare(`INSERT INTO integrity_committees (id, institution_id, charter_text, formed_date, status, created_at) VALUES (?, ?, ?, ?, 'Active', datetime('now'))`).run(id, institutionId, charterText || null, formedDate || new Date().toISOString().slice(0, 10));
    writeAudit({ userId: req.user!.sub, action: 'COMMITTEE_CREATED', entityType: 'integrity_committee', entityId: id });
    res.status(201).json({ id });
  })
);

// PUT /api/v1/committees/:id/charter
router.put(
  '/:id/charter',
  asyncHandler(async (req, res) => {
    const { charterText } = req.body || {};
    db.prepare(`UPDATE integrity_committees SET charter_text = ? WHERE id = ?`).run(charterText || null, req.params.id);
    res.json({ ok: true });
  })
);

// POST /api/v1/committees/:id/members
router.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const { name, position, userId } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = uuid();
    db.prepare(`INSERT INTO committee_members (id, committee_id, user_id, name, position, joined_date) VALUES (?, ?, ?, ?, ?, date('now'))`).run(id, req.params.id, userId || null, name, position || 'Member');
    res.status(201).json({ id });
  })
);

// DELETE /api/v1/committees/:id/members/:memberId
router.delete(
  '/:id/members/:memberId',
  asyncHandler(async (req, res) => {
    db.prepare(`DELETE FROM committee_members WHERE id = ? AND committee_id = ?`).run(req.params.memberId, req.params.id);
    res.json({ ok: true });
  })
);

// POST /api/v1/committees/:id/trainings
router.post(
  '/:id/trainings',
  asyncHandler(async (req, res) => {
    const { memberId, trainingName, trainingDate, completed } = req.body || {};
    if (!trainingName) return res.status(400).json({ error: 'trainingName is required' });
    const id = uuid();
    db.prepare(`INSERT INTO committee_trainings (id, committee_id, member_id, training_name, training_date, completed) VALUES (?, ?, ?, ?, ?, ?)`).run(id, req.params.id, memberId || null, trainingName, trainingDate || new Date().toISOString().slice(0, 10), completed ? 1 : 0);
    res.status(201).json({ id });
  })
);

// POST /api/v1/committees/:id/meetings
router.post(
  '/:id/meetings',
  asyncHandler(async (req, res) => {
    const { meetingDate, minutesText, attendeesCount } = req.body || {};
    if (!meetingDate) return res.status(400).json({ error: 'meetingDate is required' });
    const id = uuid();
    db.prepare(`INSERT INTO committee_meetings (id, committee_id, meeting_date, minutes_text, attendees_count, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(id, req.params.id, meetingDate, minutesText || null, attendeesCount || null);
    writeAudit({ userId: req.user!.sub, action: 'COMMITTEE_MEETING_LOGGED', entityType: 'integrity_committee', entityId: req.params.id });
    res.status(201).json({ id });
  })
);

// POST /api/v1/committees/:id/action-plans
router.post(
  '/:id/action-plans',
  asyncHandler(async (req, res) => {
    const { description, owner, dueDate } = req.body || {};
    if (!description) return res.status(400).json({ error: 'description is required' });
    const id = uuid();
    db.prepare(`INSERT INTO committee_action_plans (id, committee_id, description, owner, due_date, status) VALUES (?, ?, ?, ?, ?, 'Open')`).run(id, req.params.id, description, owner || null, dueDate || null);
    res.status(201).json({ id });
  })
);

// PUT /api/v1/committees/:id/action-plans/:planId
router.put(
  '/:id/action-plans/:planId',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    const allowed = ['Open', 'InProgress', 'Complete', 'Overdue'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
    db.prepare(`UPDATE committee_action_plans SET status = ? WHERE id = ? AND committee_id = ?`).run(status, req.params.planId, req.params.id);
    res.json({ ok: true });
  })
);

export default router;
