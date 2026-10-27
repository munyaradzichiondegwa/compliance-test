import { Request, Response, NextFunction } from 'express';
import { db } from '../db';

/** Roles that belong to client institutions rather than ZACC staff. */
export const INSTITUTION_ROLES = ['INSTITUTION_FOCAL_PERSON', 'INTEGRITY_COMMITTEE_CHAIR'];
export const isInstitutionRole = (role?: string) => !!role && INSTITUTION_ROLES.includes(role);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Blocks client-institution users from staff-only modules (analytics, GIS, AI, procurement, systems reviews ...). */
export function staffOnly(req: Request, res: Response, next: NextFunction) {
  if (isInstitutionRole(req.user?.role)) return res.status(403).json({ error: 'Forbidden — this module is for ZACC staff' });
  next();
}

/**
 * Row-level scoping, mounted in front of a router.
 *  - Institution users: every list/query is pinned to their own institution; any record id in the path must
 *    belong to it (404 otherwise, so existence is not disclosed); exports are blocked.
 *  - Provincial Heads: lists are pinned to their province and records outside it are refused.
 * `table` is the table whose rows the :id path segments refer to (with an institution_id column, or `id` for the
 * institutions table itself).
 */
export function scope(table: 'institutions' | 'assessments' | 'recommendations' | 'integrity_committees' | 'pledges' | 'corruption_risks') {
  const instExpr = table === 'institutions' ? 't.id' : 't.institution_id';
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const inst = isInstitutionRole(user.role);
    const prov = user.role === 'PROVINCIAL_HEAD';
    if (!inst && !prov) return next();

    let province: string | null = null;
    if (prov) {
      province = (db.prepare(`SELECT province FROM users WHERE id = ?`).get(user.sub) as any)?.province || null;
      if (!province) return res.status(403).json({ error: 'No province is assigned to your account' });
    }
    if (inst && !user.institutionId) return res.status(403).json({ error: 'No institution is linked to your account' });

    const segments = req.path.split('/').filter(Boolean);
    if (inst && segments.some((s) => /export|register|import|bulk/i.test(s))) return res.status(403).json({ error: 'Forbidden' });

    // record-level check for every id in the path
    for (const seg of segments) {
      if (!UUID.test(seg)) continue;
      if (inst && seg === user.institutionId) continue;
      const row = db.prepare(`SELECT i.id AS inst_id, i.province AS province FROM ${table} t LEFT JOIN institutions i ON i.id = ${instExpr} WHERE t.id = ?`).get(seg) as any;
      if (!row) {
        // path may carry the institution id itself (e.g. /trends/:institutionId)
        const own = db.prepare(`SELECT id, province FROM institutions WHERE id = ?`).get(seg) as any;
        if (!own) return res.status(404).json({ error: 'Not found' });
        if ((inst && own.id !== user.institutionId) || (prov && own.province !== province)) return res.status(404).json({ error: 'Not found' });
        continue;
      }
      if (inst && row.inst_id !== user.institutionId) return res.status(404).json({ error: 'Not found' });
      if (prov && row.province !== province) return res.status(404).json({ error: 'Not found' });
    }

    // pin list filters / creation payloads
    if (inst) {
      const q = req.query as Record<string, any>;
      if (q.institutionId && q.institutionId !== user.institutionId) return res.status(403).json({ error: 'Forbidden' });
      q.institutionId = user.institutionId;
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        if (req.body.institutionId && req.body.institutionId !== user.institutionId) return res.status(403).json({ error: 'Forbidden' });
        if (table !== 'institutions') req.body.institutionId = user.institutionId;
      }
    }
    if (prov) {
      const q = req.query as Record<string, any>;
      if (q.province && q.province !== province) return res.status(403).json({ error: 'Forbidden — outside your province' });
      q.province = province;
      const bodyInst = req.body?.institutionId;
      if (bodyInst) {
        const target = db.prepare(`SELECT province FROM institutions WHERE id = ?`).get(bodyInst) as any;
        if (!target || target.province !== province) return res.status(403).json({ error: 'Forbidden — outside your province' });
      }
    }
    next();
  };
}
