import { Router } from 'express';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';
import { getHistory } from '../utils/workflow';

const router = Router();
router.use(authenticate);

// GET /api/v1/workflow-configs
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = db.prepare(`SELECT * FROM workflow_configs ORDER BY workflow_type`).all() as any[];
    res.json(rows.map((r) => ({ ...r, reminder_intervals: JSON.parse(r.reminder_intervals) })));
  })
);

// PUT /api/v1/workflow-configs/:workflowType
router.put(
  '/:workflowType',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (req, res) => {
    const { slaDays, escalateToRole, reminderIntervals } = req.body || {};
    const existing = db.prepare(`SELECT * FROM workflow_configs WHERE workflow_type = ?`).get(req.params.workflowType);
    if (!existing) return res.status(404).json({ error: 'Workflow config not found' });

    db.prepare(
      `UPDATE workflow_configs SET sla_days = COALESCE(?, sla_days), escalate_to_role = COALESCE(?, escalate_to_role), reminder_intervals = COALESCE(?, reminder_intervals), updated_by = ?, updated_at = datetime('now') WHERE workflow_type = ?`
    ).run(slaDays ?? null, escalateToRole ?? null, reminderIntervals ? JSON.stringify(reminderIntervals) : null, req.user!.sub, req.params.workflowType);

    writeAudit({ userId: req.user!.sub, action: 'WORKFLOW_CONFIG_UPDATED', entityType: 'workflow_config', entityId: req.params.workflowType, details: req.body });
    res.json({ ok: true });
  })
);

// GET /api/v1/workflow-configs/history/:entityType/:entityId — transition audit trail for any entity
router.get(
  '/history/:entityType/:entityId',
  asyncHandler(async (req, res) => {
    res.json(getHistory(req.params.entityType, req.params.entityId));
  })
);

export default router;
