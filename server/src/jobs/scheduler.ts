import cron from 'node-cron';
import { db } from '../db';
import { getWorkflowConfig, recordTransition } from '../utils/workflow';
import { notifyRole, notifyUser } from '../utils/notify';

// Workflow Engine SLA timers & escalation — PRD Section 10.3 (WFE-03 SLA
// timers with automated escalation, WFE-04 role-based escalation targets).
// Runs on a schedule in production; also exposed via POST /api/v1/admin/run-scheduler
// so it can be triggered on demand for a live demonstration without waiting
// for the next tick.

export function checkOverdueAssessments() {
  const config = getWorkflowConfig('AssessmentReview');
  if (!config) return { escalated: 0 };
  const overdue = db.prepare(`
    SELECT a.*, i.name as institution_name FROM assessments a JOIN institutions i ON i.id = a.institution_id
    WHERE a.status IN ('Submitted','UnderReview') AND a.escalated = 0 AND a.sla_due_at IS NOT NULL AND a.sla_due_at < datetime('now')
  `).all() as any[];

  overdue.forEach((a) => {
    db.prepare(`UPDATE assessments SET escalated = 1, updated_at = datetime('now') WHERE id = ?`).run(a.id);
    recordTransition({ entityType: 'assessment', entityId: a.id, fromState: a.status, toState: a.status, actorUserId: null, reason: `SLA breach — escalated to ${config.escalate_to_role}` });
    notifyRole(config.escalate_to_role, 'ASSESSMENT_ESCALATED', { institutionName: a.institution_name }, 'assessment', a.id);
  });
  return { escalated: overdue.length };
}

export function checkOverdueSystemsReviews() {
  const config = getWorkflowConfig('SystemsReviewApproval');
  if (!config) return { escalated: 0 };
  // Reviews sitting in UnderApproval beyond the SLA window (approximated via started_at + sla_days, since
  // there is no dedicated sla_due_at column on systems_reviews).
  const overdue = db.prepare(`
    SELECT * FROM systems_reviews WHERE status = 'UnderApproval'
    AND julianday('now') - julianday(started_at) > ?
  `).all(config.sla_days) as any[];
  overdue.forEach((r) => {
    notifyRole(config.escalate_to_role, 'ASSESSMENT_ESCALATED', { institutionName: r.title }, 'systems_review', r.id);
  });
  return { escalated: overdue.length };
}

export function checkOverdueRecommendations() {
  const config = getWorkflowConfig('RecommendationResponse');
  if (!config) return { reminded: 0, escalated: 0 };
  const overdue = db.prepare(`
    SELECT r.*, i.name as institution_name, CAST(julianday('now') - julianday(r.due_date) AS INTEGER) as daysOverdue
    FROM recommendations r JOIN institutions i ON i.id = r.institution_id
    WHERE r.status NOT IN ('Closed','Verified') AND r.due_date < date('now')
  `).all() as any[];

  let reminded = 0;
  let escalated = 0;
  const thresholds = config.reminder_intervals.slice().sort((a, b) => a - b); // e.g. [30, 60, 90]

  overdue.forEach((r) => {
    const crossedThreshold = [...thresholds].reverse().find((t) => r.daysOverdue >= t);
    if (!crossedThreshold) return;

    const alreadyNotifiedRecently = r.last_reminder_sent_at && new Date(r.last_reminder_sent_at).toDateString() === new Date().toDateString();
    if (alreadyNotifiedRecently) return;

    const isFinalThreshold = crossedThreshold === thresholds[thresholds.length - 1];
    const templateCode = isFinalThreshold ? 'RECOMMENDATION_REMINDER_90_ESCALATION' : crossedThreshold >= thresholds[Math.max(0, thresholds.length - 2)] ? 'RECOMMENDATION_REMINDER_60' : 'RECOMMENDATION_REMINDER_30';

    if (r.assigned_to_user_id) {
      notifyUser(r.assigned_to_user_id, templateCode, { institutionName: r.institution_name, description: r.description, daysOverdue: String(r.daysOverdue) }, 'recommendation', r.id);
    }
    if (isFinalThreshold) {
      notifyRole(config.escalate_to_role, templateCode, { institutionName: r.institution_name, description: r.description }, 'recommendation', r.id);
      db.prepare(`UPDATE recommendations SET escalation_level = 3, last_reminder_sent_at = datetime('now') WHERE id = ?`).run(r.id);
      escalated++;
    } else {
      db.prepare(`UPDATE recommendations SET escalation_level = ?, last_reminder_sent_at = datetime('now') WHERE id = ?`).run(crossedThreshold === thresholds[0] ? 1 : 2, r.id);
      reminded++;
    }
  });
  return { reminded, escalated };
}

export function checkExpiringPledges() {
  const rows = db.prepare(`
    SELECT s.*, p.title, p.expiry_date FROM pledge_signatories s JOIN pledges p ON p.id = s.pledge_id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date BETWEEN date('now') AND date('now','+14 days') AND s.expiry_reminder_sent = 0
  `).all() as any[];

  rows.forEach((s) => {
    // Signatories aren't necessarily portal users (bulk-imported names) — only
    // notify if we can resolve a matching user account by name; otherwise the
    // reminder still surfaces via the Admin > Pledges "expiring soon" list.
    const user = db.prepare(`SELECT id FROM users WHERE name = ?`).get(s.name) as { id: string } | undefined;
    if (user) notifyUser(user.id, 'PLEDGE_EXPIRY_REMINDER', { title: s.title, name: s.name, expiryDate: s.expiry_date }, 'pledge', s.pledge_id);
    db.prepare(`UPDATE pledge_signatories SET expiry_reminder_sent = 1 WHERE id = ?`).run(s.id);
  });
  return { reminded: rows.length };
}

export function runAllScheduledChecks() {
  const assessments = checkOverdueAssessments();
  const reviews = checkOverdueSystemsReviews();
  const recommendations = checkOverdueRecommendations();
  const pledges = checkExpiringPledges();
  return { assessments, reviews, recommendations, pledges, runAt: new Date().toISOString() };
}

/** Registers the recurring cron job. Runs hourly in production; the /admin/run-scheduler route lets a demo trigger it instantly. */
export function startScheduler() {
  cron.schedule('0 * * * *', () => {
    try {
      const result = runAllScheduledChecks();
      // eslint-disable-next-line no-console
      console.log('[scheduler] SLA sweep complete:', JSON.stringify(result));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[scheduler] SLA sweep failed:', err);
    }
  });
}
