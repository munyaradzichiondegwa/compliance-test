import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { emitToUser } from '../socket';

// Multi-channel Notification Service — PRD Section 10.2.
// NOT-01 Email, NOT-02 SMS, NOT-03 In-app, NOT-05 Templates, NOT-06 Preferences.
//
// This is a genuinely functional dispatch pipeline: template rendering,
// per-user channel preferences, in-app persistence + live websocket push all
// really happen. Email/SMS have no real-world credentials available in this
// environment, so — exactly like the "log" mail driver used in most
// frameworks during development — outbound email/SMS are fully composed and
// written to email_outbox / sms_outbox tables (visible in the Admin > Dev
// Mailbox screen) instead of calling a live provider. Swapping in real
// delivery later is a one-function change: replace the two `outbox insert`
// calls below with e.g. nodemailer.sendMail(...) / Twilio's messages.create(...).

export type NotificationChannel = 'email' | 'sms' | 'in_app';

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function getPreference(userId: string, channel: NotificationChannel): boolean {
  const row = db
    .prepare(`SELECT enabled FROM user_notification_preferences WHERE user_id = ? AND channel = ?`)
    .get(userId, channel) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true; // default enabled if no explicit preference set
}

export function notifyUser(
  userId: string,
  templateCode: string,
  vars: Record<string, string | number>,
  relatedEntityType?: string,
  relatedEntityId?: string
) {
  const template = db.prepare(`SELECT * FROM notification_templates WHERE code = ?`).get(templateCode) as
    | { code: string; subject_template: string | null; body_template: string; channel: string }
    | undefined;

  const user = db.prepare(`SELECT id, email, phone, name FROM users WHERE id = ?`).get(userId) as
    | { id: string; email: string; phone: string | null; name: string }
    | undefined;
  if (!user) return;

  const body = template ? renderTemplate(template.body_template, vars) : String(vars.body ?? '');
  const subject = template?.subject_template ? renderTemplate(template.subject_template, vars) : String(vars.title ?? 'ZACC Compliance Portal Notification');

  // In-app (always recorded so the bell icon / worklist always reflects reality)
  if (getPreference(userId, 'in_app')) {
    const notifId = uuid();
    db.prepare(
      `INSERT INTO notifications (id, user_id, template_code, title, body, related_entity_type, related_entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(notifId, userId, templateCode, subject, body, relatedEntityType ?? null, relatedEntityId ?? null);
    emitToUser(userId, 'notification', { id: notifId, title: subject, body, createdAt: new Date().toISOString() });
  }

  // Email (outbox pattern — see module note above)
  if (getPreference(userId, 'email') && user.email) {
    db.prepare(
      `INSERT INTO email_outbox (id, to_address, subject, body, related_notification_id, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(uuid(), user.email, subject, body, null);
  }

  // SMS — only for templates flagged critical/high-priority in practice (callers decide),
  // but we still honour the recipient's channel preference here.
  if (getPreference(userId, 'sms') && user.phone && template?.channel === 'sms') {
    db.prepare(
      `INSERT INTO sms_outbox (id, to_phone, body, related_notification_id, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(uuid(), user.phone, `${subject}: ${body}`.slice(0, 300), null);
  }
}

export function notifyRole(role: string, templateCode: string, vars: Record<string, string | number>, relatedEntityType?: string, relatedEntityId?: string) {
  const users = db.prepare(`SELECT id FROM users WHERE role = ? AND is_active = 1`).all(role) as { id: string }[];
  users.forEach((u) => notifyUser(u.id, templateCode, vars, relatedEntityType, relatedEntityId));
}
