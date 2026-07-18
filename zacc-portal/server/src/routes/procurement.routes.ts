import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';
import { evaluateRedFlags } from '../utils/procurementRules';
import { notifyRole } from '../utils/notify';

const router = Router();
router.use(authenticate);

// GET /api/v1/procurement
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { institutionId, flaggedOnly } = req.query as Record<string, string>;
    let sql = `SELECT p.*, i.name as institution_name, i.province FROM procurement_records p JOIN institutions i ON i.id = p.institution_id WHERE 1=1`;
    const params: any[] = [];
    if (institutionId) {
      sql += ` AND p.institution_id = ?`;
      params.push(institutionId);
    }
    if (flaggedOnly === 'true') {
      sql += ` AND p.red_flags IS NOT NULL`;
    }
    sql += ` ORDER BY p.procurement_date DESC`;
    const rows = db.prepare(sql).all(...params) as any[];
    res.json(rows.map((r) => ({ ...r, red_flags: r.red_flags ? JSON.parse(r.red_flags) : [] })));
  })
);

// POST /api/v1/procurement — manual entry, runs the same rule engine used by the eGP sync
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { institutionId, description, value, method, supplierName, contractNumber, procurementDate } = req.body || {};
    if (!institutionId || !description || !value || !method || !supplierName || !procurementDate) {
      return res.status(400).json({ error: 'institutionId, description, value, method, supplierName and procurementDate are required' });
    }
    const flags = evaluateRedFlags({ institution_id: institutionId, supplier_name: supplierName, contract_number: contractNumber || null, value, method, procurement_date: procurementDate });
    const id = uuid();
    db.prepare(
      `INSERT INTO procurement_records (id, institution_id, description, value, currency, method, supplier_name, contract_number, procurement_date, source, red_flags, created_at)
       VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?, 'Manual', ?, datetime('now'))`
    ).run(id, institutionId, description, value, method, supplierName, contractNumber || null, procurementDate, flags.length ? JSON.stringify(flags) : null);

    if (flags.length > 0) {
      const inst = db.prepare(`SELECT name FROM institutions WHERE id = ?`).get(institutionId) as any;
      notifyRole('AUDITOR', 'PROCUREMENT_REDFLAG', { institutionName: inst?.name || '', description, value: String(value), flagCount: String(flags.length) }, 'procurement_record', id);
    }
    writeAudit({ userId: req.user!.sub, action: 'PROCUREMENT_RECORD_CREATED', entityType: 'procurement_record', entityId: id, details: { flagCount: flags.length } });
    res.status(201).json({ id, redFlags: flags });
  })
);

// POST /api/v1/procurement/egp-sync — simulated PRAZ eGP batch sync (Section 10.1, mock adapter)
router.post(
  '/egp-sync',
  asyncHandler(async (req, res) => {
    const institutions = db.prepare(`SELECT id FROM institutions ORDER BY RANDOM() LIMIT 4`).all() as { id: string }[];
    const suppliers = ['Ruvimbo Trading (Pvt) Ltd', 'TechBridge Solutions Zimbabwe', 'Nyati Construction Co.', 'Apex Fleet Services'];
    const methods = ['OpenTender', 'RestrictedTender', 'RequestForQuotations', 'Framework'];
    const created: any[] = [];

    institutions.forEach((inst, i) => {
      const value = 3000 + Math.floor(Math.random() * 20000);
      const method = methods[i % methods.length];
      const supplier = suppliers[i % suppliers.length];
      const procurementDate = new Date().toISOString().slice(0, 10);
      const contractNumber = `EGP-SYNC-${Date.now()}-${i}`;
      const flags = evaluateRedFlags({ institution_id: inst.id, supplier_name: supplier, contract_number: contractNumber, value, method, procurement_date: procurementDate });
      const id = uuid();
      db.prepare(
        `INSERT INTO procurement_records (id, institution_id, description, value, currency, method, supplier_name, contract_number, procurement_date, source, red_flags, created_at)
         VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?, 'eGP_Sync', ?, datetime('now'))`
      ).run(id, inst.id, 'PRAZ eGP synced award', value, method, supplier, contractNumber, procurementDate, flags.length ? JSON.stringify(flags) : null);
      created.push({ id, institutionId: inst.id, value, redFlags: flags });
    });

    writeAudit({ userId: req.user!.sub, action: 'EGP_SYNC_RUN', entityType: 'procurement_record', details: { recordsImported: created.length } });
    res.json({ imported: created.length, records: created });
  })
);

export default router;
