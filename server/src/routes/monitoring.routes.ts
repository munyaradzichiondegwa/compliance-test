import { Router, Request } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { isInstitutionRole } from '../middleware/scope';
import { writeAudit } from '../utils/audit';
import { textSimilarity } from '../utils/ai';
import { toCsv } from '../utils/csv';
import { ratingFromFindings, HttpError } from '../engagement/engine';
import { IC_FOLLOW_UP_DAYS } from '../engagement/sop';

// Monitoring registers required by the Compliance Procedure Manual and the monitoring SOPs:
// Auditor-General / internal-audit findings library, Devolution & ZINARA acquittals, government
// projects and programmes, Integrity Committee deliverables, the Electronic Compliance Monitoring
// Dashboard (ECMD), the quarterly monitoring plan, certificates and regulator measures.
const router = Router();
router.use(authenticate);

const bad = (m: string) => new HttpError(400, m);
const STAFF_WRITE = ['SUPER_ADMIN', 'GM_PREVENTION', 'MANAGER_COMPLIANCE', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'PROVINCIAL_HEAD'];
const AUDIT_WRITE = [...STAFF_WRITE, 'AUDITOR'];
const num = (v: any) => (v === undefined || v === null || v === '' ? null : Number(v));

/** Province pinned for Provincial Heads (null = national view). */
function provinceFor(req: Request): string | null {
  if (req.user!.role !== 'PROVINCIAL_HEAD') return null;
  const p = (db.prepare(`SELECT province FROM users WHERE id = ?`).get(req.user!.sub) as any)?.province;
  if (!p) throw new HttpError(403, 'No province is assigned to your account');
  return p;
}
function staffOnlyRead(req: Request) {
  if (isInstitutionRole(req.user!.role)) throw new HttpError(403, 'Forbidden');
}
function assertInstitutionInScope(req: Request, institutionId: string) {
  const prov = provinceFor(req);
  const inst = db.prepare(`SELECT id, province FROM institutions WHERE id = ?`).get(institutionId) as any;
  if (!inst) throw new HttpError(404, 'Institution not found');
  if (prov && inst.province !== prov) throw new HttpError(403, 'Forbidden — outside your province');
  return inst;
}

// ============================================================ Audit findings library (OAG / internal audit / media)
const SOURCES = ['OAG', 'InternalAudit', 'Media'];
function insertAuditFinding(b: any, userId: string) {
  if (!b.institutionId || !b.findingText || !SOURCES.includes(b.source) || !b.reportYear) throw bad('institutionId, source (OAG|InternalAudit|Media), reportYear and findingText are required');
  const prior = db.prepare(`SELECT finding_text FROM audit_findings WHERE institution_id = ? AND report_year < ?`).all(b.institutionId, Number(b.reportYear)) as { finding_text: string }[];
  const repeat = prior.some((p) => textSimilarity(p.finding_text, String(b.findingText)) >= 0.5) ? 1 : 0;
  const id = uuid();
  db.prepare(`INSERT INTO audit_findings (id, institution_id, source, report_year, opinion, finding_text, ipsas_ref, category, amount_usd, repeat_finding, recommendation) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, b.institutionId, b.source, Number(b.reportYear), b.opinion || null, String(b.findingText), b.ipsasRef || null, b.category || null, num(b.amountUsd), repeat, b.recommendation || null);
  writeAudit({ userId, action: 'AUDIT_FINDING_ADDED', entityType: 'audit_finding', entityId: id });
  return { id, repeat: !!repeat };
}

router.get('/audit-findings', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const prov = provinceFor(req);
  const { institutionId, source, year, repeat } = req.query as Record<string, string>;
  let sql = `SELECT a.*, i.name AS institution_name, i.province FROM audit_findings a JOIN institutions i ON i.id = a.institution_id WHERE (? IS NULL OR i.province = ?)`;
  const p: any[] = [prov, prov];
  if (institutionId) { sql += ` AND a.institution_id = ?`; p.push(institutionId); }
  if (source) { sql += ` AND a.source = ?`; p.push(source); }
  if (year) { sql += ` AND a.report_year = ?`; p.push(Number(year)); }
  if (repeat === 'true') sql += ` AND a.repeat_finding = 1`;
  sql += ` ORDER BY a.report_year DESC, i.name`;
  res.json(db.prepare(sql).all(...p));
}));
router.get('/audit-findings/summary', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const prov = provinceFor(req);
  res.json(db.prepare(`SELECT i.id AS institution_id, i.name AS institution_name, COUNT(*) AS findings, SUM(a.repeat_finding) AS repeats, COALESCE(SUM(a.amount_usd),0) AS amount_usd,
    SUM(CASE WHEN a.recommendation_id IS NOT NULL THEN 1 ELSE 0 END) AS tracked,
    (SELECT opinion FROM audit_findings x WHERE x.institution_id = i.id AND x.opinion IS NOT NULL ORDER BY x.report_year DESC LIMIT 1) AS latest_opinion
    FROM audit_findings a JOIN institutions i ON i.id = a.institution_id WHERE (? IS NULL OR i.province = ?) GROUP BY i.id ORDER BY repeats DESC, findings DESC`).all(prov, prov));
}));
router.post('/audit-findings', requireRole(...AUDIT_WRITE), asyncHandler(async (req, res) => {
  assertInstitutionInScope(req, req.body?.institutionId);
  res.status(201).json(insertAuditFinding(req.body || {}, req.user!.sub));
}));
// Bulk import of Auditor-General (or internal audit) report lines: { institutionId, source, reportYear, opinion, findings: [{findingText, ipsasRef, category, amountUsd, recommendation}] }
router.post('/audit-findings/import', requireRole(...AUDIT_WRITE), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.findings) || !b.findings.length) throw bad('findings[] required');
  assertInstitutionInScope(req, b.institutionId);
  const out = db.transaction(() => b.findings.map((f: any) => insertAuditFinding({ institutionId: b.institutionId, source: b.source || 'OAG', reportYear: b.reportYear, opinion: b.opinion, ...f }, req.user!.sub)))();
  res.status(201).json({ imported: out.length, repeats: out.filter((o: any) => o.repeat).length });
}));
// Turns an audit finding into a tracked recommendation (so it flows through reminders/escalation)
router.post('/audit-findings/:id/recommend', requireRole(...AUDIT_WRITE), asyncHandler(async (req, res) => {
  const f = db.prepare(`SELECT * FROM audit_findings WHERE id = ?`).get(req.params.id) as any;
  if (!f) throw new HttpError(404, 'Finding not found');
  assertInstitutionInScope(req, f.institution_id);
  if (f.recommendation_id) throw bad('Already tracked as a recommendation');
  const text = String(req.body?.description || f.recommendation || f.finding_text);
  const rid = uuid();
  db.prepare(`INSERT INTO recommendations (id, source_type, source_id, institution_id, description, category, priority, responsibility, time_frame, due_date, status) VALUES (?,?,?,?,?,?,?,?,?,?,'Created')`)
    .run(rid, f.source, f.id, f.institution_id, text, f.category || 'Finance', f.repeat_finding ? 'High' : 'Medium', req.body?.responsibility || 'Accounting Officer', '3 months', req.body?.dueDate || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  db.prepare(`UPDATE audit_findings SET recommendation_id = ? WHERE id = ?`).run(rid, f.id);
  writeAudit({ userId: req.user!.sub, action: 'AUDIT_FINDING_TRACKED', entityType: 'audit_finding', entityId: f.id });
  res.status(201).json({ recommendationId: rid });
}));

// ============================================================ Devolution / ZINARA acquittal tracker
function fundFlags(r: any) {
  const flags: string[] = [];
  const qEnd = new Date(Date.UTC(r.fiscal_year, (r.quarter || 4) * 3, 0));
  if (!r.acquitted && Date.now() > qEnd.getTime() + 60 * 86400000) flags.push('AcquittalOverdue');
  if (r.amount_disbursed > 0 && r.legacy_debt_paid / r.amount_disbursed > 0.4) flags.push('LegacyDebtHigh');
  if (r.amount_spent > r.amount_disbursed + 0.5) flags.push('Overspent');
  if (r.acquitted && Math.abs(r.amount_disbursed - r.amount_spent) > Math.max(1, r.amount_disbursed * 0.01)) flags.push('AcquittedWithVariance');
  return flags;
}
const withFund = (rows: any[]) => rows.map((r) => ({ ...r, variance: Math.round((r.amount_disbursed - r.amount_spent) * 100) / 100, legacy_share: r.amount_disbursed ? Math.round((r.legacy_debt_paid / r.amount_disbursed) * 1000) / 10 : 0, flags: fundFlags(r) }));
router.get('/funds', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const prov = provinceFor(req);
  const { fund, institutionId, year, flagged } = req.query as Record<string, string>;
  let sql = `SELECT f.*, i.name AS institution_name, i.province FROM fund_disbursements f JOIN institutions i ON i.id = f.institution_id WHERE (? IS NULL OR i.province = ?)`;
  const p: any[] = [prov, prov];
  if (fund) { sql += ` AND f.fund = ?`; p.push(fund); }
  if (institutionId) { sql += ` AND f.institution_id = ?`; p.push(institutionId); }
  if (year) { sql += ` AND f.fiscal_year = ?`; p.push(Number(year)); }
  sql += ` ORDER BY f.fiscal_year DESC, f.quarter DESC, i.name`;
  let rows = withFund(db.prepare(sql).all(...p) as any[]);
  if (flagged === 'true') rows = rows.filter((r) => r.flags.length);
  res.json(rows);
}));
router.get('/funds/export.csv', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const prov = provinceFor(req);
  const rows = withFund(db.prepare(`SELECT f.*, i.name AS institution_name FROM fund_disbursements f JOIN institutions i ON i.id = f.institution_id WHERE (? IS NULL OR i.province = ?) ORDER BY f.fiscal_year DESC`).all(prov, prov) as any[])
    .map((r) => ({ Institution: r.institution_name, Fund: r.fund, Year: r.fiscal_year, Quarter: r.quarter, Disbursed: r.amount_disbursed, Spent: r.amount_spent, 'Legacy debt paid': r.legacy_debt_paid, Variance: r.variance, Acquitted: r.acquitted ? 'Yes' : 'No', Flags: r.flags.join('; ') }));
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="Fund_Acquittals.csv"'); res.send(toCsv(rows));
}));
router.post('/funds', requireRole(...AUDIT_WRITE), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.institutionId || !['ZINARA', 'Devolution', 'Other'].includes(b.fund) || !b.fiscalYear || num(b.amountDisbursed) === null) throw bad('institutionId, fund, fiscalYear and amountDisbursed are required');
  if (b.quarter !== undefined && b.quarter !== null && b.quarter !== '' && ![1, 2, 3, 4].includes(Number(b.quarter))) throw bad('quarter must be 1-4');
  assertInstitutionInScope(req, b.institutionId);
  const id = uuid();
  db.prepare(`INSERT INTO fund_disbursements (id, institution_id, fund, fiscal_year, quarter, amount_disbursed, amount_spent, legacy_debt_paid, acquitted, acquittal_date, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, b.institutionId, b.fund, Number(b.fiscalYear), b.quarter ? Number(b.quarter) : null, Number(b.amountDisbursed), num(b.amountSpent) ?? 0, num(b.legacyDebtPaid) ?? 0, b.acquitted ? 1 : 0, b.acquitted ? (b.acquittalDate || new Date().toISOString().slice(0, 10)) : null, b.notes || null);
  res.status(201).json({ id });
}));
router.put('/funds/:id', requireRole(...AUDIT_WRITE), asyncHandler(async (req, res) => {
  const f = db.prepare(`SELECT * FROM fund_disbursements WHERE id = ?`).get(req.params.id) as any;
  if (!f) throw new HttpError(404, 'Not found');
  assertInstitutionInScope(req, f.institution_id);
  const b = req.body || {};
  const acquitted = b.acquitted === undefined ? f.acquitted : b.acquitted ? 1 : 0;
  db.prepare(`UPDATE fund_disbursements SET amount_spent = ?, legacy_debt_paid = ?, acquitted = ?, acquittal_date = ?, notes = ? WHERE id = ?`)
    .run(num(b.amountSpent) ?? f.amount_spent, num(b.legacyDebtPaid) ?? f.legacy_debt_paid, acquitted, acquitted ? (b.acquittalDate || f.acquittal_date || new Date().toISOString().slice(0, 10)) : null, b.notes ?? f.notes, f.id);
  writeAudit({ userId: req.user!.sub, action: 'FUND_UPDATED', entityType: 'fund_disbursement', entityId: f.id });
  res.json({ ok: true });
}));

// ============================================================ Government projects / programmes
function progFlags(p: any) {
  const flags: string[] = [];
  if (p.verified_progress !== null && p.reported_progress - p.verified_progress > 15) flags.push('ReportedAheadOfVerified');
  if (p.budget_usd && p.spent_usd / p.budget_usd * 100 - (p.verified_progress ?? p.reported_progress) > 20) flags.push('SpendAheadOfProgress');
  if (p.end_date && p.end_date < new Date().toISOString().slice(0, 10) && (p.verified_progress ?? p.reported_progress) < 100 && p.status !== 'Completed') flags.push('PastEndDate');
  return flags;
}
router.get('/programmes', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const prov = provinceFor(req);
  const { kind, institutionId } = req.query as Record<string, string>;
  let sql = `SELECT m.*, i.name AS institution_name, i.province FROM monitored_programmes m JOIN institutions i ON i.id = m.institution_id WHERE (? IS NULL OR i.province = ?)`;
  const p: any[] = [prov, prov];
  if (kind) { sql += ` AND m.kind = ?`; p.push(kind); }
  if (institutionId) { sql += ` AND m.institution_id = ?`; p.push(institutionId); }
  res.json((db.prepare(sql + ` ORDER BY m.name`).all(...p) as any[]).map((r) => ({ ...r, flags: progFlags(r) })));
}));
router.get('/programmes/:id', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const m = db.prepare(`SELECT m.*, i.name AS institution_name, i.province FROM monitored_programmes m JOIN institutions i ON i.id = m.institution_id WHERE m.id = ?`).get(req.params.id) as any;
  if (!m) throw new HttpError(404, 'Not found');
  assertInstitutionInScope(req, m.institution_id);
  res.json({ ...m, flags: progFlags(m), reports: db.prepare(`SELECT r.*, u.name AS verified_by_name FROM programme_progress_reports r LEFT JOIN users u ON u.id = r.verified_by WHERE r.programme_id = ? ORDER BY r.created_at DESC`).all(m.id) });
}));
router.post('/programmes', requireRole(...STAFF_WRITE), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.institutionId || !b.name || !['Project', 'Programme'].includes(b.kind)) throw bad('institutionId, name and kind (Project|Programme) are required');
  assertInstitutionInScope(req, b.institutionId);
  const id = uuid();
  db.prepare(`INSERT INTO monitored_programmes (id, kind, name, institution_id, source, scope, budget_usd, spent_usd, start_date, end_date, reported_progress, latitude, longitude, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, b.kind, b.name, b.institutionId, ['NationalPriority', 'NationalInterest', 'FiscalPolicy', 'MonetaryPolicy', 'Other'].includes(b.source) ? b.source : 'NationalPriority', b.scope || null, num(b.budgetUsd), num(b.spentUsd) ?? 0, b.startDate || null, b.endDate || null, num(b.reportedProgress) ?? 0, num(b.latitude), num(b.longitude), 'Active');
  res.status(201).json({ id });
}));
router.post('/programmes/:id/reports', requireRole(...STAFF_WRITE, 'INSTITUTION_FOCAL_PERSON'), asyncHandler(async (req, res) => {
  const m = db.prepare(`SELECT * FROM monitored_programmes WHERE id = ?`).get(req.params.id) as any;
  if (!m) throw new HttpError(404, 'Not found');
  if (isInstitutionRole(req.user!.role)) { if (req.user!.institutionId !== m.institution_id) throw new HttpError(404, 'Not found'); } else assertInstitutionInScope(req, m.institution_id);
  const b = req.body || {};
  const prog = num(b.reportedProgress);
  if (!b.period || prog === null || prog < 0 || prog > 100) throw bad('period and reportedProgress (0-100) are required');
  const id = uuid();
  db.prepare(`INSERT INTO programme_progress_reports (id, programme_id, period, reported_progress, spent_usd, narrative) VALUES (?,?,?,?,?,?)`).run(id, m.id, String(b.period), prog, num(b.spentUsd), b.narrative || null);
  db.prepare(`UPDATE monitored_programmes SET reported_progress = ?, spent_usd = COALESCE(?, spent_usd) WHERE id = ?`).run(prog, num(b.spentUsd), m.id);
  res.status(201).json({ id });
}));
// Physical verification by ZACC staff (site visit) of a reported progress figure
router.put('/programmes/:id/reports/:rid/verify', requireRole(...STAFF_WRITE), asyncHandler(async (req, res) => {
  const m = db.prepare(`SELECT * FROM monitored_programmes WHERE id = ?`).get(req.params.id) as any;
  if (!m) throw new HttpError(404, 'Not found');
  assertInstitutionInScope(req, m.institution_id);
  const v = num(req.body?.verifiedProgress);
  if (v === null || v < 0 || v > 100) throw bad('verifiedProgress (0-100) required');
  const r = db.prepare(`UPDATE programme_progress_reports SET verified_progress = ?, verified_by = ?, verified_at = datetime('now') WHERE id = ? AND programme_id = ?`).run(v, req.user!.sub, req.params.rid, m.id);
  if (!r.changes) throw new HttpError(404, 'Report not found');
  const status = v >= 100 ? 'Completed' : m.status === 'Completed' ? 'Active' : m.status;
  db.prepare(`UPDATE monitored_programmes SET verified_progress = ?, status = ? WHERE id = ?`).run(v, status, m.id);
  writeAudit({ userId: req.user!.sub, action: 'PROGRAMME_VERIFIED', entityType: 'monitored_programme', entityId: m.id, details: { reported: m.reported_progress, verified: v } });
  res.json({ ok: true });
}));

// ============================================================ Integrity Committee deliverables & returns
const IC_ITEMS = ['CorruptionRiskMatrix', 'IntegrityActionPlan', 'IntegrityCharter', 'Workplan'];
function committeeAccess(req: Request, committeeId: string) {
  const c = db.prepare(`SELECT c.*, i.name AS institution_name, i.province FROM integrity_committees c JOIN institutions i ON i.id = c.institution_id WHERE c.id = ?`).get(committeeId) as any;
  if (!c) throw new HttpError(404, 'Committee not found');
  if (isInstitutionRole(req.user!.role)) { if (req.user!.institutionId !== c.institution_id) throw new HttpError(404, 'Committee not found'); }
  else { const prov = provinceFor(req); if (prov && c.province !== prov) throw new HttpError(403, 'Forbidden — outside your province'); }
  return c;
}
router.get('/ic/overview', asyncHandler(async (req, res) => {
  const prov = provinceFor(req);
  const own = isInstitutionRole(req.user!.role) ? req.user!.institutionId : null;
  if (isInstitutionRole(req.user!.role) && !own) throw new HttpError(403, 'Forbidden');
  const rows = db.prepare(`SELECT c.id, c.institution_id, i.name AS institution_name, i.province, c.status, c.formed_date,
      (SELECT COUNT(*) FROM ic_deliverables d WHERE d.committee_id = c.id AND d.status IN ('Due','Overdue') AND d.due_date < date('now')) AS overdue_deliverables,
      (SELECT COUNT(*) FROM ic_deliverables d WHERE d.committee_id = c.id AND d.status = 'Submitted') AS submitted_deliverables,
      (SELECT COUNT(*) FROM ic_deliverables d WHERE d.committee_id = c.id) AS total_deliverables,
      (SELECT MAX(period) FROM ic_quarterly_reports q WHERE q.committee_id = c.id) AS last_report_period,
      (SELECT COUNT(*) FROM ic_quarterly_reports q WHERE q.committee_id = c.id AND q.is_annual_impact = 1) AS impact_assessments,
      (SELECT COUNT(*) FROM ic_return_forms f WHERE f.committee_id = c.id) AS return_forms
    FROM integrity_committees c JOIN institutions i ON i.id = c.institution_id
    WHERE (? IS NULL OR i.province = ?) AND (? IS NULL OR c.institution_id = ?) ORDER BY i.name`).all(prov, prov, own, own);
  res.json(rows);
}));
router.get('/ic/:committeeId/detail', asyncHandler(async (req, res) => {
  const c = committeeAccess(req, req.params.committeeId);
  res.json({ committee: c,
    deliverables: db.prepare(`SELECT * FROM ic_deliverables WHERE committee_id = ? ORDER BY due_date`).all(c.id),
    reports: db.prepare(`SELECT * FROM ic_quarterly_reports WHERE committee_id = ? ORDER BY period DESC`).all(c.id),
    returnForms: db.prepare(`SELECT * FROM ic_return_forms WHERE committee_id = ? ORDER BY training_date DESC`).all(c.id) });
}));
router.post('/ic/deliverables/:id/submit', requireRole(...STAFF_WRITE, 'INTEGRITY_COMMITTEE_CHAIR'), asyncHandler(async (req, res) => {
  const d = db.prepare(`SELECT * FROM ic_deliverables WHERE id = ?`).get(req.params.id) as any;
  if (!d) throw new HttpError(404, 'Not found');
  committeeAccess(req, d.committee_id);
  db.prepare(`UPDATE ic_deliverables SET status = 'Submitted', submitted_at = datetime('now') WHERE id = ?`).run(d.id);
  writeAudit({ userId: req.user!.sub, action: 'IC_DELIVERABLE_SUBMITTED', entityType: 'ic_deliverable', entityId: d.id });
  res.json({ ok: true });
}));
router.post('/ic/quarterly-reports', requireRole(...STAFF_WRITE, 'INTEGRITY_COMMITTEE_CHAIR'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const c = committeeAccess(req, b.committeeId);
  if (!/^\d{4}-(Q[1-4]|ANNUAL)$/.test(String(b.period || ''))) throw bad('period must look like 2026-Q3 or 2026-ANNUAL');
  const done = num(b.actionsCompleted), planned = num(b.actionsPlanned);
  if (done !== null && planned !== null && done > planned) throw bad('actionsCompleted cannot exceed actionsPlanned');
  const id = uuid();
  db.prepare(`INSERT INTO ic_quarterly_reports (id, committee_id, period, summary, actions_completed, actions_planned, is_annual_impact) VALUES (?,?,?,?,?,?,?)`)
    .run(id, c.id, b.period, b.summary || null, done, planned, String(b.period).endsWith('ANNUAL') || b.isAnnualImpact ? 1 : 0);
  res.status(201).json({ id });
}));
// IC training return form (IC Training SOP): also schedules the 30-day deliverables
router.post('/ic/return-forms', requireRole(...STAFF_WRITE), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const c = committeeAccess(req, b.committeeId);
  if (!b.trainingDate) throw bad('trainingDate required');
  const warnings: string[] = [];
  if (!b.hasHrm) warnings.push('Committee has no Human Resources representative');
  if (!b.hasLegal) warnings.push('Committee has no Legal representative');
  if (!b.hasAudit) warnings.push('Committee has no Audit representative');
  const id = uuid();
  db.transaction(() => {
    db.prepare(`INSERT INTO ic_return_forms (id, engagement_id, committee_id, training_date, member_count, has_hrm, has_legal, has_audit, topics, trainers) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.engagementId || null, c.id, b.trainingDate, num(b.memberCount), b.hasHrm ? 1 : 0, b.hasLegal ? 1 : 0, b.hasAudit ? 1 : 0, b.topics || null, b.trainers || null);
    const due = new Date(new Date(b.trainingDate).getTime() + IC_FOLLOW_UP_DAYS * 86400000).toISOString().slice(0, 10);
    const have = new Set((db.prepare(`SELECT item FROM ic_deliverables WHERE committee_id = ? AND status != 'Submitted'`).all(c.id) as any[]).map((r) => r.item));
    IC_ITEMS.filter((i) => !have.has(i)).forEach((item) => db.prepare(`INSERT INTO ic_deliverables (id, committee_id, item, due_date) VALUES (?,?,?,?)`).run(uuid(), c.id, item, due));
  })();
  res.status(201).json({ id, warnings, deliverablesDue: `${IC_FOLLOW_UP_DAYS} days after training` });
}));

// ============================================================ ECMD (Electronic Compliance Monitoring Dashboard)
export function ecmdRows(prov: string | null) {
  const insts = db.prepare(`SELECT DISTINCT i.id, i.name, i.province, i.sector FROM engagements e JOIN institutions i ON i.id = e.institution_id
    WHERE e.sop_type IN ('ComplianceAssessment','SystemsReview') AND e.status IN ('Completed','Monitoring','Closed') AND (? IS NULL OR i.province = ?) ORDER BY i.name`).all(prov, prov) as any[];
  return insts.map((i) => {
    const e = db.prepare(`SELECT * FROM engagements WHERE institution_id = ? AND sop_type IN ('ComplianceAssessment','SystemsReview') AND status IN ('Completed','Monitoring','Closed') ORDER BY COALESCE(completed_at, updated_at) DESC LIMIT 1`).get(i.id) as any;
    const findings = db.prepare(`SELECT implementation_status, compliance_rating FROM engagement_findings WHERE engagement_id = ?`).all(e.id) as any[];
    const r = ratingFromFindings(findings);
    const visits = db.prepare(`SELECT visit_date, overall_level FROM monitoring_visits WHERE engagement_id = ? AND visit_date IS NOT NULL ORDER BY visit_date`).all(e.id) as any[];
    const history = [{ date: (e.completed_at || '').slice(0, 10), level: e.compliance_level || 'Red' }, ...visits.map((v) => ({ date: v.visit_date, level: v.overall_level }))].filter((h) => h.level);
    const cert = db.prepare(`SELECT certificate_no, valid_until, status FROM compliance_certificates WHERE institution_id = ? AND status = 'Active' ORDER BY issued_at DESC LIMIT 1`).get(i.id) as any;
    const measures = (db.prepare(`SELECT COUNT(*) AS n FROM regulator_notices WHERE institution_id = ? AND status IN ('Proposed','Approved','Notified')`).get(i.id) as any).n;
    return { institutionId: i.id, institution: i.name, province: i.province, sector: i.sector, engagementId: e.id, reference: e.reference, level: r.level, implemented: r.implemented, total: r.total,
      monitoringDue: e.monitoring_due_at ? String(e.monitoring_due_at).slice(0, 10) : null, history, certificate: cert || null, openMeasures: measures };
  });
}
router.get('/ecmd', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const rows = ecmdRows(provinceFor(req));
  const count = (l: string) => rows.filter((r) => r.level === l).length;
  res.json({ summary: { Green: count('Green'), Amber: count('Amber'), Red: count('Red'), total: rows.length }, rows });
}));

// ============================================================ Quarterly monitoring plan
router.get('/plan', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const prov = provinceFor(req);
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const quarter = Number(req.query.quarter) || Math.floor(now.getMonth() / 3) + 1;
  if (![1, 2, 3, 4].includes(quarter)) throw bad('quarter must be 1-4');
  const from = new Date(Date.UTC(year, (quarter - 1) * 3, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);
  const items: any[] = [];
  (db.prepare(`SELECT e.id, e.reference, e.title, e.monitoring_due_at, e.status, i.name AS institution, i.id AS institution_id, i.province FROM engagements e JOIN institutions i ON i.id = e.institution_id
     WHERE e.monitoring_due_at IS NOT NULL AND e.status IN ('Completed','Monitoring') AND substr(e.monitoring_due_at,1,10) <= ? AND (? IS NULL OR i.province = ?) ORDER BY e.monitoring_due_at`).all(to, prov, prov) as any[]).forEach((e) => {
    const d = String(e.monitoring_due_at).slice(0, 10);
    items.push({ type: 'MonitoringVisit', due: d < from ? from : d, overdue: d < from, institutionId: e.institution_id, institution: e.institution, province: e.province, engagementId: e.id, label: `3-month monitoring visit — ${e.reference}`, note: e.status === 'Monitoring' ? 'Re-check ratings (Red → Amber → Green)' : 'First monitoring visit' });
  });
  ecmdRows(prov).filter((r) => r.level === 'Red' && !items.some((x) => x.engagementId === r.engagementId)).forEach((r) => items.push({ type: 'RedFollowUp', due: from, institutionId: r.institutionId, institution: r.institution, province: r.province, engagementId: r.engagementId, label: `Red-rated — follow up (${r.implemented}/${r.total} implemented)`, note: 'Consider regulator measures if no progress' }));
  (db.prepare(`SELECT c.certificate_no, c.valid_until, c.engagement_id, i.id AS institution_id, i.name AS institution, i.province FROM compliance_certificates c JOIN institutions i ON i.id = c.institution_id WHERE c.status = 'Active' AND c.valid_until BETWEEN ? AND ? AND (? IS NULL OR i.province = ?)`).all(from, to, prov, prov) as any[])
    .forEach((c) => items.push({ type: 'CertificateExpiry', due: c.valid_until, institutionId: c.institution_id, institution: c.institution, province: c.province, engagementId: c.engagement_id, label: `Certificate ${c.certificate_no} expires — re-verify`, note: 'Valid for one year only' }));
  (db.prepare(`SELECT d.item, d.due_date, i.id AS institution_id, i.name AS institution, i.province FROM ic_deliverables d JOIN integrity_committees c ON c.id = d.committee_id JOIN institutions i ON i.id = c.institution_id WHERE d.status IN ('Due','Overdue') AND d.due_date <= ? AND (? IS NULL OR i.province = ?)`).all(to, prov, prov) as any[])
    .forEach((d) => items.push({ type: 'ICDeliverable', due: d.due_date < from ? from : d.due_date, overdue: d.due_date < from, institutionId: d.institution_id, institution: d.institution, province: d.province, label: `Integrity Committee deliverable: ${d.item}`, note: '30 days after training' }));
  (db.prepare(`SELECT f.id, f.fund, f.fiscal_year, f.quarter, f.amount_disbursed, f.legacy_debt_paid, f.acquitted, i.id AS institution_id, i.name AS institution, i.province FROM fund_disbursements f JOIN institutions i ON i.id = f.institution_id WHERE f.acquitted = 0 AND (? IS NULL OR i.province = ?)`).all(prov, prov) as any[])
    .filter((f) => fundFlags({ ...f, amount_spent: 0 }).includes('AcquittalOverdue'))
    .forEach((f) => items.push({ type: 'FundAcquittal', due: from, overdue: true, institutionId: f.institution_id, institution: f.institution, province: f.province, label: `${f.fund} ${f.fiscal_year}${f.quarter ? ' Q' + f.quarter : ''} acquittal outstanding`, note: 'Request acquittal and supporting vouchers' }));
  items.sort((a, b) => String(a.due).localeCompare(String(b.due)));
  res.json({ year, quarter, from, to, items });
}));

// ============================================================ Certificates & regulator measures
router.get('/certificates', asyncHandler(async (req, res) => {
  const prov = provinceFor(req);
  const own = isInstitutionRole(req.user!.role) ? req.user!.institutionId : null;
  if (isInstitutionRole(req.user!.role) && !own) throw new HttpError(403, 'Forbidden');
  res.json((db.prepare(`SELECT c.*, i.name AS institution_name, i.province FROM compliance_certificates c JOIN institutions i ON i.id = c.institution_id WHERE (? IS NULL OR i.province = ?) AND (? IS NULL OR c.institution_id = ?) ORDER BY c.issued_at DESC`).all(prov, prov, own, own) as any[])
    .map((c) => ({ ...c, effective_status: c.status === 'Active' && c.valid_until < new Date().toISOString().slice(0, 10) ? 'Expired' : c.status, expiring_soon: c.status === 'Active' && c.valid_until <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) })));
}));
router.get('/regulator-notices', asyncHandler(async (req, res) => {
  staffOnlyRead(req);
  const prov = provinceFor(req);
  res.json(db.prepare(`SELECT r.*, i.name AS institution_name, e.reference FROM regulator_notices r JOIN institutions i ON i.id = r.institution_id LEFT JOIN engagements e ON e.id = r.engagement_id WHERE (? IS NULL OR i.province = ?) ORDER BY r.created_at DESC`).all(prov, prov));
}));
router.put('/regulator-notices/:id/status', requireRole('GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'COMMISSION_CHAIR', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const status = req.body?.status;
  if (!['Approved', 'Notified', 'Lifted'].includes(status)) throw bad('status must be Approved, Notified or Lifted');
  const r = db.prepare(`UPDATE regulator_notices SET status = ? WHERE id = ?`).run(status, req.params.id);
  if (!r.changes) throw new HttpError(404, 'Not found');
  writeAudit({ userId: req.user!.sub, action: `REGULATOR_NOTICE_${status.toUpperCase()}`, entityType: 'regulator_notice', entityId: req.params.id });
  res.json({ ok: true });
}));

// ============================================================ Libraries
router.get('/libraries', asyncHandler(async (_req, res) => {
  res.json({
    legalReferences: db.prepare(`SELECT * FROM legal_references ORDER BY applies_to, instrument`).all(),
    redFlags: db.prepare(`SELECT category, indicator FROM red_flag_indicators ORDER BY category`).all(),
  });
}));

export default router;
