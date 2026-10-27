import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { writeAudit } from '../utils/audit';
import { getHistory } from '../utils/workflow';
import { toCsv } from '../utils/csv';
import { suggestFromAllegations, MANDATE_TEXT, roadKm } from '../utils/checkTemplates';
import { SOPS, SOP_TYPES, STEPS, RED_FLAGS, COMPLIANCE_CHECKLIST, LEGAL_REFERENCES, SopType } from '../engagement/sop';
import * as eng from '../engagement/engine';
import { HttpError, loadEngagement, canView, canEdit, CREATOR_ROLES, listify, Actor } from '../engagement/engine';
import { buildDocument, DOC_KINDS } from '../docs/builders';
import { buildCertificatePdf } from '../docs/certificate';

const router = Router();
router.use(authenticate);

const me = (req: Request) => req.user as unknown as Actor;
const bad = (m: string) => new HttpError(400, m);
const ORIGINS = ['PublicComplaint', 'MediaReport', 'AuditReport', 'DepartmentReferral', 'InstitutionInvitation', 'RoutineProgramme', 'PreviousFindings', 'ManagementDirective', 'NationalPriority', 'Other'];

function mustLoad(id: string) {
  const e = loadEngagement(id);
  if (!e) throw new HttpError(404, 'Engagement not found');
  return e;
}
function mustView(req: Request) {
  const e = mustLoad(req.params.id);
  if (!canView(me(req), e)) throw new HttpError(403, 'Forbidden');
  return e;
}
function mustEdit(req: Request, statuses: string[], what = 'edited') {
  const e = mustView(req);
  if (!canEdit(me(req), e)) throw new HttpError(403, 'Only the engagement team, the Manager or an administrator can change this engagement');
  if (!statuses.includes(e.status)) throw bad(`This can only be ${what} while the engagement is ${statuses.join(' / ')} (currently ${e.status})`);
  return e;
}
const touch = (id: string) => db.prepare(`UPDATE engagements SET updated_at = datetime('now') WHERE id = ?`).run(id);
const numOr = (v: any, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Institution users get a redacted view: no budget, steps, internal notes. */
function clientView(e: any) {
  return {
    id: e.id, reference: e.reference, sop: e.sop, title: e.title, institution_name: e.institution_name, status: e.status, method: e.method, scope_kind: e.scope_kind,
    objectives: e.objectives, methodology: e.methodology, scope_text: e.scope_text, start_date: e.start_date, end_date: e.end_date, notification_ref: e.notification_ref,
    im_status: e.im_status, im_client_signatory: e.im_client_signatory, compliance_level: e.compliance_level, conclusion: e.conclusion,
    documents: e.documents, meetings: e.meetings,
    findings: ['IMReview', 'ReportDraft', 'ReportReview', 'Committee', 'Commission', 'Completed', 'Monitoring', 'Closed'].includes(e.status)
      ? e.findings.map((f: any) => ({ id: f.id, seq: f.seq, issue: f.issue, finding_points: f.finding_points, recommendation: f.recommendation, responsibility: f.responsibility, time_frame: f.time_frame, client_response: f.client_response, implementation_status: f.implementation_status, compliance_rating: f.compliance_rating })) : [],
    certificate: e.certificate, readOnly: true,
  };
}

// ------------------------------------------------------------------ reference data
router.get('/meta', asyncHandler(async (_req, res) => {
  res.json({
    sops: SOP_TYPES.map((t) => { const s = SOPS[t]; return { type: t, label: s.label, sopRef: s.sopRef, triggers: s.triggers, outputs: s.outputs, hasIM: s.hasIM, hasReport: s.hasReport, hasMonitoring: s.hasMonitoring, needsMethod: s.needsMethod, minWorkingDays: s.minWorkingDays, documentsToRequest: s.documentsToRequest, evaluation: s.evaluation, teamMin: s.teamMin }; }),
    steps: Object.values(STEPS).map((s) => ({ key: s.key, label: s.label, role: s.role, slaDays: s.slaDays })),
    origins: ORIGINS, redFlags: RED_FLAGS, checklist: COMPLIANCE_CHECKLIST, mandate: MANDATE_TEXT,
    legalReferences: db.prepare(`SELECT * FROM legal_references ORDER BY instrument, provision`).all(),
    docKinds: DOC_KINDS,
  });
}));
void LEGAL_REFERENCES;

router.post('/suggest', requireRole(...CREATOR_ROLES), asyncHandler(async (req, res) => {
  const { allegations, checkType, sopType } = req.body || {};
  const s = suggestFromAllegations(listify(allegations), { checkType });
  const sop = SOPS[(sopType as SopType) || 'ComplianceAssessment'];
  res.json({ mandate: MANDATE_TEXT, ...s, objectives: [...(listify(allegations).length ? [] : sop.defaultObjectives.slice(0, 1)), ...s.objectives], defaultOutcomes: sop.defaultOutcomes });
}));

router.get('/distance', asyncHandler(async (req, res) => {
  const v = ['lat1', 'lng1', 'lat2', 'lng2'].map((k) => Number((req.query as any)[k]));
  if (v.some((n) => Number.isNaN(n))) return res.status(400).json({ error: 'lat1,lng1,lat2,lng2 required' });
  res.json({ km: roadKm(v[0], v[1], v[2], v[3]) });
}));

// ------------------------------------------------------------------ list / create / read
router.get('/', asyncHandler(async (req, res) => {
  const u = me(req);
  const { status, institutionId, sopType, awaitingMe, mine, overdue } = req.query as Record<string, string>;
  let sql = `SELECT e.id, e.reference, e.sop_type, e.method, e.scope_kind, e.title, e.status, e.current_step, e.step_due_at, e.escalated, e.start_date, e.end_date, e.compliance_level,
      e.im_status, e.monitoring_due_at, e.institution_id, i.name AS institution_name, i.province, e.created_by,
      (SELECT COUNT(*) FROM engagement_findings f WHERE f.engagement_id = e.id) AS finding_count,
      (SELECT COALESCE(SUM(quantity*unit_cost*persons*days),0) FROM engagement_budget_lines b WHERE b.engagement_id = e.id) AS budget_total
      FROM engagements e JOIN institutions i ON i.id = e.institution_id WHERE 1=1`;
  const p: any[] = [];
  if (['INSTITUTION_FOCAL_PERSON', 'INTEGRITY_COMMITTEE_CHAIR'].includes(u.role)) {
    sql += ` AND e.institution_id = ? AND e.status IN ('Notified','Fieldwork','IMReview','ReportDraft','ReportReview','Committee','Commission','Completed','Monitoring','Closed')`;
    p.push(u.institutionId || '');
  } else if (u.role === 'PROVINCIAL_HEAD') {
    const prov = (db.prepare(`SELECT province FROM users WHERE id = ?`).get(u.sub) as any)?.province;
    if (prov) { sql += ` AND i.province = ?`; p.push(prov); }
  }
  if (status) { sql += ` AND e.status = ?`; p.push(status); }
  if (institutionId) { sql += ` AND e.institution_id = ?`; p.push(institutionId); }
  if (sopType) { sql += ` AND e.sop_type = ?`; p.push(sopType); }
  if (mine === 'true') { sql += ` AND (e.created_by = ? OR EXISTS (SELECT 1 FROM engagement_team t WHERE t.engagement_id = e.id AND t.user_id = ?))`; p.push(u.sub, u.sub); }
  if (awaitingMe === 'true') {
    const steps = Object.values(STEPS).filter((s) => s.role === u.role).map((s) => s.key);
    const tlClause = `(e.current_step = 'TeamLeader' AND EXISTS (SELECT 1 FROM engagement_team t WHERE t.engagement_id = e.id AND t.user_id = ? AND t.team_role = 'TeamLeader'))`;
    if (u.role === 'SUPER_ADMIN') sql += ` AND e.current_step IS NOT NULL`;
    else { sql += ` AND (${steps.length ? `e.current_step IN (${steps.map(() => '?').join(',')}) OR ` : ''}${tlClause})`; p.push(...steps, u.sub); }
  }
  if (overdue === 'true') sql += ` AND e.step_due_at IS NOT NULL AND e.step_due_at < datetime('now')`;
  sql += ` ORDER BY e.updated_at DESC LIMIT 500`;
  res.json(db.prepare(sql).all(...p));
}));

router.post('/', requireRole(...CREATOR_ROLES), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const u = me(req);
  if (!SOP_TYPES.includes(b.sopType)) throw bad(`sopType must be one of ${SOP_TYPES.join(', ')}`);
  if (!b.institutionId || !b.title) throw bad('institutionId and title are required');
  if (!db.prepare(`SELECT 1 FROM institutions WHERE id = ?`).get(b.institutionId)) throw new HttpError(404, 'Institution not found');
  const origin = ORIGINS.includes(b.originSource) ? b.originSource : 'RoutineProgramme';
  const sop = SOPS[b.sopType as SopType];
  const allegations = listify(b.allegations);
  const id = uuid();
  const ref = eng.nextReference();
  db.prepare(`INSERT INTO engagements (id, reference, sop_type, scope_kind, institution_id, programme_id, title, origin_source, origin_detail, location_type, background, rationale, scope_text, allegations, objectives, methodology, expected_outcomes, start_date, end_date, days, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, ref, b.sopType, ['SpotCheck', 'DeskCheck', 'Comprehensive'].includes(b.scopeKind) ? b.scopeKind : null, b.institutionId, b.programmeId || null, b.title, origin, b.originDetail || null,
      b.locationType === 'Provincial' ? 'Provincial' : 'HQ', b.background || null, b.rationale || null, b.scopeText || null, JSON.stringify(allegations), JSON.stringify(listify(b.objectives)), JSON.stringify(listify(b.methodology)),
      JSON.stringify(listify(b.expectedOutcomes)), b.startDate || null, b.endDate || null, b.days ? Number(b.days) : null, u.sub);
  const team: any[] = Array.isArray(b.team) && b.team.length ? b.team : [{ userId: u.sub, name: u.name, role: 'FocalPerson' }];
  const insT = db.prepare(`INSERT INTO engagement_team (id, engagement_id, user_id, name, team_role) VALUES (?,?,?,?,?)`);
  team.forEach((t) => insT.run(uuid(), id, t.userId || null, String(t.name || 'Officer'), ['TeamLeader', 'FocalPerson', 'Member'].includes(t.role) ? t.role : 'Member'));
  eng.recordTransitionPublic(id, null, 'Preliminary', u.sub);
  writeAudit({ userId: u.sub, action: 'ENGAGEMENT_CREATED', entityType: 'engagement', entityId: id, details: { sopType: b.sopType, minWorkingDays: sop.minWorkingDays } });
  res.status(201).json(mustLoad(id));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const e = mustView(req);
  if (['INSTITUTION_FOCAL_PERSON', 'INTEGRITY_COMMITTEE_CHAIR'].includes(me(req).role)) return res.json(clientView(e));
  res.json({ ...e, history: getHistory('engagement', e.id), mandate: MANDATE_TEXT, canEdit: canEdit(me(req), e) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Preliminary', 'ConceptDraft']);
  if (e.status === 'Preliminary' && e.current_step) throw bad('Preliminary assessment is under review');
  const b = req.body || {};
  const val = (k: string, cur: any) => (b[k] !== undefined ? b[k] : cur);
  db.prepare(`UPDATE engagements SET title=?, scope_kind=?, origin_source=?, origin_detail=?, location_type=?, background=?, rationale=?, scope_text=?, allegations=?, objectives=?, methodology=?, expected_outcomes=?, start_date=?, end_date=?, days=?, updated_at=datetime('now') WHERE id=?`)
    .run(val('title', e.title), val('scopeKind', e.scope_kind), ORIGINS.includes(b.originSource) ? b.originSource : e.origin_source, val('originDetail', e.origin_detail), b.locationType === 'Provincial' ? 'Provincial' : b.locationType === 'HQ' ? 'HQ' : e.location_type,
      val('background', e.background), val('rationale', e.rationale), val('scopeText', e.scope_text),
      JSON.stringify(b.allegations !== undefined ? listify(b.allegations) : e.allegations), JSON.stringify(b.objectives !== undefined ? listify(b.objectives) : e.objectives),
      JSON.stringify(b.methodology !== undefined ? listify(b.methodology) : e.methodology), JSON.stringify(b.expectedOutcomes !== undefined ? listify(b.expectedOutcomes) : e.expected_outcomes),
      val('startDate', e.start_date), val('endDate', e.end_date), b.days !== undefined ? (b.days ? Number(b.days) : null) : e.days, e.id);
  writeAudit({ userId: me(req).sub, action: 'ENGAGEMENT_UPDATED', entityType: 'engagement', entityId: e.id });
  res.json(mustLoad(e.id));
}));

router.put('/:id/team', asyncHandler(async (req, res) => {
  const e = mustView(req);
  const u = me(req);
  if (!['MANAGER_COMPLIANCE', 'SUPER_ADMIN'].includes(u.role) && !(e.created_by === u.sub && ['Preliminary', 'ConceptDraft'].includes(e.status)))
    throw new HttpError(403, 'The Manager allocates the team, team leader and focal person');
  if (['Completed', 'Closed', 'Cancelled', 'Rejected'].includes(e.status)) throw bad('Team is locked');
  const team: any[] = Array.isArray(req.body?.team) ? req.body.team : [];
  if (team.filter((t) => t.role === 'TeamLeader').length > 1 || team.filter((t) => t.role === 'FocalPerson').length > 1) throw bad('Only one Team Leader and one Focal Person are allowed');
  db.prepare(`DELETE FROM engagement_team WHERE engagement_id = ?`).run(e.id);
  const ins = db.prepare(`INSERT INTO engagement_team (id, engagement_id, user_id, name, team_role) VALUES (?,?,?,?,?)`);
  team.forEach((t) => {
    let name = String(t.name || '').trim();
    if (t.userId) { const usr = db.prepare(`SELECT name FROM users WHERE id = ? AND is_active = 1`).get(t.userId) as any; if (!usr) throw bad('Unknown team user'); name = usr.name; }
    if (!name) throw bad('Each team member needs a name');
    ins.run(uuid(), e.id, t.userId || null, name, ['TeamLeader', 'FocalPerson', 'Member'].includes(t.role) ? t.role : 'Member');
  });
  touch(e.id);
  res.json(mustLoad(e.id));
}));

// ------------------------------------------------------------------ concept note helpers
router.post('/:id/draft-concept', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['ConceptDraft', 'Preliminary']);
  const sop = SOPS[e.sop_type as SopType];
  const s = suggestFromAllegations(e.allegations, { checkType: e.scope_kind === 'DeskCheck' ? 'DeskCheck' : undefined });
  const objectives = e.allegations.length ? s.objectives : [...sop.defaultObjectives];
  const methodology = e.allegations.length ? [...s.methodology, ...sop.defaultMethodology.filter((m) => !s.methodology.includes(m))] : [...sop.defaultMethodology];
  db.prepare(`UPDATE engagements SET background = COALESCE(NULLIF(background,''), ?), objectives = ?, methodology = ?, expected_outcomes = ?, scope_text = COALESCE(NULLIF(scope_text,''), ?), updated_at = datetime('now') WHERE id = ?`)
    .run(MANDATE_TEXT, JSON.stringify(objectives), JSON.stringify(methodology), JSON.stringify(sop.defaultOutcomes),
      `${sop.label} at ${e.institution_name}${e.allegations.length ? `, focusing on the listed allegations` : ''}.`, e.id);
  // RFD register pre-populated from the SOP document list (only if empty)
  if (!db.prepare(`SELECT 1 FROM engagement_documents WHERE engagement_id = ?`).get(e.id)) {
    const ins = db.prepare(`INSERT INTO engagement_documents (id, engagement_id, document) VALUES (?,?,?)`);
    sop.documentsToRequest.forEach((d) => ins.run(uuid(), e.id, d));
  }
  res.json(mustLoad(e.id));
}));

router.put('/:id/budget', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Preliminary', 'ConceptDraft']);
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : null;
  if (!lines) throw bad('lines[] required');
  db.transaction(() => {
    db.prepare(`DELETE FROM engagement_budget_lines WHERE engagement_id = ?`).run(e.id);
    lines.forEach((l: any, i: number) => {
      if (!l.item) return;
      db.prepare(`INSERT INTO engagement_budget_lines (id, engagement_id, item, unit, quantity, unit_cost, persons, days, sort_order) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(uuid(), e.id, String(l.item), l.unit || null, Math.max(0, numOr(l.quantity, 0)), Math.max(0, numOr(l.unit_cost, 0)), Math.max(1, Math.round(numOr(l.persons, 1))), Math.max(1, Math.round(numOr(l.days, 1))), i);
    });
    touch(e.id);
  })();
  res.json(mustLoad(e.id));
}));

router.post('/:id/budget-template', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Preliminary', 'ConceptDraft']);
  const persons = Math.max(1, e.team.length || 1);
  const days = Math.max(1, e.days || 1);
  const nights = Math.max(0, days - 1);
  const tpl = [
    { item: 'Fuel', unit: 'litres', quantity: Math.max(0, numOr(req.body?.fuelLitres, 0)), unit_cost: 0, persons: 1, days: 1 },
    { item: 'Accommodation', unit: 'night', quantity: 1, unit_cost: 0, persons, days: nights || 1 },
    { item: 'Breakfast', unit: 'meal', quantity: 1, unit_cost: 0, persons, days },
    { item: 'Lunch', unit: 'meal', quantity: 1, unit_cost: 0, persons, days },
    { item: 'Dinner', unit: 'meal', quantity: 1, unit_cost: 0, persons, days: nights || 1 },
  ];
  db.transaction(() => {
    db.prepare(`DELETE FROM engagement_budget_lines WHERE engagement_id = ?`).run(e.id);
    tpl.forEach((l, i) => db.prepare(`INSERT INTO engagement_budget_lines (id, engagement_id, item, unit, quantity, unit_cost, persons, days, sort_order) VALUES (?,?,?,?,?,?,?,?,?)`).run(uuid(), e.id, l.item, l.unit, l.quantity, l.unit_cost, l.persons, l.days, i));
  })();
  res.json(mustLoad(e.id));
}));

const ACT_TYPES = ['Travel', 'EntranceMeeting', 'Interview', 'Verification', 'DocumentAnalysis', 'ReportWriting', 'ExitMeeting', 'Training', 'Signing', 'Other'];
router.put('/:id/itinerary', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Preliminary', 'ConceptDraft', 'Notified', 'Fieldwork']);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) throw bad('rows[] required');
  db.transaction(() => {
    db.prepare(`DELETE FROM engagement_itinerary WHERE engagement_id = ?`).run(e.id);
    rows.forEach((r: any, i: number) => {
      if (!r.activity) return;
      db.prepare(`INSERT INTO engagement_itinerary (id, engagement_id, day_no, activity_date, location, activity, activity_type, distance_km, latitude, longitude, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(uuid(), e.id, Math.max(1, Math.round(numOr(r.day_no, 1))), r.activity_date || null, r.location || null, String(r.activity), ACT_TYPES.includes(r.activity_type) ? r.activity_type : 'Other',
          r.distance_km === '' || r.distance_km == null ? null : numOr(r.distance_km, 0), r.latitude ?? null, r.longitude ?? null, i);
    });
    touch(e.id);
  })();
  res.json(mustLoad(e.id));
}));

// ------------------------------------------------------------------ workflow actions
router.post('/:id/preliminary', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Preliminary']);
  eng.submitPreliminary(e, me(req), req.body || {});
  res.json(mustLoad(e.id));
}));
router.post('/:id/submit-concept', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['ConceptDraft']);
  eng.submitConcept(e, me(req));
  res.json(mustLoad(e.id));
}));
router.post('/:id/decision', asyncHandler(async (req, res) => {
  const e = mustView(req);
  const { decision, comment, method, deploymentJustified } = req.body || {};
  eng.decide(e, me(req), decision, comment, { method, deploymentJustified });
  res.json(mustLoad(e.id));
}));
router.post('/:id/notification', requireRole('EXECUTIVE_SECRETARY', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const e = mustView(req);
  eng.issueNotification(e, me(req));
  res.json(mustLoad(e.id));
}));
router.post('/:id/start', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Notified']);
  eng.startFieldwork(e, me(req));
  res.json(mustLoad(e.id));
}));
router.post('/:id/cancel', requireRole('MANAGER_COMPLIANCE', 'GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const e = mustView(req);
  if (['Completed', 'Closed', 'Cancelled', 'Monitoring'].includes(e.status)) throw bad(`Cannot cancel an engagement that is ${e.status}`);
  if (!req.body?.reason) throw bad('A reason is required');
  db.prepare(`UPDATE engagements SET status='Cancelled', current_step=NULL, step_due_at=NULL, updated_at=datetime('now') WHERE id=?`).run(e.id);
  eng.recordTransitionPublic(e.id, e.status, 'Cancelled', me(req).sub, req.body.reason);
  writeAudit({ userId: me(req).sub, action: 'ENGAGEMENT_CANCELLED', entityType: 'engagement', entityId: e.id });
  res.json(mustLoad(e.id));
}));

// ------------------------------------------------------------------ fieldwork records
const FIELD_STATES = ['Notified', 'Fieldwork'];
router.post('/:id/documents', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['ConceptDraft', ...FIELD_STATES]);
  if (!req.body?.document) throw bad('document is required');
  db.prepare(`INSERT INTO engagement_documents (id, engagement_id, document, due_date, notes) VALUES (?,?,?,?,?)`).run(uuid(), e.id, String(req.body.document), req.body.dueDate || null, req.body.notes || null);
  res.status(201).json(mustLoad(e.id).documents);
}));
router.put('/:id/documents/:docId', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['ConceptDraft', ...FIELD_STATES]);
  const st = req.body?.status;
  if (!['Requested', 'Received', 'Outstanding', 'NotAvailable'].includes(st)) throw bad('invalid status');
  const r = db.prepare(`UPDATE engagement_documents SET status = ?, received_at = CASE WHEN ? = 'Received' THEN datetime('now') ELSE received_at END, notes = COALESCE(?, notes) WHERE id = ? AND engagement_id = ?`).run(st, st, req.body.notes ?? null, req.params.docId, e.id);
  if (!r.changes) throw new HttpError(404, 'Document request not found');
  res.json(mustLoad(e.id).documents);
}));
router.delete('/:id/documents/:docId', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['ConceptDraft', ...FIELD_STATES]);
  db.prepare(`DELETE FROM engagement_documents WHERE id = ? AND engagement_id = ?`).run(req.params.docId, e.id);
  res.json(mustLoad(e.id).documents);
}));
router.post('/:id/meetings', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Fieldwork']);
  const b = req.body || {};
  if (!['Entrance', 'Exit'].includes(b.kind)) throw bad('kind must be Entrance or Exit');
  if (!b.summary) throw bad('summary is required');
  db.prepare(`INSERT INTO engagement_meetings (id, engagement_id, kind, held_at, attendees, summary, focal_person_designated) VALUES (?,?,?,?,?,?,?)`)
    .run(uuid(), e.id, b.kind, b.heldAt || new Date().toISOString().slice(0, 10), b.attendees || null, b.summary, b.focalPerson || null);
  res.status(201).json(mustLoad(e.id).meetings);
}));
router.post('/:id/interviews', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Fieldwork']);
  const b = req.body || {};
  if (!b.interviewee || !b.minutes) throw bad('interviewee and minutes are required (the Team Leader keeps minutes of every interview)');
  db.prepare(`INSERT INTO engagement_interviews (id, engagement_id, interviewee, position, interview_date, minutes, recorded_by) VALUES (?,?,?,?,?,?,?)`)
    .run(uuid(), e.id, b.interviewee, b.position || null, b.date || new Date().toISOString().slice(0, 10), b.minutes, me(req).sub);
  res.status(201).json(mustLoad(e.id).interviews);
}));

router.put('/:id/findings', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Fieldwork']);
  const rows = Array.isArray(req.body?.findings) ? req.body.findings : null;
  if (!rows) throw bad('findings[] required');
  const sev = ['Low', 'Medium', 'High', 'Critical'];
  const rate = ['Compliant', 'PartiallyCompliant', 'NonCompliant'];
  db.transaction(() => {
    const keep = new Set<string>();
    rows.forEach((f: any, i: number) => {
      if (!f.issue) return;
      const pts = JSON.stringify(listify(f.finding_points ?? f.points));
      const args = [String(f.issue), pts, f.legal_reference || null, f.category || null, sev.includes(f.severity) ? f.severity : 'Medium', rate.includes(f.compliance_rating) ? f.compliance_rating : 'NonCompliant',
        f.recommendation || null, f.responsibility || null, f.time_frame || 'Immediate', f.due_date || null, f.referred_to_investigations ? 1 : 0];
      const existing = f.id ? db.prepare(`SELECT id FROM engagement_findings WHERE id = ? AND engagement_id = ?`).get(f.id, e.id) : null;
      if (existing) {
        db.prepare(`UPDATE engagement_findings SET seq=?, issue=?, finding_points=?, legal_reference=?, category=?, severity=?, compliance_rating=?, recommendation=?, responsibility=?, time_frame=?, due_date=?, referred_to_investigations=? WHERE id=?`).run(i + 1, ...args, f.id);
        keep.add(f.id);
      } else {
        const id = uuid();
        db.prepare(`INSERT INTO engagement_findings (id, engagement_id, seq, issue, finding_points, legal_reference, category, severity, compliance_rating, recommendation, responsibility, time_frame, due_date, referred_to_investigations) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, e.id, i + 1, ...args);
        keep.add(id);
      }
    });
    const all = db.prepare(`SELECT id FROM engagement_findings WHERE engagement_id = ?`).all(e.id) as any[];
    all.forEach((r) => { if (!keep.has(r.id)) db.prepare(`DELETE FROM engagement_findings WHERE id = ?`).run(r.id); });
    touch(e.id);
  })();
  res.json(mustLoad(e.id).findings);
}));

// Additive single-finding capture (used by offline field capture so queued items never overwrite the whole matrix)
router.post('/:id/findings/add', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Fieldwork']);
  const f = req.body || {};
  if (!f.issue) throw bad('issue is required');
  const sev = ['Low', 'Medium', 'High', 'Critical'];
  const rate = ['Compliant', 'PartiallyCompliant', 'NonCompliant'];
  const seq = ((db.prepare(`SELECT COALESCE(MAX(seq),0) AS m FROM engagement_findings WHERE engagement_id = ?`).get(e.id) as any).m || 0) + 1;
  const id = uuid();
  db.prepare(`INSERT INTO engagement_findings (id, engagement_id, seq, issue, finding_points, legal_reference, category, severity, compliance_rating, recommendation, responsibility, time_frame, due_date, referred_to_investigations) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, e.id, seq, String(f.issue), JSON.stringify(listify(f.finding_points ?? f.points)), f.legal_reference || null, f.category || null, sev.includes(f.severity) ? f.severity : 'Medium',
      rate.includes(f.compliance_rating) ? f.compliance_rating : 'NonCompliant', f.recommendation || null, f.responsibility || null, f.time_frame || 'Immediate', f.due_date || null, f.referred_to_investigations ? 1 : 0);
  touch(e.id);
  res.status(201).json({ id, seq });
}));

// Institution (client) comments on the draft Implementation Matrix
router.put('/:id/findings/:fid/client-response', asyncHandler(async (req, res) => {
  const e = mustView(req);
  const u = me(req);
  const isClient = ['INSTITUTION_FOCAL_PERSON'].includes(u.role) && u.institutionId === e.institution_id;
  if (!isClient && !canEdit(u, e)) throw new HttpError(403, 'Forbidden');
  if (e.status !== 'IMReview' || !['ClientReview', 'Draft'].includes(e.im_status)) throw bad('Client comments are accepted while the draft Implementation Matrix is under review');
  const r = db.prepare(`UPDATE engagement_findings SET client_response = ? WHERE id = ? AND engagement_id = ?`).run(String(req.body?.response || '').slice(0, 2000), req.params.fid, e.id);
  if (!r.changes) throw new HttpError(404, 'Finding not found');
  res.json({ ok: true });
}));

router.post('/:id/conclude', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Fieldwork']);
  eng.concludeFieldwork(e, me(req));
  res.json(mustLoad(e.id));
}));
router.post('/:id/report/submit', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['ReportDraft']);
  eng.submitReport(e, me(req), req.body || {});
  res.json(mustLoad(e.id));
}));
router.post('/:id/im/sign', asyncHandler(async (req, res) => {
  const e = mustView(req);
  if (!canEdit(me(req), e) && !['GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'COMMISSION_CHAIR'].includes(me(req).role)) throw new HttpError(403, 'Forbidden');
  eng.signIM(e, me(req), req.body?.signatory);
  res.json(mustLoad(e.id));
}));
router.post('/:id/complete-simple', asyncHandler(async (req, res) => {
  const e = mustEdit(req, ['Fieldwork']);
  eng.completeSimple(e, me(req), req.body || {});
  res.json(mustLoad(e.id));
}));

// ------------------------------------------------------------------ monitoring & certificates
router.post('/:id/monitoring/notice', requireRole('MANAGER_COMPLIANCE', 'GM_PREVENTION', 'COMMISSION_CHAIR', 'EXECUTIVE_SECRETARY', 'MONITORING_OFFICER', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const e = mustView(req);
  eng.sendMonitoringNotice(e, me(req));
  res.json(mustLoad(e.id).visits);
}));
router.post('/:id/monitoring/visit', requireRole('MANAGER_COMPLIANCE', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const e = mustView(req);
  const r = eng.recordVisit(e, me(req), req.body || {});
  res.json({ ...r, engagement: mustLoad(e.id) });
}));
router.post('/:id/certificate', requireRole('GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const e = mustView(req);
  const no = eng.issueCertificate(e, me(req));
  res.json({ certificateNo: no, engagement: mustLoad(e.id) });
}));
router.post('/:id/regulator-notices', requireRole('GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'MANAGER_COMPLIANCE', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const e = mustView(req);
  const { measure, regulator, notes } = req.body || {};
  if (!['LimitedDevolutionFunds', 'SuspendGovtContracts', 'SuspendTaxHolidays', 'StockExchangeDelisting', 'Other'].includes(measure)) throw bad('invalid measure');
  if (eng.ratingFromFindings(e.findings).level === 'Green') throw bad('Punitive measures apply to non-compliant institutions only');
  db.prepare(`INSERT INTO regulator_notices (id, institution_id, engagement_id, measure, regulator, notes, created_by) VALUES (?,?,?,?,?,?,?)`).run(uuid(), e.institution_id, e.id, measure, regulator || null, notes || null, me(req).sub);
  writeAudit({ userId: me(req).sub, action: 'REGULATOR_NOTICE_PROPOSED', entityType: 'engagement', entityId: e.id, details: { measure } });
  res.status(201).json(mustLoad(e.id).regulatorNotices);
}));

// ------------------------------------------------------------------ exports & generated documents
router.get('/:id/matrix.csv', asyncHandler(async (req, res) => {
  const e = mustView(req);
  const rows = e.findings.map((f: any) => ({ No: f.seq, Issue: f.issue, Finding: f.finding_points.join(' | '), Recommendation: f.recommendation || '', Responsibility: f.responsibility || '', 'Time frame': f.time_frame, Rating: f.compliance_rating, Status: f.implementation_status }));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="Implementation_Matrix_${e.reference.replace(/\//g, '-')}.csv"`);
  res.send(toCsv(rows));
}));

router.get('/:id/docs/:kind', asyncHandler(async (req: Request, res: Response) => {
  const e = mustView(req);
  if (['INSTITUTION_FOCAL_PERSON', 'INTEGRITY_COMMITTEE_CHAIR'].includes(me(req).role) && !['notification-letter', 'matrix'].includes(req.params.kind)) throw new HttpError(403, 'Forbidden');
  if (req.params.kind === 'certificate') {
    if (!e.certificate) throw new HttpError(404, 'No certificate has been issued');
    const buf = await buildCertificatePdf(e.certificate.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Certificate_${e.certificate.certificate_no.replace(/\//g, '-')}.pdf"`);
    return res.send(buf);
  }
  const doc = await buildDocument(req.params.kind, e);
  if (!doc) throw new HttpError(404, 'Unknown or unavailable document');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
  res.send(doc.buffer);
}));

export default router;
