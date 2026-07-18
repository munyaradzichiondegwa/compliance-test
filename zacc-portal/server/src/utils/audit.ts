import { v4 as uuid } from 'uuid';
import { db } from '../db';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

const insertStmt = db.prepare(`
  INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
  VALUES (@id, @userId, @action, @entityType, @entityId, @details, @ipAddress, datetime('now'))
`);

/**
 * Writes to the immutable audit trail (Section 19, WFE-05).
 * IMPORTANT: never pass ipAddress for whistleblower-related actions taken by
 * the reporter themselves — anonymity is a hard requirement (Section 20.3).
 */
export function writeAudit(entry: AuditEntry) {
  insertStmt.run({
    id: uuid(),
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    details: entry.details ? JSON.stringify(entry.details) : null,
    ipAddress: entry.ipAddress ?? null,
  });
}

export function listAuditLogs(filters: { entityType?: string; entityId?: string; userId?: string; limit?: number }) {
  let sql = `SELECT a.*, u.name as user_name, u.role as user_role FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE 1=1`;
  const params: Record<string, unknown> = {};
  if (filters.entityType) {
    sql += ` AND entity_type = @entityType`;
    params.entityType = filters.entityType;
  }
  if (filters.entityId) {
    sql += ` AND entity_id = @entityId`;
    params.entityId = filters.entityId;
  }
  if (filters.userId) {
    sql += ` AND a.user_id = @userId`;
    params.userId = filters.userId;
  }
  sql += ` ORDER BY a.created_at DESC LIMIT @limit`;
  params.limit = filters.limit ?? 200;
  return db.prepare(sql).all(params);
}
