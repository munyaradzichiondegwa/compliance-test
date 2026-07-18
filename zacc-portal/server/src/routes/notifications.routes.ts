import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// GET /api/v1/notifications — my notifications
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = db.prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.user!.sub);
    const unread = db.prepare(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND is_read = 0`).get(req.user!.sub) as { c: number };
    res.json({ notifications: rows, unreadCount: unread.c });
  })
);

// PUT /api/v1/notifications/:id/read
router.put(
  '/:id/read',
  asyncHandler(async (req, res) => {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.user!.sub);
    res.json({ ok: true });
  })
);

// PUT /api/v1/notifications/read-all
router.put(
  '/read-all',
  asyncHandler(async (req, res) => {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user!.sub);
    res.json({ ok: true });
  })
);

// GET /api/v1/notifications/preferences
router.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const rows = db.prepare(`SELECT channel, enabled FROM user_notification_preferences WHERE user_id = ?`).all(req.user!.sub) as { channel: string; enabled: number }[];
    const map: Record<string, boolean> = { email: true, sms: true, in_app: true };
    rows.forEach((r) => (map[r.channel] = !!r.enabled));
    res.json(map);
  })
);

// PUT /api/v1/notifications/preferences
router.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const { channel, enabled } = req.body || {};
    if (!['email', 'sms', 'in_app'].includes(channel)) return res.status(400).json({ error: 'channel must be email, sms or in_app' });
    db.prepare(
      `INSERT INTO user_notification_preferences (user_id, channel, enabled) VALUES (?, ?, ?)
       ON CONFLICT(user_id, channel) DO UPDATE SET enabled = excluded.enabled`
    ).run(req.user!.sub, channel, enabled ? 1 : 0);
    res.json({ ok: true });
  })
);

// GET /api/v1/notifications/templates — Admin: manage template content (NOT-05)
router.get(
  '/templates',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json(db.prepare(`SELECT * FROM notification_templates ORDER BY code`).all());
  })
);

// PUT /api/v1/notifications/templates/:id
router.put(
  '/templates/:id',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { subjectTemplate, bodyTemplate } = req.body || {};
    db.prepare(`UPDATE notification_templates SET subject_template = COALESCE(?, subject_template), body_template = COALESCE(?, body_template), updated_at = datetime('now') WHERE id = ?`).run(subjectTemplate || null, bodyTemplate || null, req.params.id);
    res.json({ ok: true });
  })
);

// GET /api/v1/notifications/outbox/email — Admin "Dev Mailbox" (see utils/notify.ts note on the outbox pattern)
router.get(
  '/outbox/email',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json(db.prepare(`SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 100`).all());
  })
);

// GET /api/v1/notifications/outbox/sms
router.get(
  '/outbox/sms',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json(db.prepare(`SELECT * FROM sms_outbox ORDER BY created_at DESC LIMIT 100`).all());
  })
);

export default router;
