import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { listAuditLogs } from '../utils/audit';
import { toCsv } from '../utils/csv';

const router = Router();
router.use(authenticate);
router.use(requireRole('AUDITOR', 'SUPER_ADMIN', 'PREVENTION_HEAD'));

// GET /api/v1/audit-logs
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { entityType, entityId, userId, limit } = req.query as Record<string, string>;
    res.json(listAuditLogs({ entityType, entityId, userId, limit: limit ? parseInt(limit, 10) : undefined }));
  })
);

// GET /api/v1/audit-logs/export.csv
router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const rows = listAuditLogs({ limit: 5000 }) as any[];
    const csv = toCsv(rows.map((r) => ({ timestamp: r.created_at, user: r.user_name || 'System/Anonymous', role: r.user_role || '', action: r.action, entityType: r.entity_type, entityId: r.entity_id, ipAddress: r.ip_address || '' })));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Audit_Log_Export.csv"');
    res.send(csv);
  })
);

export default router;
