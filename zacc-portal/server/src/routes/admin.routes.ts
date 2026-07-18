import { Router } from 'express';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { runAllScheduledChecks } from '../jobs/scheduler';
import { writeAudit } from '../utils/audit';

const router = Router();
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN'));

// POST /api/v1/admin/run-scheduler — trigger the SLA sweep on demand (demo convenience; runs hourly automatically otherwise)
router.post(
  '/run-scheduler',
  asyncHandler(async (req, res) => {
    const result = runAllScheduledChecks();
    writeAudit({ userId: req.user!.sub, action: 'SCHEDULER_RUN_MANUAL', details: result as any });
    res.json(result);
  })
);

// GET /api/v1/admin/system-stats
router.get(
  '/system-stats',
  asyncHandler(async (_req, res) => {
    const tables = [
      'users', 'institutions', 'assessments', 'recommendations', 'systems_reviews', 'integrity_committees',
      'pledges', 'whistleblower_reports', 'corruption_risks', 'procurement_records', 'notifications', 'audit_logs',
    ];
    const stats: Record<string, number> = {};
    tables.forEach((t) => {
      stats[t] = (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
    });
    res.json(stats);
  })
);

export default router;
