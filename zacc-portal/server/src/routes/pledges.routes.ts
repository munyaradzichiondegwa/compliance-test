import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';

const router = Router();
router.use(authenticate);

// GET /api/v1/pledges
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { institutionId } = req.query as Record<string, string>;
    let sql = `SELECT p.*, i.name as institution_name,
               (SELECT COUNT(*) FROM pledge_signatories s WHERE s.pledge_id = p.id) as signatory_count
               FROM pledges p LEFT JOIN institutions i ON i.id = p.institution_id WHERE 1=1`;
    const params: any[] = [];
    if (institutionId) {
      sql += ` AND p.institution_id = ?`;
      params.push(institutionId);
    }
    sql += ` ORDER BY p.expiry_date ASC`;
    res.json(db.prepare(sql).all(...params));
  })
);

// GET /api/v1/pledges/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const pledge = db.prepare(`SELECT p.*, i.name as institution_name FROM pledges p LEFT JOIN institutions i ON i.id = p.institution_id WHERE p.id = ?`).get(req.params.id);
    if (!pledge) return res.status(404).json({ error: 'Pledge not found' });
    const signatories = db.prepare(`SELECT * FROM pledge_signatories WHERE pledge_id = ? ORDER BY signed_at DESC`).all(req.params.id);
    res.json({ ...pledge, signatories });
  })
);

// POST /api/v1/pledges
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { institutionId, title, description, expiryDate } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const id = uuid();
    db.prepare(`INSERT INTO pledges (id, institution_id, title, description, expiry_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(id, institutionId || null, title, description || null, expiryDate || null, req.user!.sub);
    writeAudit({ userId: req.user!.sub, action: 'PLEDGE_CREATED', entityType: 'pledge', entityId: id });
    res.status(201).json({ id });
  })
);

// POST /api/v1/pledges/:id/sign — digital signing (typed-name e-signature + timestamp + IP)
router.post(
  '/:id/sign',
  asyncHandler(async (req, res) => {
    const { name, position, institutionId, signatureText } = req.body || {};
    if (!name || !signatureText) return res.status(400).json({ error: 'name and signatureText are required' });
    if (signatureText.trim().toLowerCase() !== name.trim().toLowerCase()) {
      return res.status(400).json({ error: 'Signature text must match the typed full name to constitute a valid e-signature' });
    }
    const id = uuid();
    db.prepare(
      `INSERT INTO pledge_signatories (id, pledge_id, name, position, institution_id, signed_at, signature_text, ip_address, expiry_reminder_sent)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, 0)`
    ).run(id, req.params.id, name, position || null, institutionId || null, signatureText, req.ip || null);
    writeAudit({ userId: req.user!.sub, action: 'PLEDGE_SIGNED', entityType: 'pledge', entityId: req.params.id, details: { name } });
    res.status(201).json({ id, signedAt: new Date().toISOString() });
  })
);

// POST /api/v1/pledges/:id/bulk-upload — CSV bulk import of signatories (large institutions, Section 10.1)
router.post(
  '/:id/bulk-upload',
  asyncHandler(async (req, res) => {
    const { rows } = req.body || {}; // [{name, position}] pre-parsed client-side from CSV
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows must be a non-empty array of {name, position}' });
    const batchId = `BATCH-${new Date().toISOString().slice(0, 10)}-${uuid().slice(0, 6).toUpperCase()}`;
    db.prepare(`UPDATE pledges SET bulk_batch_id = ? WHERE id = ?`).run(batchId, req.params.id);

    const insert = db.prepare(`INSERT INTO pledge_signatories (id, pledge_id, name, position, institution_id, signed_at, signature_text, ip_address, expiry_reminder_sent) VALUES (?, ?, ?, ?, NULL, datetime('now'), ?, NULL, 0)`);
    const tx = db.transaction((items: any[]) => {
      items.forEach((r) => insert.run(uuid(), req.params.id, r.name, r.position || null, r.name));
    });
    tx(rows);

    writeAudit({ userId: req.user!.sub, action: 'PLEDGE_BULK_UPLOADED', entityType: 'pledge', entityId: req.params.id, details: { batchId, count: rows.length } });
    res.status(201).json({ batchId, imported: rows.length });
  })
);

// GET /api/v1/pledges/expiring/soon — expiring within 30 days (used by Admin + scheduler-triggered reminders)
router.get(
  '/expiring/soon',
  asyncHandler(async (_req, res) => {
    const rows = db.prepare(`SELECT p.*, i.name as institution_name FROM pledges p LEFT JOIN institutions i ON i.id = p.institution_id WHERE p.expiry_date IS NOT NULL AND p.expiry_date <= date('now', '+30 days') ORDER BY p.expiry_date ASC`).all();
    res.json(rows);
  })
);

export default router;
