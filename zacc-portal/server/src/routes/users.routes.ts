import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';

const router = Router();
router.use(authenticate);

const ROLES = [
  'SUPER_ADMIN', 'PREVENTION_HEAD', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER',
  'INSTITUTION_FOCAL_PERSON', 'INTEGRITY_COMMITTEE_CHAIR', 'AUDITOR', 'INVESTIGATIONS_OFFICER',
];

// GET /api/v1/users — filtered by role, any authenticated user may look up
// colleagues in a specific role (needed for reviewer/officer assignment
// pickers throughout the app). Listing EVERYONE with no role filter remains
// restricted to Super Admin / Prevention Head.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.query.role as string | undefined;
    if (!role && !['SUPER_ADMIN', 'PREVENTION_HEAD'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden — provide a role filter, or use an admin account to list all users' });
    }
    let sql = `SELECT id, name, email, phone, role, institution_id, mfa_enabled, is_active, province, created_at, last_login FROM users WHERE 1=1`;
    const params: any[] = [];
    if (role) {
      sql += ` AND role = ?`;
      params.push(role);
    }
    sql += ` ORDER BY name ASC`;
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  })
);

// GET /api/v1/users/roles — for populating dropdowns
router.get('/roles', asyncHandler(async (_req, res) => res.json(ROLES)));

// POST /api/v1/users
router.post(
  '/',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, email, phone, role, institutionId, province, password } = req.body || {};
    if (!name || !email || !role) return res.status(400).json({ error: 'name, email and role are required' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(String(email).toLowerCase());
    if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

    const id = uuid();
    const tempPassword = password || 'ZaccDemo#2026';
    db.prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, institution_id, mfa_enabled, is_active, province, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, datetime('now'))`
    ).run(id, name, String(email).toLowerCase(), phone || null, bcrypt.hashSync(tempPassword, 10), role, institutionId || null, province || null);

    writeAudit({ userId: req.user!.sub, action: 'USER_CREATED', entityType: 'user', entityId: id, details: { role } });
    res.status(201).json({ id, temporaryPassword: tempPassword });
  })
);

// PUT /api/v1/users/:id
router.put(
  '/:id',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, phone, role, institutionId, isActive, province } = req.body || {};
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.prepare(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), role = COALESCE(?, role),
       institution_id = ?, is_active = COALESCE(?, is_active), province = COALESCE(?, province) WHERE id = ?`
    ).run(name ?? null, phone ?? null, role ?? null, institutionId ?? (user as any).institution_id, isActive === undefined ? null : isActive ? 1 : 0, province ?? null, req.params.id);

    writeAudit({ userId: req.user!.sub, action: 'USER_UPDATED', entityType: 'user', entityId: req.params.id });
    res.json({ ok: true });
  })
);

// POST /api/v1/users/:id/reset-mfa — allows Super Admin to force re-enrolment if a device is lost
router.post(
  '/:id/reset-mfa',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    db.prepare(`UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?`).run(req.params.id);
    writeAudit({ userId: req.user!.sub, action: 'MFA_RESET', entityType: 'user', entityId: req.params.id });
    res.json({ ok: true });
  })
);

export default router;
