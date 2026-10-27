import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { addWorkingDays } from '../utils/workflow';
import { notifyRole, notifyUser } from '../utils/notify';
import { writeAudit } from '../utils/audit';
import { recordTransition } from '../utils/workflow';
import {
  SOPS, STEPS, StepKey, FlowName, SopDef, conceptChainFor, IM_CHAIN, REPORT_CHAIN, REPORT_STEP_SLA, PRELIM_CHAIN,
  MONITORING_MONTHS,
} from './sop';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const bad = (m: string) => new HttpError(400, m);

export interface Actor { sub: string; role: string; name: string; institutionId: string | null }

const parse = (s: any, fb: any = []) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
export const iso = (d: Date) => d.toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- loading
export function loadEngagement(id: string) {
  const e = db.prepare(`SELECT e.*, i.name AS institution_name, i.type AS institution_type, i.province, i.district, i.latitude AS inst_lat, i.longitude AS inst_lng,
      u.name AS created_by_name FROM engagements e JOIN institutions i ON i.id = e.institution_id JOIN users u ON u.id = e.created_by WHERE e.id = ?`).get(id) as any;
  if (!e) return null;
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  const team = db.prepare(`SELECT * FROM engagement_team WHERE engagement_id = ? ORDER BY CASE team_role WHEN 'TeamLeader' THEN 0 WHEN 'FocalPerson' THEN 1 ELSE 2 END, name`).all(id);
  const budget = (db.prepare(`SELECT * FROM engagement_budget_lines WHERE engagement_id = ? ORDER BY sort_order`).all(id) as any[])
    .map((b) => ({ ...b, total: round2(b.quantity * b.unit_cost * b.persons * b.days) }));
  const steps = db.prepare(`SELECT s.*, u.name AS actor_name FROM engagement_steps s LEFT JOIN users u ON u.id = s.actor_user_id WHERE s.engagement_id = ? ORDER BY s.created_at, s.rowid`).all(id);
  const findings = (db.prepare(`SELECT * FROM engagement_findings WHERE engagement_id = ? ORDER BY seq`).all(id) as any[]).map((f) => ({ ...f, finding_points: parse(f.finding_points) }));
  return {
    ...e,
    allegations: parse(e.allegations), objectives: parse(e.objectives), methodology: parse(e.methodology), expected_outcomes: parse(e.expected_outcomes), output_data: parse(e.output_data, {}),
    sop: { type: sop.type, label: sop.label, sopRef: sop.sopRef, hasIM: sop.hasIM, hasReport: sop.hasReport, hasMonitoring: sop.hasMonitoring, needsMethod: sop.needsMethod, minWorkingDays: sop.minWorkingDays, outputs: sop.outputs, evaluation: sop.evaluation, teamMin: sop.teamMin },
    team, budget, budgetTotal: round2(budget.reduce((s, b) => s + b.total, 0)),
    itinerary: db.prepare(`SELECT * FROM engagement_itinerary WHERE engagement_id = ? ORDER BY day_no, sort_order`).all(id),
    documents: db.prepare(`SELECT * FROM engagement_documents WHERE engagement_id = ? ORDER BY requested_at`).all(id),
    meetings: db.prepare(`SELECT * FROM engagement_meetings WHERE engagement_id = ? ORDER BY created_at`).all(id),
    interviews: db.prepare(`SELECT * FROM engagement_interviews WHERE engagement_id = ? ORDER BY interview_date, created_at`).all(id),
    visits: db.prepare(`SELECT * FROM monitoring_visits WHERE engagement_id = ? ORDER BY created_at`).all(id),
    certificate: db.prepare(`SELECT * FROM compliance_certificates WHERE engagement_id = ? ORDER BY issued_at DESC LIMIT 1`).get(id) || null,
    regulatorNotices: db.prepare(`SELECT * FROM regulator_notices WHERE engagement_id = ?`).all(id),
    steps, findings,
    chain: describeChain(e),
    pendingAction: pendingActionFor(e),
  };
}

export type LoadedEngagement = NonNullable<ReturnType<typeof loadEngagement>>;

// ---------------------------------------------------------------- access
export function isTeam(e: { id: string }, userId: string, roles?: string[]) {
  const row = db.prepare(`SELECT team_role FROM engagement_team WHERE engagement_id = ? AND user_id = ?`).get(e.id, userId) as { team_role: string } | undefined;
  if (!row) return false;
  return !roles || roles.includes(row.team_role);
}

const INSTITUTION_ROLES = ['INSTITUTION_FOCAL_PERSON', 'INTEGRITY_COMMITTEE_CHAIR'];
const ALL_STAFF_VIEW = ['SUPER_ADMIN', 'COMMISSION_CHAIR', 'PREVENTION_COMMITTEE', 'EXECUTIVE_SECRETARY', 'GM_PREVENTION', 'MANAGER_COMPLIANCE', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'AUDITOR', 'INVESTIGATIONS_OFFICER'];

export function canView(user: Actor, e: any): boolean {
  if (ALL_STAFF_VIEW.includes(user.role)) return true;
  if (user.role === 'PROVINCIAL_HEAD') {
    const u = db.prepare(`SELECT province FROM users WHERE id = ?`).get(user.sub) as { province: string | null } | undefined;
    return !u?.province || u.province === e.province;
  }
  if (INSTITUTION_ROLES.includes(user.role)) {
    return !!user.institutionId && user.institutionId === e.institution_id && ['Notified', 'Fieldwork', 'IMReview', 'ReportDraft', 'ReportReview', 'Committee', 'Commission', 'Completed', 'Monitoring', 'Closed'].includes(e.status);
  }
  return false;
}

export function canEdit(user: Actor, e: any): boolean {
  return user.role === 'SUPER_ADMIN' || user.role === 'MANAGER_COMPLIANCE' || e.created_by === user.sub || isTeam(e, user.sub);
}
export const CREATOR_ROLES = ['COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'PROVINCIAL_HEAD', 'MANAGER_COMPLIANCE', 'SUPER_ADMIN'];

function canActAt(user: Actor, e: any, step: StepKey): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  if (step === 'TeamLeader') return isTeam(e, user.sub, ['TeamLeader']);
  return STEPS[step].role === user.role;
}

// ---------------------------------------------------------------- chains
function flowOf(e: any): { flow: FlowName; chain: StepKey[] } | null {
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  if (e.status === 'Preliminary' && e.current_step) return { flow: 'Preliminary', chain: PRELIM_CHAIN };
  if (e.status === 'ConceptReview') return { flow: 'Concept', chain: conceptChainFor(sop, e.location_type) };
  if (e.status === 'IMReview') return { flow: 'IM', chain: IM_CHAIN };
  if (['ReportReview', 'Committee', 'Commission'].includes(e.status)) return { flow: 'Report', chain: REPORT_CHAIN };
  return null;
}
function describeChain(e: any) {
  const f = flowOf(e);
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  const mk = (flow: string, chain: StepKey[]) => ({ flow, steps: chain.map((k) => ({ key: k, label: STEPS[k].label })) });
  return {
    current: f ? { ...mk(f.flow, f.chain), at: e.current_step } : null,
    concept: mk('Concept', conceptChainFor(sop, e.location_type)),
    preliminary: mk('Preliminary', PRELIM_CHAIN),
    im: sop.hasIM ? mk('IM', IM_CHAIN) : null,
    report: sop.hasReport ? mk('Report', REPORT_CHAIN) : null,
  };
}
function pendingActionFor(e: any) {
  const f = flowOf(e);
  if (!f || !e.current_step) return null;
  return { flow: f.flow, step: e.current_step, label: STEPS[e.current_step as StepKey]?.label, role: STEPS[e.current_step as StepKey]?.role, dueAt: e.step_due_at };
}
function slaFor(flow: FlowName, step: StepKey): number {
  if (flow === 'Report') return REPORT_STEP_SLA[step] ?? STEPS[step].slaDays;
  return STEPS[step].slaDays;
}
function statusForReportStep(step: StepKey) { return step === 'PreventionCommittee' ? 'Committee' : step === 'CommissionChair' ? 'Commission' : 'ReportReview'; }

function record(eId: string, flow: string, step: string, decision: string, comment: string | null | undefined, user: Actor | null, dueAt?: string | null) {
  const onTime = dueAt ? (new Date() <= new Date(dueAt) ? 1 : 0) : null;
  db.prepare(`INSERT INTO engagement_steps (id, engagement_id, flow, step, decision, comment, actor_user_id, due_at, on_time) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), eId, flow, step, decision, comment || null, user?.sub ?? null, dueAt ?? null, onTime);
}
function setStatus(e: any, to: string, user: Actor | null, reason?: string) {
  recordTransition({ entityType: 'engagement', entityId: e.id, fromState: e.status, toState: to, actorUserId: user?.sub ?? null, reason });
  e.status = to;
}
function notifyStep(e: any, step: StepKey, flow: string) {
  const vars = { reference: e.reference, title: e.title, institutionName: e.institution_name || '', stage: STEPS[step].label, flow };
  if (step === 'TeamLeader') {
    const tl = db.prepare(`SELECT user_id FROM engagement_team WHERE engagement_id = ? AND team_role = 'TeamLeader' AND user_id IS NOT NULL`).get(e.id) as any;
    if (tl) notifyUser(tl.user_id, 'ENGAGEMENT_STEP_REQUEST', vars, 'engagement', e.id);
  } else notifyRole(STEPS[step].role, 'ENGAGEMENT_STEP_REQUEST', vars, 'engagement', e.id);
}
function notifyTeam(e: any, template: string, vars: Record<string, string | number>, exceptUser?: string) {
  const rows = db.prepare(`SELECT DISTINCT user_id FROM engagement_team WHERE engagement_id = ? AND user_id IS NOT NULL`).all(e.id) as any[];
  const ids = new Set<string>(rows.map((r) => r.user_id));
  ids.add(e.created_by);
  ids.forEach((id) => { if (id !== exceptUser) notifyUser(id, template, { reference: e.reference, title: e.title, ...vars }, 'engagement', e.id); });
}
function enter(e: any, flow: FlowName, step: StepKey) {
  const due = iso(addWorkingDays(new Date(), slaFor(flow, step)));
  const status = flow === 'Report' ? statusForReportStep(step) : e.status;
  db.prepare(`UPDATE engagements SET status = ?, current_step = ?, step_due_at = ?, escalated = 0, updated_at = datetime('now') WHERE id = ?`).run(status, step, due, e.id);
  e.status = status; e.current_step = step; e.step_due_at = due;
  notifyStep(e, step, flow);
}

// ---------------------------------------------------------------- creation
export function nextReference() {
  const year = new Date().getFullYear();
  const row = db.prepare(`SELECT COUNT(*) AS n FROM engagements WHERE reference LIKE ?`).get(`ZACC/CSR/${year}/%`) as { n: number };
  let n = row.n + 1;
  for (;;) {
    const ref = `ZACC/CSR/${year}/${String(n).padStart(3, '0')}`;
    if (!db.prepare(`SELECT 1 FROM engagements WHERE reference = ?`).get(ref)) return ref;
    n++;
  }
}

export function listify(v: any): string[] {
  return Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : typeof v === 'string' ? v.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

// ---------------------------------------------------------------- preliminary
export function submitPreliminary(e: any, user: Actor, body: any) {
  if (e.status !== 'Preliminary' || e.current_step) throw bad('Preliminary assessment is not open for submission');
  const cred = body.credibility;
  if (!['Credible', 'PartlyCredible', 'NotCredible', 'NotApplicable'].includes(cred)) throw bad('credibility must be Credible, PartlyCredible, NotCredible or NotApplicable');
  if (!body.notes || String(body.notes).trim().length < 10) throw bad('Preliminary notes (rationale and credibility assessment) are required');
  db.prepare(`UPDATE engagements SET credibility = ?, prelim_notes = ?, updated_at = datetime('now') WHERE id = ?`).run(cred, body.notes, e.id);
  record(e.id, 'Preliminary', 'Officer', 'Submitted', body.notes, user);
  enter(e, 'Preliminary', 'Manager');
}

// ---------------------------------------------------------------- concept
export function validateConcept(e: LoadedEngagement) {
  const problems: string[] = [];
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  if (!e.background) problems.push('background');
  if (!e.objectives.length) problems.push('objectives');
  if (!e.scope_text) problems.push('scope');
  if (!e.methodology.length) problems.push('methodology');
  if (!e.expected_outcomes.length) problems.push('expected outcomes');
  if (e.team.length < sop.teamMin) problems.push(`a team of at least ${sop.teamMin}`);
  if (!e.team.some((t: any) => t.team_role === 'TeamLeader')) problems.push('a Team Leader');
  if (!e.team.some((t: any) => t.team_role === 'FocalPerson')) problems.push('a Focal Person');
  if (sop.needsMethod && !e.method) problems.push('the method (RFD / RR / PCC) set by the General Manager');
  if (!e.budget.length) problems.push('resource requirements (budget)');
  if (!e.start_date || !e.end_date) problems.push('start and end dates');
  if (e.sop_type !== 'ICTraining' && e.sop_type !== 'PledgeSigning' && e.origin_source !== 'RoutineProgramme' && e.origin_source !== 'NationalPriority' && !e.allegations.length && !e.rationale) problems.push('allegations or a rationale/justification');
  if (e.sop_type !== 'ComplianceAssessment' || e.method === 'PCC' || e.method === 'RR') { if (!e.itinerary.length && e.method !== 'RFD') problems.push('an itinerary'); }
  return problems;
}

export function submitConcept(e: LoadedEngagement, user: Actor) {
  if (e.status !== 'ConceptDraft') throw bad(`Concept note can only be submitted from ConceptDraft (currently ${e.status})`);
  const problems = validateConcept(e);
  if (problems.length) throw bad(`Concept note incomplete — add ${problems.join(', ')}`);
  record(e.id, 'Concept', 'FocalPerson', 'Submitted', null, user);
  const chain = conceptChainFor(SOPS[e.sop_type as keyof typeof SOPS], e.location_type);
  setStatus(e, 'ConceptReview', user);
  enter(e, 'Concept', chain[0]);
}

// ---------------------------------------------------------------- decisions
export function decide(e: any, user: Actor, decision: 'Approve' | 'Return' | 'Reject', comment: string | undefined, extra: any = {}) {
  const f = flowOf(e);
  if (!f || !e.current_step) throw bad(`Nothing awaiting a decision (status ${e.status})`);
  const step = e.current_step as StepKey;
  if (!canActAt(user, e, step)) throw new HttpError(403, `This step requires the ${STEPS[step].label}`);
  if (!['Approve', 'Return', 'Reject'].includes(decision)) throw bad('decision must be Approve, Return or Reject');
  if (decision !== 'Approve' && !comment?.trim()) throw bad('A comment is required when returning or rejecting');
  if (decision === 'Reject' && !['Preliminary', 'Concept'].includes(f.flow)) throw bad('Only the preliminary assessment or concept note can be rejected; later stages are returned for correction');
  const idx = f.chain.indexOf(step);
  const isLast = idx === f.chain.length - 1;
  const word = decision === 'Approve' ? (isLast ? 'Approved' : 'Recommended') : decision === 'Return' ? 'Returned' : 'Rejected';

  // flow-specific validation on positive decision
  if (decision === 'Approve') {
    if (f.flow === 'Preliminary' && step === 'GM') {
      const sop = SOPS[e.sop_type as keyof typeof SOPS];
      if (extra.deploymentJustified === false) {
        record(e.id, f.flow, step, 'Rejected', comment || 'Deployment of ZACC resources not justified', user, e.step_due_at);
        db.prepare(`UPDATE engagements SET deployment_justified = 0, status = 'Cancelled', current_step = NULL, step_due_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(e.id);
        setStatus(e, 'Cancelled', user, 'Deployment not justified');
        notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: 'Cancelled — deployment not justified', stage: STEPS[step].label, notes: comment || '' }, user.sub);
        writeAudit({ userId: user.sub, action: 'ENGAGEMENT_CANCELLED', entityType: 'engagement', entityId: e.id });
        return;
      }
      if (sop.needsMethod && !['RFD', 'RR', 'PCC'].includes(extra.method)) throw bad('The General Manager must determine the method: RFD, RR or PCC');
      if (sop.needsMethod) db.prepare(`UPDATE engagements SET method = ? WHERE id = ?`).run(extra.method, e.id);
      db.prepare(`UPDATE engagements SET deployment_justified = 1 WHERE id = ?`).run(e.id);
    }
    if (f.flow === 'IM' && step === 'TeamLeader') db.prepare(`UPDATE engagements SET im_status = 'ClientReview' WHERE id = ?`).run(e.id);
  }

  record(e.id, f.flow, step, word, comment, user, e.step_due_at);

  if (decision === 'Approve' && !isLast) {
    enter(e, f.flow, f.chain[idx + 1]);
    notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: `${word} by ${STEPS[step].label}`, stage: STEPS[step].label, notes: comment || '' }, user.sub);
  } else if (decision === 'Approve') {
    finalise(e, f.flow, user);
  } else if (decision === 'Return') {
    returnBack(e, f.flow, user);
    notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: `Returned by ${STEPS[step].label}`, stage: STEPS[step].label, notes: comment || '' }, user.sub);
  } else {
    db.prepare(`UPDATE engagements SET status = 'Rejected', current_step = NULL, step_due_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(e.id);
    setStatus(e, 'Rejected', user, comment);
    notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: `Rejected by ${STEPS[step].label}`, stage: STEPS[step].label, notes: comment || '' }, user.sub);
  }
  writeAudit({ userId: user.sub, action: `ENGAGEMENT_${word.toUpperCase()}`, entityType: 'engagement', entityId: e.id, details: { flow: f.flow, step } });
}

function returnBack(e: any, flow: FlowName, user: Actor) {
  const to = flow === 'Preliminary' ? 'Preliminary' : flow === 'Concept' ? 'ConceptDraft' : flow === 'IM' ? 'Fieldwork' : 'ReportDraft';
  db.prepare(`UPDATE engagements SET status = ?, current_step = NULL, step_due_at = NULL, im_status = CASE WHEN ? = 'IM' THEN 'Draft' ELSE im_status END, updated_at = datetime('now') WHERE id = ?`).run(to, flow, e.id);
  if (to !== e.status) setStatus(e, to, user, 'Returned'); else recordTransition({ entityType: 'engagement', entityId: e.id, fromState: e.status, toState: to, actorUserId: user.sub, reason: 'Returned' });
}

function finalise(e: any, flow: FlowName, user: Actor) {
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  if (flow === 'Preliminary') {
    db.prepare(`UPDATE engagements SET status = 'ConceptDraft', current_step = NULL, step_due_at = NULL, prelim_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(e.id);
    setStatus(e, 'ConceptDraft', user, 'Preliminary assessment approved');
    notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: 'Preliminary assessment approved — prepare the Concept Note', stage: 'General Manager', notes: '' }, user.sub);
  } else if (flow === 'Concept') {
    const due = iso(addWorkingDays(new Date(), 2));
    db.prepare(`UPDATE engagements SET status = 'Approved', current_step = NULL, step_due_at = NULL, notification_due_at = ?, updated_at = datetime('now') WHERE id = ?`).run(due, e.id);
    setStatus(e, 'Approved', user, 'Concept note approved by the Executive Secretary');
    notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: 'Concept note approved — notification letter due within 2 working days', stage: 'Executive Secretary', notes: '' }, user.sub);
  } else if (flow === 'IM') {
    db.prepare(`UPDATE engagements SET im_status = 'Adopted', im_adopted_at = datetime('now'), current_step = NULL, step_due_at = NULL, report_draft_due_at = ?, updated_at = datetime('now') WHERE id = ?`).run(iso(addWorkingDays(new Date(), 5)), e.id);
    if (sop.hasReport) { setStatus(e, 'ReportDraft', user, 'Implementation Matrix adopted'); db.prepare(`UPDATE engagements SET status = 'ReportDraft' WHERE id = ?`).run(e.id); }
    else completeEngagement(e, user);
    notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: 'Implementation Matrix adopted — client to endorse; draft report due within 5 working days', stage: 'Executive Secretary', notes: '' }, user.sub);
  } else {
    completeEngagement(e, user);
  }
}

// ---------------------------------------------------------------- fieldwork
export function issueNotification(e: any, user: Actor) {
  if (e.status !== 'Approved') throw bad('The notification letter can only be issued once the concept note is approved');
  const year = new Date().getFullYear();
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM engagements WHERE notification_ref IS NOT NULL AND notification_ref LIKE ?`).get(`ZACC/PREV/CSR/${year}/%`) as any).n + 1;
  const ref = `ZACC/PREV/CSR/${year}/${String(n).padStart(3, '0')}`;
  db.prepare(`UPDATE engagements SET notification_ref = ?, notification_signed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(ref, e.id);
  record(e.id, 'Notification', 'ExecutiveSecretary', 'Approved', `Notification letter ${ref} signed`, user, e.notification_due_at);
  setStatus(e, 'Notified', user, `Notification letter ${ref}`);
  db.prepare(`UPDATE engagements SET status = 'Notified' WHERE id = ?`).run(e.id);
  // notify the institution focal person(s)
  const fps = db.prepare(`SELECT id FROM users WHERE institution_id = ? AND role IN ('INSTITUTION_FOCAL_PERSON') AND is_active = 1`).all(e.institution_id) as any[];
  fps.forEach((u) => notifyUser(u.id, 'ENGAGEMENT_NOTICE_TO_INSTITUTION', { reference: ref, title: e.title, startDate: e.start_date || '', institutionName: e.institution_name || '' }, 'engagement', e.id));
  notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: `Notification letter ${ref} issued`, stage: 'Executive Secretary', notes: '' }, user.sub);
  writeAudit({ userId: user.sub, action: 'ENGAGEMENT_NOTIFIED', entityType: 'engagement', entityId: e.id, details: { ref } });
}

export function startFieldwork(e: any, user: Actor) {
  if (e.status !== 'Notified') throw bad('Fieldwork can start only after the notification letter has been issued');
  setStatus(e, 'Fieldwork', user);
  db.prepare(`UPDATE engagements SET status = 'Fieldwork', updated_at = datetime('now') WHERE id = ?`).run(e.id);
}

export function concludeFieldwork(e: LoadedEngagement, user: Actor) {
  if (e.status !== 'Fieldwork') throw bad('Only an engagement in Fieldwork can be concluded');
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  const wdays = e.itinerary.length ? new Set(e.itinerary.map((r: any) => r.day_no)).size : e.days || 0;
  if (sop.hasIM || sop.hasReport) {
    if (!e.findings.length) throw bad('Record at least one finding before concluding fieldwork');
    const noRec = e.findings.filter((f: any) => f.compliance_rating !== 'Compliant' && !f.recommendation);
    if (noRec.length) throw bad(`Finding(s) ${noRec.map((f: any) => f.seq).join(', ')} need a recommendation`);
    if (e.method !== 'RFD' && !e.meetings.some((m: any) => m.kind === 'Exit')) throw bad('Record the exit meeting (preliminary findings discussed with management) before concluding');
  }
  void wdays;
  db.prepare(`UPDATE engagements SET output_data = output_data WHERE id = ?`).run(e.id);
  if (sop.hasIM) {
    db.prepare(`UPDATE engagements SET im_status = 'Draft' WHERE id = ?`).run(e.id);
    setStatus(e, 'IMReview', user, 'Fieldwork concluded — Implementation Matrix submitted');
    record(e.id, 'IM', 'FocalPerson', 'Submitted', null, user);
    enter(e, 'IM', 'TeamLeader');
    db.prepare(`UPDATE engagements SET status = 'IMReview' WHERE id = ?`).run(e.id);
  } else if (sop.hasReport) {
    db.prepare(`UPDATE engagements SET status = 'ReportDraft', report_draft_due_at = ?, updated_at = datetime('now') WHERE id = ?`).run(iso(addWorkingDays(new Date(), 5)), e.id);
    setStatus(e, 'ReportDraft', user, 'Fieldwork concluded');
  } else {
    completeEngagement(e, user);
  }
}

export function submitReport(e: LoadedEngagement, user: Actor, body: any) {
  if (e.status !== 'ReportDraft') throw bad('Report can be submitted only from ReportDraft');
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  if (sop.hasIM && !['Adopted', 'Signed'].includes(e.im_status)) throw bad('The Implementation Matrix must be adopted before the report is submitted');
  if (!['Red', 'Amber', 'Green'].includes(body.complianceLevel)) throw bad('complianceLevel must be Red, Amber or Green');
  if (!body.conclusion || String(body.conclusion).trim().length < 10) throw bad('A conclusion is required');
  db.prepare(`UPDATE engagements SET compliance_level = ?, conclusion = ?, updated_at = datetime('now') WHERE id = ?`).run(body.complianceLevel, body.conclusion, e.id);
  record(e.id, 'Report', 'FocalPerson', 'Submitted', null, user);
  enter(e, 'Report', 'TeamLeader');
  setStatus(e, 'ReportReview', user);
}

export function signIM(e: any, user: Actor, signatory: string) {
  if (e.im_status !== 'Adopted') throw bad('The Implementation Matrix has not been adopted by the Commission yet');
  if (!signatory?.trim()) throw bad('Name and title of the client signatory are required');
  db.prepare(`UPDATE engagements SET im_status = 'Signed', im_client_signatory = ?, im_client_signed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(signatory.trim(), e.id);
  record(e.id, 'IM', 'Client', 'Noted', `Endorsed by ${signatory.trim()}`, user);
  writeAudit({ userId: user.sub, action: 'IM_SIGNED', entityType: 'engagement', entityId: e.id });
}

// ---------------------------------------------------------------- completion & recommendations
function dueFromTimeframe(tf: string | null) {
  const d = new Date();
  const t = (tf || '').toLowerCase();
  d.setDate(d.getDate() + (t.includes('immediate') ? 30 : t.includes('short') ? 90 : t.includes('long') ? 365 : 180));
  return d.toISOString().slice(0, 10);
}

export function publishRecommendations(e: any) {
  const rows = db.prepare(`SELECT * FROM engagement_findings WHERE engagement_id = ? AND recommendation IS NOT NULL AND recommendation_id IS NULL AND referred_to_investigations = 0 AND compliance_rating != 'Compliant'`).all(e.id) as any[];
  let n = 0;
  rows.forEach((f) => {
    const resp = String(f.responsibility || '').trim();
    if (resp.toLowerCase() === 'zacc') return;
    const rid = uuid();
    const due = f.due_date || dueFromTimeframe(f.time_frame);
    db.prepare(`INSERT INTO recommendations (id, source_type, source_id, institution_id, description, category, priority, owner_name, responsibility, time_frame, due_date, status) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'Created')`)
      .run(rid, 'Engagement', e.id, e.institution_id, f.recommendation, f.category, f.severity, resp || null, resp || null, f.time_frame, due);
    db.prepare(`UPDATE engagement_findings SET recommendation_id = ?, due_date = ? WHERE id = ?`).run(rid, due, f.id);
    n++;
  });
  return n;
}

function completeEngagement(e: any, user: Actor | null) {
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  const months = sop.hasMonitoring ? MONITORING_MONTHS : 0;
  const mon = months ? new Date(new Date().setMonth(new Date().getMonth() + months)).toISOString() : null;
  db.prepare(`UPDATE engagements SET status = 'Completed', current_step = NULL, step_due_at = NULL, completed_at = datetime('now'), monitoring_due_at = ?, updated_at = datetime('now') WHERE id = ?`).run(mon, e.id);
  setStatus(e, 'Completed', user, 'Completed');
  const published = publishRecommendations(e);
  if (e.sop_type === 'ICTraining') scheduleIcFollowUp(e);
  notifyTeam(e, 'ENGAGEMENT_DECISION', { decision: `Completed${published ? ` — ${published} recommendation(s) published to the tracker` : ''}`, stage: 'Commission', notes: '' }, user?.sub);
  writeAudit({ userId: user?.sub, action: 'ENGAGEMENT_COMPLETED', entityType: 'engagement', entityId: e.id, details: { published } });
}

function scheduleIcFollowUp(e: any) {
  const c = db.prepare(`SELECT id FROM integrity_committees WHERE institution_id = ?`).get(e.institution_id) as any;
  if (!c) return;
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  ['CorruptionRiskMatrix', 'IntegrityActionPlan', 'IntegrityCharter', 'Workplan'].forEach((item) => {
    if (!db.prepare(`SELECT 1 FROM ic_deliverables WHERE committee_id = ? AND item = ? AND status != 'Submitted'`).get(c.id, item))
      db.prepare(`INSERT INTO ic_deliverables (id, committee_id, item, due_date) VALUES (?,?,?,?)`).run(uuid(), c.id, item, due);
  });
}

/** Completion for engagement types whose output is a form/signed pledges rather than a reviewed report. */
export function completeSimple(e: LoadedEngagement, user: Actor, output: any) {
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  if (sop.hasReport) throw bad('This engagement type completes through the report process');
  if (e.status !== 'Fieldwork') throw bad('Engagement must be in Fieldwork to record the outputs');
  if (e.sop_type === 'ICTraining') {
    const c = db.prepare(`SELECT id FROM integrity_committees WHERE institution_id = ?`).get(e.institution_id) as any;
    if (!c) throw bad('The institution has no registered Integrity Committee — register it first');
    if (!output.trainingDate) throw bad('trainingDate is required on the return form');
    if (!(Number(output.memberCount) >= 3)) throw bad('An Integrity Committee must have a minimum of three members');
    db.prepare(`INSERT INTO ic_return_forms (id, engagement_id, committee_id, training_date, member_count, has_hrm, has_legal, has_audit, topics, trainers) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), e.id, c.id, output.trainingDate, Number(output.memberCount) || null, output.hasHrm ? 1 : 0, output.hasLegal ? 1 : 0, output.hasAudit ? 1 : 0, (Array.isArray(output.topics) ? output.topics : String(output.topics || '').split('\n')).filter(Boolean).join('; '), output.trainers || null);
  }
  if (e.sop_type === 'PledgeSigning') {
    if (!output.signedCount || Number(output.signedCount) < 1) throw bad('Record the number of pledges signed');
    if (!output.commissionerOfOaths) throw bad('Record the Commissioner of Oaths before whom the pledges were signed');
    if (Number(output.copiesPrinted) !== 3) throw bad('Confirm that three copies per signatory were printed (individual, HR file, ZACC)');
    const today = new Date().toISOString().slice(0, 10);
    const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1);
    db.prepare(`INSERT INTO pledges (id, institution_id, title, description, expiry_date, engagement_id, ceremony_date, commissioner_of_oaths, copies_printed, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), e.institution_id, `Integrity Pledge — ${e.institution_name}`, `${output.signedCount} pledge(s) signed (individual, HR file and ZACC copies)`, expiry.toISOString().slice(0, 10), e.id, output.ceremonyDate || today, String(output.commissionerOfOaths), 3, user.sub);
  }
  db.prepare(`UPDATE engagements SET output_data = ?, compliance_level = NULL WHERE id = ?`).run(JSON.stringify(output), e.id);
  completeEngagement(e, user);
}

// ---------------------------------------------------------------- monitoring & ECMD
export function ratingFromFindings(rows: { implementation_status: string; compliance_rating?: string }[]): { level: 'Red' | 'Amber' | 'Green'; implemented: number; total: number } {
  const relevant = rows.filter((r) => r.compliance_rating !== 'Compliant');
  const total = relevant.length;
  const implemented = relevant.filter((r) => ['Implemented', 'Verified'].includes(r.implementation_status)).length;
  const level = total === 0 || implemented === total ? 'Green' : implemented === 0 ? 'Red' : 'Amber';
  return { level, implemented, total };
}

export function recordVisit(e: LoadedEngagement, user: Actor, body: { visitDate?: string; summary?: string; updates?: { findingId: string; status: string; note?: string }[] }) {
  if (!['Completed', 'Monitoring'].includes(e.status)) throw bad('Monitoring visits start once the engagement is completed');
  const valid = ['Open', 'InProgress', 'Implemented', 'Verified', 'NotImplemented'];
  (body.updates || []).forEach((u) => {
    if (!valid.includes(u.status)) throw bad(`Invalid implementation status ${u.status}`);
    const f = e.findings.find((x: any) => x.id === u.findingId);
    if (!f) throw bad('Unknown finding');
    db.prepare(`UPDATE engagement_findings SET implementation_status = ?, verified_at = CASE WHEN ? = 'Verified' THEN datetime('now') ELSE verified_at END WHERE id = ?`).run(u.status, u.status, u.findingId);
    if (f.recommendation_id) {
      const rs = u.status === 'Verified' ? 'Closed' : u.status === 'Implemented' ? 'ResponseSubmitted' : u.status === 'NotImplemented' ? 'Incomplete' : 'Assigned';
      db.prepare(`UPDATE recommendations SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(rs, f.recommendation_id);
    }
  });
  const fresh = db.prepare(`SELECT implementation_status, compliance_rating FROM engagement_findings WHERE engagement_id = ?`).all(e.id) as any[];
  const r = ratingFromFindings(fresh);
  db.prepare(`INSERT INTO monitoring_visits (id, engagement_id, notice_sent_at, visit_date, summary, implemented_count, total_count, overall_level, recorded_by) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), e.id, null, body.visitDate || new Date().toISOString().slice(0, 10), body.summary || null, r.implemented, r.total, r.level, user.sub);
  db.prepare(`UPDATE engagements SET status = 'Monitoring', updated_at = datetime('now') WHERE id = ?`).run(e.id);
  if (e.status !== 'Monitoring') setStatus(e, 'Monitoring', user, 'First monitoring visit recorded');
  writeAudit({ userId: user.sub, action: 'MONITORING_VISIT', entityType: 'engagement', entityId: e.id, details: r });
  return r;
}

export function sendMonitoringNotice(e: any, user: Actor) {
  if (!['Completed', 'Monitoring'].includes(e.status)) throw bad('Monitoring notices are sent after completion');
  db.prepare(`INSERT INTO monitoring_visits (id, engagement_id, notice_sent_at, recorded_by) VALUES (?,?,datetime('now'),?)`).run(uuid(), e.id, user.sub);
  const fps = db.prepare(`SELECT id FROM users WHERE institution_id = ? AND role = 'INSTITUTION_FOCAL_PERSON' AND is_active = 1`).all(e.institution_id) as any[];
  fps.forEach((u) => notifyUser(u.id, 'ENGAGEMENT_MONITORING_NOTICE', { reference: e.reference, title: e.title, institutionName: e.institution_name || '' }, 'engagement', e.id));
}

export function issueCertificate(e: LoadedEngagement, user: Actor) {
  const sop = SOPS[e.sop_type as keyof typeof SOPS];
  if (!sop.hasMonitoring) throw bad('Certificates are issued for compliance and systems engagements only');
  if (!['Completed', 'Monitoring'].includes(e.status)) throw bad('Engagement not yet completed');
  const r = ratingFromFindings(e.findings);
  if (r.level !== 'Green') throw bad('A Certificate of Compliance requires full compliance (Green): all recommendations implemented');
  if (e.certificate && e.certificate.status === 'Active' && new Date(e.certificate.valid_until) > new Date()) throw bad('An active certificate already exists');
  const year = new Date().getFullYear();
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM compliance_certificates WHERE certificate_no LIKE ?`).get(`ZACC/COC/${year}/%`) as any).n + 1;
  const no = `ZACC/COC/${year}/${String(n).padStart(3, '0')}`;
  const until = new Date(); until.setFullYear(until.getFullYear() + 1);
  db.prepare(`INSERT INTO compliance_certificates (id, certificate_no, institution_id, engagement_id, valid_until, issued_by) VALUES (?,?,?,?,?,?)`)
    .run(uuid(), no, e.institution_id, e.id, until.toISOString().slice(0, 10), user.sub);
  db.prepare(`UPDATE engagements SET status = 'Closed', updated_at = datetime('now') WHERE id = ?`).run(e.id);
  setStatus(e, 'Closed', user, `Certificate ${no} issued`);
  writeAudit({ userId: user.sub, action: 'CERTIFICATE_ISSUED', entityType: 'engagement', entityId: e.id, details: { no } });
  return no;
}

export function suggestRegulatorMeasures(level: string) {
  return level === 'Red' ? ['LimitedDevolutionFunds', 'SuspendGovtContracts', 'SuspendTaxHolidays', 'StockExchangeDelisting'] : level === 'Amber' ? ['LimitedDevolutionFunds'] : [];
}

export function recordTransitionPublic(id: string, from: string | null, to: string, userId: string | null, reason?: string) {
  recordTransition({ entityType: 'engagement', entityId: id, fromState: from, toState: to, actorUserId: userId, reason });
}
