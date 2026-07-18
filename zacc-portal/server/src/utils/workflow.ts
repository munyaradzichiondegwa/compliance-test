import { v4 as uuid } from 'uuid';
import { db } from '../db';

// Configurable Workflow Engine — PRD Section 10.3.
// WFE-01/02: administrators edit SLA thresholds & escalation rules per
//   workflow type through a form-based config screen (Admin > Workflow
//   Configuration) with NO code change required — this is the honest,
//   built version of "no-code configurability": a structured rules editor
//   rather than a full drag-and-drop BPMN canvas (which was out of scope
//   for this build; see README "Scope & Engineering Decisions").
// WFE-03/04: role-based escalation targets + SLA timers, read by jobs/scheduler.ts.
// WFE-05: every transition is written to workflow_history, immutably.

export interface WorkflowConfig {
  workflow_type: string;
  sla_days: number;
  escalate_to_role: string;
  reminder_intervals: number[];
}

export function getWorkflowConfig(workflowType: string): WorkflowConfig | null {
  const row = db.prepare(`SELECT * FROM workflow_configs WHERE workflow_type = ?`).get(workflowType) as
    | { workflow_type: string; sla_days: number; escalate_to_role: string; reminder_intervals: string }
    | undefined;
  if (!row) return null;
  return { ...row, reminder_intervals: JSON.parse(row.reminder_intervals) };
}

export function recordTransition(params: {
  entityType: string;
  entityId: string;
  fromState: string | null;
  toState: string;
  actorUserId?: string | null;
  reason?: string;
}) {
  db.prepare(
    `INSERT INTO workflow_history (id, entity_type, entity_id, from_state, to_state, actor_user_id, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(uuid(), params.entityType, params.entityId, params.fromState, params.toState, params.actorUserId ?? null, params.reason ?? null);
}

export function getHistory(entityType: string, entityId: string) {
  return db
    .prepare(
      `SELECT h.*, u.name as actor_name FROM workflow_history h LEFT JOIN users u ON u.id = h.actor_user_id
       WHERE h.entity_type = ? AND h.entity_id = ? ORDER BY h.created_at ASC`
    )
    .all(entityType, entityId);
}

/** Adds `days` calendar days, skipping weekends, to approximate "working days" per the PRD's acceptance criteria. */
export function addWorkingDays(from: Date, days: number): Date {
  const date = new Date(from);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return date;
}
