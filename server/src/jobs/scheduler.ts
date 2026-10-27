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
    AND escalated = 0 AND julianday('now') - julianday(started_at) > ?
  `).all(config.sla_days) as any[];
  overdue.forEach((r) => {
    db.prepare(`UPDATE systems_reviews SET escalated = 1 WHERE id = ?`).run(r.id);
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

/** Marks a one-off alert as sent for an engagement; returns false if it was already sent. */
function once(e: any, key: string) {
  const sent = String(e.alerts_sent || '').split(',').filter(Boolean);
  if (sent.includes(key)) return false;
  sent.push(key);
  db.prepare(`UPDATE engagements SET alerts_sent = ? WHERE id = ?`).run(sent.join(','), e.id);
  e.alerts_sent = sent.join(',');
  return true;
}

/** SOP timelines: step SLAs, notification letter (2 days), draft report (5 days), 3-month monitoring, IC deliverables (30 days), certificate expiry. */
export function checkEngagements() {
  const config = getWorkflowConfig('EngagementStep');
  const target = config?.escalate_to_role || 'EXECUTIVE_SECRETARY';
  const out = { escalated: 0, letters: 0, reports: 0, monitoring: 0, icDeliverables: 0, certificates: 0 };

  (db.prepare(`SELECT e.*, i.name AS institution_name FROM engagements e JOIN institutions i ON i.id = e.institution_id
    WHERE e.status IN ('Preliminary','ConceptReview','IMReview','ReportReview','Committee','Commission') AND e.escalated = 0
    AND e.step_due_at IS NOT NULL AND e.step_due_at < ?`).all(new Date().toISOString()) as any[]).forEach((e) => {
    db.prepare(`UPDATE engagements SET escalated = 1, updated_at = datetime('now') WHERE id = ?`).run(e.id);
    recordTransition({ entityType: 'engagement', entityId: e.id, fromState: e.status, toState: e.status, actorUserId: null, reason: `SLA breach at ${e.current_step} — escalated to ${target}` });
    notifyRole(target, 'ENGAGEMENT_ESCALATED', { reference: e.reference, title: e.title, stage: e.current_step || e.status, institutionName: e.institution_name }, 'engagement', e.id);
    out.escalated++;
  });

  (db.prepare(`SELECT e.*, i.name AS institution_name FROM engagements e JOIN institutions i ON i.id = e.institution_id
    WHERE e.status = 'Approved' AND e.notification_signed_at IS NULL AND e.notification_due_at IS NOT NULL AND e.notification_due_at < ?`).all(new Date().toISOString()) as any[]).forEach((e) => {
    if (!once(e, 'letter')) return;
    notifyRole('EXECUTIVE_SECRETARY', 'ENGAGEMENT_LETTER_DUE', { reference: e.reference, title: e.title, institutionName: e.institution_name }, 'engagement', e.id);
    out.letters++;
  });

  (db.prepare(`SELECT e.*, i.name AS institution_name FROM engagements e JOIN institutions i ON i.id = e.institution_id
    WHERE e.status = 'ReportDraft' AND e.report_draft_due_at IS NOT NULL AND e.report_draft_due_at < ?`).all(new Date().toISOString()) as any[]).forEach((e) => {
    if (!once(e, 'report')) return;
    notifyTeam(e, 'ENGAGEMENT_REPORT_DUE', { institutionName: e.institution_name });
    out.reports++;
  });

  (db.prepare(`SELECT e.*, i.name AS institution_name FROM engagements e JOIN institutions i ON i.id = e.institution_id
    WHERE e.status IN ('Completed','Monitoring') AND e.monitoring_due_at IS NOT NULL AND e.monitoring_due_at <= date('now','+14 days')`).all() as any[]).forEach((e) => {
    if (!once(e, 'monitoring')) return;
    notifyRole('MONITORING_OFFICER', 'ENGAGEMENT_MONITORING_DUE', { reference: e.reference, title: e.title, institutionName: e.institution_name, dueDate: String(e.monitoring_due_at).slice(0, 10) }, 'engagement', e.id);
    out.monitoring++;
  });

  (db.prepare(`SELECT d.*, c.institution_id, i.name AS institution_name FROM ic_deliverables d JOIN integrity_committees c ON c.id = d.committee_id JOIN institutions i ON i.id = c.institution_id
    WHERE d.status IN ('Due','Overdue') AND d.due_date < date('now')`).all() as any[]).forEach((d) => {
    if (d.status === 'Due') {
      db.prepare(`UPDATE ic_deliverables SET status = 'Overdue' WHERE id = ?`).run(d.id);
      notifyRole('MONITORING_OFFICER', 'IC_DELIVERABLE_DUE', { institutionName: d.institution_name, item: d.item, dueDate: d.due_date }, 'ic_deliverable', d.id);
      out.icDeliverables++;
    }
  });

  out.certificates = db.prepare(`UPDATE compliance_certificates SET status = 'Expired' WHERE status = 'Active' AND valid_until < date('now')`).run().changes;
  return out;
}

function notifyTeam(e: any, template: string, vars: Record<string, string | number>) {
  const rows = db.prepare(`SELECT DISTINCT user_id FROM engagement_team WHERE engagement_id = ? AND user_id IS NOT NULL`).all(e.id) as any[];
  new Set<string>([...rows.map((r) => r.user_id), e.created_by]).forEach((id) => notifyUser(id, template, { reference: e.reference, title: e.title, ...vars }, 'engagement', e.id));
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
  const engagements = checkEngagements();
  return { assessments, reviews, recommendations, pledges, engagements, runAt: new Date().toISOString() };
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
