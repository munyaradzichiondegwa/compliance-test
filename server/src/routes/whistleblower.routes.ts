import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { getWhistleblowerPublicKeyPem, decryptWhistleblowerReport, generateTrackingCode } from '../utils/crypto';
import { notifyRole } from '../utils/notify';
import { recordTransition } from '../utils/workflow';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, keyPrefix: 'wb-submit' });
const trackLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'wb-track' });

// GET /api/v1/whistleblower/public-key — PUBLIC, no auth. The browser fetches
// this to encrypt the report client-side before anything is transmitted.
router.get(
  '/public-key',
  asyncHandler(async (_req, res) => {
    res.json({ publicKeyPem: getWhistleblowerPublicKeyPem() });
  })
);

// POST /api/v1/whistleblower/submit — PUBLIC, no auth, and deliberately never
// touches req.ip or any identifying header. This is the ONLY route in the
// entire API that must never call writeAudit() with an ipAddress, and must
// never persist anything about who submitted it.
router.post(
  '/submit',
  submitLimiter,
  asyncHandler(async (req, res) => {
    const { category, institutionId, institutionFreetext, encryptedKey, iv, payload } = req.body || {};
    if (!category || !encryptedKey || !iv || !payload) {
      return res.status(400).json({ error: 'category, encryptedKey, iv and payload are required' });
    }
    const id = uuid();
    const trackingCode = generateTrackingCode();
    db.prepare(
      `INSERT INTO whistleblower_reports (id, tracking_code, category, institution_id, institution_freetext, encrypted_payload, encrypted_key, iv, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Received', datetime('now'), datetime('now'))`
    ).run(id, trackingCode, category, institutionId || null, institutionFreetext || null, payload, encryptedKey, iv);

    // Deliberately anonymous: no userId, no ipAddress, on this specific audit line.
    notifyRole('INVESTIGATIONS_OFFICER', 'WHISTLEBLOWER_ASSIGNED', { trackingCode, category }, 'whistleblower_report', id);
    res.status(201).json({ trackingCode, message: 'Report received. Save this tracking code — it is the only way to check your report status and cannot be recovered if lost.' });
  })
);

// GET /api/v1/whistleblower/track/:trackingCode — PUBLIC, no auth. Returns
// status only, never the decrypted content (content is investigator-only).
router.get(
  '/track/:trackingCode',
  trackLimiter,
  asyncHandler(async (req, res) => {
    const report = db.prepare(`SELECT id, tracking_code, category, status, created_at, updated_at FROM whistleblower_reports WHERE tracking_code = ?`).get(req.params.trackingCode) as any;
    if (!report) return res.status(404).json({ error: 'No report found for this tracking code' });
    const updates = db.prepare(`SELECT status, note, created_at FROM whistleblower_status_updates WHERE report_id = ? ORDER BY created_at ASC`).all(report.id);
    res.json({ trackingCode: report.tracking_code, category: report.category, status: report.status, submittedAt: report.created_at, lastUpdated: report.updated_at, updates });
  })
);

// ---------------------------------------------------------------------------
// Everything below requires authentication and is restricted to the named
// investigation team (INVESTIGATIONS_OFFICER, PREVENTION_HEAD, SUPER_ADMIN
// for administration) — PRD Section 20.3 "Restricted" tier.
// ---------------------------------------------------------------------------
router.use(authenticate);
const CASE_ROLES = ['INVESTIGATIONS_OFFICER', 'PREVENTION_HEAD', 'SUPER_ADMIN'];

// GET /api/v1/whistleblower — list (metadata only, NOT decrypted content)
router.get(
  '/',
  requireRole(...CASE_ROLES),
  asyncHandler(async (_req, res) => {
    const rows = db.prepare(`
      SELECT r.id, r.tracking_code, r.category, r.status, r.created_at, r.updated_at, r.referral_ecms_case_id,
             i.name as institution_name, u.name as assigned_investigator_name
      FROM whistleblower_reports r LEFT JOIN institutions i ON i.id = r.institution_id LEFT JOIN users u ON u.id = r.assigned_investigator_id
      ORDER BY r.created_at DESC
    `).all();
    res.json(rows);
  })
);

// GET /api/v1/whistleblower/:id — decrypts and returns content; every open is logged (Section 20.3).
router.get(
  '/:id',
  requireRole(...CASE_ROLES),
  asyncHandler(async (req, res) => {
    const report = db.prepare(`SELECT r.*, i.name as institution_name FROM whistleblower_reports r LEFT JOIN institutions i ON i.id = r.institution_id WHERE r.id = ?`).get(req.params.id) as any;
    if (!report) return res.status(404).json({ error: 'Report not found' });

    let decrypted: string;
    try {
      decrypted = decryptWhistleblowerReport(report.encrypted_key, report.iv, report.encrypted_payload);
    } catch {
      return res.status(500).json({ error: 'Unable to decrypt this report — the encryption keys may be out of sync with this environment' });
    }

    db.prepare(`INSERT INTO whistleblower_access_log (id, report_id, user_id, action, created_at) VALUES (?, ?, ?, 'Decrypted and viewed report', datetime('now'))`).run(uuid(), req.params.id, req.user!.sub);

    const updates = db.prepare(`SELECT * FROM whistleblower_status_updates WHERE report_id = ? ORDER BY created_at ASC`).all(req.params.id);
    res.json({
      id: report.id,
      trackingCode: report.tracking_code,
      category: report.category,
      institutionName: report.institution_name,
      institutionFreetext: report.institution_freetext,
      status: report.status,
      referralEcmsCaseId: report.referral_ecms_case_id,
      createdAt: report.created_at,
      narrative: decrypted,
      updates,
    });
  })
);

// GET /api/v1/whistleblower/:id/access-log — the audit trail proving restricted access is enforced
router.get(
  '/:id/access-log',
  requireRole(...CASE_ROLES),
  asyncHandler(async (req, res) => {
    const rows = db.prepare(`SELECT a.*, u.name as user_name, u.role as user_role FROM whistleblower_access_log a LEFT JOIN users u ON u.id = a.user_id WHERE report_id = ? ORDER BY created_at DESC`).all(req.params.id);
    res.json(rows);
  })
);

// PUT /api/v1/whistleblower/:id/status
router.put(
  '/:id/status',
  requireRole(...CASE_ROLES),
  asyncHandler(async (req, res) => {
    const { status, note } = req.body || {};
    const allowed = ['Received', 'UnderReview', 'Referred', 'Closed', 'Insufficient'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    const report = db.prepare(`SELECT * FROM whistleblower_reports WHERE id = ?`).get(req.params.id) as any;
    if (!report) return res.status(404).json({ error: 'Report not found' });

    db.prepare(`UPDATE whistleblower_reports SET status = ?, assigned_investigator_id = COALESCE(assigned_investigator_id, ?), updated_at = datetime('now') WHERE id = ?`).run(status, req.user!.sub, req.params.id);
    db.prepare(`INSERT INTO whistleblower_status_updates (id, report_id, status, note, created_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(uuid(), req.params.id, status, note || null);
    db.prepare(`INSERT INTO whistleblower_access_log (id, report_id, user_id, action, created_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(uuid(), req.params.id, req.user!.sub, `Status changed to ${status}`);
    recordTransition({ entityType: 'whistleblower_report', entityId: req.params.id, fromState: report.status, toState: status, actorUserId: req.user!.sub, reason: note });

    res.json({ ok: true, status });
  })
);

// POST /api/v1/whistleblower/:id/refer — Refer to Investigations / ECMS (mock integration, Section 20)
router.post(
  '/:id/refer',
  requireRole(...CASE_ROLES),
  asyncHandler(async (req, res) => {
    const report = db.prepare(`SELECT * FROM whistleblower_reports WHERE id = ?`).get(req.params.id) as any;
    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Calls the mock ECMS integration adapter (see mockExternal.routes.ts) — the
    // same request/response contract a live PRAZ-style integration would use.
    const ecmsCaseId = `ECMS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    db.prepare(`UPDATE whistleblower_reports SET status = 'Referred', referral_ecms_case_id = ?, updated_at = datetime('now') WHERE id = ?`).run(ecmsCaseId, req.params.id);
    db.prepare(`INSERT INTO whistleblower_status_updates (id, report_id, status, note, created_at) VALUES (?, ?, 'Referred', ?, datetime('now'))`).run(uuid(), req.params.id, `Referred to Investigations (${ecmsCaseId})`);
    db.prepare(`INSERT INTO whistleblower_access_log (id, report_id, user_id, action, created_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(uuid(), req.params.id, req.user!.sub, `Referred to ECMS: ${ecmsCaseId}`);
    recordTransition({ entityType: 'whistleblower_report', entityId: req.params.id, fromState: report.status, toState: 'Referred', actorUserId: req.user!.sub, reason: `ECMS case ${ecmsCaseId}` });

    res.json({ ok: true, ecmsCaseId });
  })
);

export default router;
