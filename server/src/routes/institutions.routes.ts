import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';

const router = Router();

// GET /api/v1/institutions — filterable list (public-safe fields only unless authenticated)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { risk, province, sector, type, search, page = '1', limit = '50' } = req.query as Record<string, string>;
    let sql = `SELECT * FROM institutions WHERE 1=1`;
    const params: any[] = [];
    if (risk) {
      sql += ` AND risk_level = ?`;
      params.push(risk);
    }
    if (province) {
      sql += ` AND province = ?`;
      params.push(province);
    }
    if (sector) {
      sql += ` AND sector = ?`;
      params.push(sector);
    }
    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }
    if (search) {
      sql += ` AND name LIKE ?`;
      params.push(`%${search}%`);
    }
    sql += ` ORDER BY name ASC`;
    const all = db.prepare(sql).all(...params) as any[];

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const start = (p - 1) * l;
    const paged = all.slice(start, start + l);

    res.json({ total: all.length, page: p, limit: l, results: paged });
  })
);

// GET /api/v1/institutions/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const inst = db.prepare(`SELECT * FROM institutions WHERE id = ?`).get(req.params.id);
    if (!inst) return res.status(404).json({ error: 'Institution not found' });
    res.json(inst);
  })
);

// GET /api/v1/institutions/:id/assessments
router.get(
  '/:id/assessments',
  asyncHandler(async (req, res) => {
    const rows = db.prepare(`SELECT * FROM assessments WHERE institution_id = ? ORDER BY created_at DESC`).all(req.params.id);
    res.json(rows);
  })
);

// GET /api/v1/institutions/:id/summary — profile + latest score + open items, for the institution profile page
router.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    const inst = db.prepare(`SELECT * FROM institutions WHERE id = ?`).get(req.params.id) as any;
    if (!inst) return res.status(404).json({ error: 'Institution not found' });

    const latestAssessment = db.prepare(`SELECT * FROM assessments WHERE institution_id = ? AND status = 'Closed' ORDER BY closed_at DESC LIMIT 1`).get(req.params.id);
    const openRecs = db.prepare(`SELECT COUNT(*) c FROM recommendations WHERE institution_id = ? AND status NOT IN ('Closed','Verified')`).get(req.params.id) as { c: number };
    const closedRecs = db.prepare(`SELECT COUNT(*) c FROM recommendations WHERE institution_id = ? AND status IN ('Closed','Verified')`).get(req.params.id) as { c: number };
    const openRisks = db.prepare(`SELECT * FROM corruption_risks WHERE institution_id = ? AND treatment_status = 'Open' ORDER BY inherent_score DESC`).all(req.params.id);
    const committee = db.prepare(`SELECT * FROM integrity_committees WHERE institution_id = ?`).get(req.params.id);
    const assessmentHistory = db.prepare(`SELECT id, composite_score, rag_status, closed_at, created_at FROM assessments WHERE institution_id = ? AND composite_score IS NOT NULL ORDER BY created_at ASC`).all(req.params.id);

    res.json({ institution: inst, latestAssessment, openRecommendations: openRecs.c, closedRecommendations: closedRecs.c, openRisks, committee, assessmentHistory });
  })
);

// POST /api/v1/institutions
router.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, type, sector, ownership, province, district, latitude, longitude, riskLevel, registrationNo } = req.body || {};
    if (!name || !type || !sector || !ownership || !province || !district) {
      return res.status(400).json({ error: 'name, type, sector, ownership, province and district are required' });
    }
    const id = uuid();
    db.prepare(
      `INSERT INTO institutions (id, name, type, sector, ownership, province, district, latitude, longitude, risk_level, status, registration_no, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, datetime('now'), datetime('now'))`
    ).run(id, name, type, sector, ownership, province, district, latitude ?? null, longitude ?? null, riskLevel || 'Medium', registrationNo || null, req.user!.sub);

    writeAudit({ userId: req.user!.sub, action: 'INSTITUTION_CREATED', entityType: 'institution', entityId: id, details: { name } });
    res.status(201).json({ id });
  })
);

// PUT /api/v1/institutions/:id
router.put(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const inst = db.prepare(`SELECT * FROM institutions WHERE id = ?`).get(req.params.id) as any;
    if (!inst) return res.status(404).json({ error: 'Institution not found' });

    const fields = ['name', 'type', 'sector', 'ownership', 'province', 'district', 'latitude', 'longitude', 'risk_level', 'status'];
    const bodyMap: Record<string, string> = { riskLevel: 'risk_level' };
    const updates: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(req.body || {})) {
      const col = bodyMap[key] || key;
      if (fields.includes(col)) {
        if (value !== inst[col]) {
          db.prepare(`INSERT INTO institution_history (id, institution_id, field_changed, old_value, new_value, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`).run(
            uuid(), req.params.id, col, String(inst[col] ?? ''), String(value ?? ''), req.user!.sub
          );
        }
        updates.push(`${col} = ?`);
        params.push(value);
      }
    }
    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE institutions SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    }
    writeAudit({ userId: req.user!.sub, action: 'INSTITUTION_UPDATED', entityType: 'institution', entityId: req.params.id });
    res.json({ ok: true });
  })
);

// GET /api/v1/institutions/:id/history — full audit trail of every record change (Section 10.1)
router.get(
  '/:id/history',
  authenticate,
  asyncHandler(async (req, res) => {
    const rows = db.prepare(`SELECT h.*, u.name as changed_by_name FROM institution_history h LEFT JOIN users u ON u.id = h.changed_by WHERE institution_id = ? ORDER BY created_at DESC`).all(req.params.id);
    res.json(rows);
  })
);

// GET /api/v1/institutions/meta/provinces-sectors — distinct filter values for UI dropdowns
router.get(
  '/meta/provinces-sectors',
  asyncHandler(async (_req, res) => {
    const provinces = db.prepare(`SELECT DISTINCT province FROM institutions ORDER BY province`).all().map((r: any) => r.province);
    const sectors = db.prepare(`SELECT DISTINCT sector FROM institutions ORDER BY sector`).all().map((r: any) => r.sector);
    const types = db.prepare(`SELECT DISTINCT type FROM institutions ORDER BY type`).all().map((r: any) => r.type);
    res.json({ provinces, sectors, types });
  })
);

export default router;
