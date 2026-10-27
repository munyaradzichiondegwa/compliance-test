import { Packer } from 'docx';
import { AlignmentType, centreTitle, h, letterhead, makeDoc, money, numbered, p, sigBlock, t, table, Paragraph, Table } from './layout';
import { LoadedEngagement } from '../engagement/engine';
import { SOPS, SopType } from '../engagement/sop';
import { MANDATE_TEXT } from '../utils/checkTemplates';

export const DOC_KINDS = [
  { kind: 'concept-note', label: 'Concept Note' },
  { kind: 'memorandum', label: 'Memorandum and Itinerary' },
  { kind: 'notification-letter', label: 'Notification Letter' },
  { kind: 'report', label: 'Report' },
  { kind: 'matrix', label: 'Implementation Matrix' },
  { kind: 'monitoring-notice', label: 'Monitoring Notice (3 months)' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function longDate(d?: string | Date | null) {
  if (!d) return '.........................';
  const x = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  if (Number.isNaN(x.getTime())) return String(d);
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}
export function dateRange(a?: string | null, b?: string | null) {
  if (!a) return '';
  if (!b || a === b) return longDate(a).toUpperCase();
  const x = new Date(`${a}T00:00:00`), y = new Date(`${b}T00:00:00`);
  if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return `${x.getDate()}-${y.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`.toUpperCase();
  return `${longDate(a)} to ${longDate(b)}`.toUpperCase();
}
const NUMWORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numWord = (n: number) => (n <= 10 ? `${NUMWORD[n]} (${n})` : String(n));

function approver(e: LoadedEngagement, flow: string, step: string) {
  const s = [...e.steps].reverse().find((x: any) => x.flow === flow && x.step === step && ['Approved', 'Recommended'].includes(x.decision)) as any;
  // Approvers are identified by position only (no personal names on ZACC letters and memoranda).
  return s ? { name: undefined as string | undefined, date: longDate(String(s.created_at).slice(0, 10)) } : null;
}
const teamOf = (e: LoadedEngagement, role: string) => (e.team.find((x: any) => x.team_role === role) as any)?.name as string | undefined;
const kindTitle = (e: LoadedEngagement) => {
  const sk = { SpotCheck: 'COMPLIANCE SPOT CHECK', DeskCheck: 'DESK COMPLIANCE CHECK', Comprehensive: 'COMPREHENSIVE COMPLIANCE CHECK' } as any;
  if (e.sop_type === 'ComplianceAssessment') return e.method === 'RFD' && !e.scope_kind ? 'DESK COMPLIANCE CHECK' : (sk[e.scope_kind] || 'COMPLIANCE ASSESSMENT');
  return SOPS[e.sop_type as SopType].label.toUpperCase();
};
const budgetRows = (e: LoadedEngagement) => e.budget.map((b: any) => [b.item, b.unit || '', String(b.quantity), b.unit_cost.toFixed(2), String(b.persons), String(b.days), b.total.toFixed(2)]);
const budgetTable = (e: LoadedEngagement) => table([2400, 1100, 900, 1200, 1000, 800, 1400], ['Item', 'Unit', 'Qty', 'Unit cost (USD)', 'Persons', 'Days', 'Total (USD)'], [...budgetRows(e), ['TOTAL', '', '', '', '', '', e.budgetTotal.toFixed(2)]], { boldLast: true });

function conceptBody(e: LoadedEngagement): (Paragraph | Table)[] {
  const sop = SOPS[e.sop_type as SopType];
  const out: (Paragraph | Table)[] = [];
  let n = 1;
  out.push(h(`${n++}. Background`));
  out.push(p(e.background || MANDATE_TEXT));
  if (e.allegations.length) {
    out.push(p(`It is against this background that the Unit intends to carry out a ${kindTitle(e).toLowerCase()} at ${e.institution_name}${e.origin_detail ? `. ${e.origin_detail}` : ''}.`));
    out.push(h(`${n++}. Allegations`));
    out.push(...numbered(e.allegations, 'dash'));
  } else {
    out.push(p(`It is against this background that the Unit intends to carry out a ${kindTitle(e).toLowerCase()} at ${e.institution_name}${e.origin_detail ? `. ${e.origin_detail}` : ''}.`));
    out.push(h(`${n++}. Rationale / Justification`));
    out.push(p(e.rationale || `The exercise is carried out as part of ZACC's mandate under Section 12 of the Anti-Corruption Commission Act [Chapter 9:22] to monitor and examine the practices, systems and procurement procedures of public and private institutions.`));
  }
  out.push(h(`${n++}. Objectives`));
  out.push(...numbered(e.objectives, 'alpha'));
  out.push(h(`${n++}. Scope`));
  out.push(p(e.scope_text || ''));
  out.push(h(`${n++}. Methodology`));
  out.push(...numbered(e.methodology, 'dash'));
  if (e.sop.needsMethod && e.method) out.push(p(`Assignment category determined by the General Manager: ${({ RFD: 'Request for Documents (RFD)', RR: 'Rapid Response (RR)', PCC: 'Physical Compliance Check (PCC)' } as any)[e.method]}.`));
  out.push(h(`${n++}. Team Composition`));
  out.push(table([3400, 2400], ['Name', 'Role'], e.team.map((m: any) => [m.name, ({ TeamLeader: 'Team Leader', FocalPerson: 'Focal Person', Member: 'Team Member' } as any)[m.team_role]])));
  out.push(h(`${n++}. Resource Requirements`));
  out.push(p(`Duration: ${e.days ? `${numWord(e.days)} days` : '—'} (${dateRange(e.start_date, e.end_date) || 'dates to be confirmed'}).`));
  out.push(e.budget.length ? budgetTable(e) : p('To be determined.'));
  out.push(h(`${n++}. Expected Outcomes / Output`));
  out.push(...numbered(e.expected_outcomes.length ? e.expected_outcomes : sop.outputs, 'alpha'));
  return out;
}

function conceptSignatures(e: LoadedEngagement) {
  const tl = approver(e, 'Concept', 'TeamLeader'), mg = approver(e, 'Concept', 'Manager'), gm = approver(e, 'Concept', 'GM'), es = approver(e, 'Concept', 'ExecutiveSecretary'), ph = approver(e, 'Concept', 'ProvincialHead');
  const rows: any[] = [{ title: `PREPARED BY: FOCAL PERSON${teamOf(e, 'FocalPerson') ? ` — ${teamOf(e, 'FocalPerson')}` : ''}`, date: longDate(e.created_at?.slice(0, 10)) }];
  if (ph) rows.push({ title: 'PROVINCIAL HEAD', name: ph.name, date: ph.date });
  if (tl || e.sop.type !== 'ICTraining') rows.push({ title: 'TEAM LEADER', name: tl?.name || teamOf(e, 'TeamLeader'), date: tl?.date });
  if (e.sop.type !== 'ICTraining' && e.sop.type !== 'PledgeSigning') rows.push({ title: 'MANAGER, COMPLIANCE AND SYSTEMS REVIEW', name: mg?.name, date: mg?.date });
  else rows.push({ title: 'MANAGER, COMPLIANCE AND SYSTEMS REVIEW', name: mg?.name, date: mg?.date });
  if (e.sop.type !== 'ICTraining' && e.sop.type !== 'PledgeSigning') rows.push({ options: 'RECOMMENDED / NOT RECOMMENDED', title: 'GENERAL MANAGER PREVENTION AND CORPORATE GOVERNANCE', name: gm?.name, date: gm?.date });
  rows.push({ options: 'APPROVED / NOT APPROVED', title: 'EXECUTIVE SECRETARY', name: es?.name, date: es?.date });
  return sigBlock(rows);
}

async function pack(children: (Paragraph | Table)[], filename: string, landscape = false) {
  return { filename, buffer: await Packer.toBuffer(makeDoc(children, landscape)) };
}
const slug = (e: LoadedEngagement) => e.reference.replace(/\//g, '-');

export async function buildDocument(kind: string, e: LoadedEngagement) {
  switch (kind) {
    case 'concept-note': return buildConceptNote(e);
    case 'memorandum': return buildMemorandum(e);
    case 'notification-letter': return buildNotification(e);
    case 'report': return e.sop.hasReport ? buildReport(e) : null;
    case 'matrix': return e.sop.hasIM || e.findings.length ? buildMatrix(e) : null;
    case 'monitoring-notice': return buildMonitoringNotice(e);
    default: return null;
  }
}

async function buildConceptNote(e: LoadedEngagement) {
  const title = `CONCEPT NOTE FOR ${e.institution_name.toUpperCase()} ${kindTitle(e)}`;
  const c = [...letterhead(), centreTitle(title), centreTitle(dateRange(e.start_date, e.end_date)), ...conceptBody(e), ...conceptSignatures(e)];
  return pack(c, `Concept_Note_${slug(e)}.docx`);
}

async function buildMemorandum(e: LoadedEngagement) {
  const prov = e.location_type === 'Provincial';
  const days = e.days || new Set(e.itinerary.map((r: any) => r.day_no)).size || 1;
  const c: (Paragraph | Table)[] = [...letterhead(), centreTitle('MEMORANDUM')];
  c.push(table([1400, 7500], null, [
    ['TO :', prov ? 'PROVINCIAL HEAD' : 'GENERAL MANAGER PREVENTION AND CORPORATE GOVERNANCE'],
    ['FROM :', 'COMPLIANCE AND SYSTEMS REVIEW TEAM'],
    ['DATE :', longDate(new Date())],
    ['SUBJECT :', `REQUEST FOR AUTHORITY FOR A TRIP TO CONDUCT A ${kindTitle(e)} AT ${e.institution_name.toUpperCase()}`],
  ]));
  c.push(p('The above subject is pertinent.', { before: 160 }));
  c.push(p(`A team comprising ${numWord(e.team.length)} Zimbabwe Anti-Corruption Commission officers from the Compliance and Systems Review Department intends to travel to ${e.institution_name} to carry out a ${kindTitle(e).toLowerCase()}${e.origin_detail ? `, ${e.origin_detail.charAt(0).toLowerCase()}${e.origin_detail.slice(1)}` : ''}.`));
  c.push(p(`The team is therefore requesting authority to proceed to ${e.institution_name} and requires ${numWord(days)} days to carry out the tasks (${dateRange(e.start_date, e.end_date) || 'dates to be confirmed'}).`));
  if (e.allegations.length) { c.push(h('BRIEF CIRCUMSTANCES')); c.push(...numbered(e.allegations, 'num', 0)); }
  else if (e.rationale) { c.push(h('RATIONALE')); c.push(p(e.rationale)); }
  c.push(h('ITINERARY'));
  c.push(table([700, 1500, 2200, 3800, 900], ['Day', 'Date', 'Location', 'Activity', 'km'], e.itinerary.map((r: any) => [String(r.day_no), r.activity_date ? longDate(r.activity_date) : '', r.location || '', r.activity, r.distance_km != null ? String(r.distance_km) : ''])));
  if (e.itinerary.length) c.push(p(`Total distance: ${e.itinerary.reduce((s: number, r: any) => s + (r.distance_km || 0), 0)} km.`, { before: 60, size: 20 }));
  c.push(h('BUDGET (USD)'));
  c.push(e.budget.length ? budgetTable(e) : p('To be determined.'));
  c.push(p('Your authority is hereby sought.', { before: 160 }));
  const tl = teamOf(e, 'TeamLeader'), fp = teamOf(e, 'FocalPerson');
  const mg = approver(e, 'Concept', 'Manager'), gm = approver(e, 'Concept', 'GM'), ph = approver(e, 'Concept', 'ProvincialHead');
  c.push(...sigBlock([
    { title: `TEAM LEADER${tl ? ` — ${tl}` : ''}`, date: '' },
    ...(prov ? [{ options: 'RECOMMENDED / NOT RECOMMENDED', title: 'PROVINCIAL HEAD', name: ph?.name, date: ph?.date }] : [{ title: 'MANAGER, COMPLIANCE AND SYSTEMS REVIEW', name: mg?.name, date: mg?.date }]),
    { options: 'APPROVED / NOT APPROVED', title: 'GENERAL MANAGER PREVENTION AND CORPORATE GOVERNANCE', name: gm?.name, date: gm?.date },
  ]));
  void fp;
  return pack(c, `Memorandum_and_Itinerary_${slug(e)}.docx`);
}

async function buildNotification(e: LoadedEngagement) {
  const sop = SOPS[e.sop_type as SopType];
  const es = approver(e, 'Notification', 'ExecutiveSecretary');
  const c: (Paragraph | Table)[] = [...letterhead()];
  c.push(p(`Ref: ${e.notification_ref || '..........................'}`, { align: AlignmentType.LEFT, after: 20 }));
  c.push(p(`${longDate(e.notification_signed_at?.slice(0, 10) || new Date())}`, { align: AlignmentType.LEFT, after: 160 }));
  c.push(p('The Accounting Officer / Chief Executive Officer', { align: AlignmentType.LEFT, after: 0, bold: true }));
  c.push(p(e.institution_name, { align: AlignmentType.LEFT, after: 0 }));
  c.push(p(`${e.district || ''}${e.district ? ', ' : ''}${e.province}`, { align: AlignmentType.LEFT, after: 160 }));
  c.push(p('Dear Sir / Madam', { align: AlignmentType.LEFT }));
  c.push(p(`RE: NOTIFICATION OF AN INTENDED ${sop.label.toUpperCase()} AT ${e.institution_name.toUpperCase()}`, { bold: true, align: AlignmentType.LEFT }));
  c.push(p(MANDATE_TEXT));
  c.push(p(`In terms of the Commission's ${sop.sopRef}, the Commission hereby notifies you that a team from the Compliance, Systems and Processes Review Unit will carry out a ${kindTitle(e).toLowerCase()} at your institution from ${longDate(e.start_date)} to ${longDate(e.end_date)}.`));
  c.push(h('Objectives of the exercise'));
  c.push(...numbered(e.objectives, 'alpha'));
  c.push(h('The team'));
  c.push(...numbered(e.team.map((m: any) => `${m.name} (${({ TeamLeader: 'Team Leader', FocalPerson: 'Focal Person', Member: 'Team Member' } as any)[m.team_role]})`), 'num'));
  c.push(h('Cooperation requested'));
  c.push(...numbered([
    'Designate a Liaison / Focal Officer to assist the team for the duration of the exercise.',
    'Provide a suitable working room, and make officers available for interviews, which are held separately.',
    ...(e.documents.length ? [`Avail the following documents on or before the commencement of the exercise: ${e.documents.map((d: any) => d.document).join('; ')}.`] : []),
    'Make available the Accounting Officer and senior management for an entrance meeting on the first day and an exit meeting at the end of the exercise.',
  ], 'alpha'));
  c.push(p('Your cooperation will be highly appreciated.', { before: 120 }));
  c.push(p('Yours faithfully', { align: AlignmentType.LEFT, before: 200 }));
  c.push(...sigBlock([{ title: 'EXECUTIVE SECRETARY', name: es?.name, date: es?.date }]));
  c.push(p('ZIMBABWE ANTI-CORRUPTION COMMISSION', { align: AlignmentType.LEFT, size: 20 }));
  return pack(c, `Notification_Letter_${slug(e)}.docx`);
}

async function buildMatrix(e: LoadedEngagement) {
  const c: (Paragraph | Table)[] = [
    p('ZIMBABWE ANTI-CORRUPTION COMMISSION', { bold: true, align: AlignmentType.CENTER, size: 28, after: 20 }),
    p('Refuse, Resist and Report Corruption', { align: AlignmentType.CENTER, italics: true, after: 80 }),
    p(e.institution_name.toUpperCase(), { bold: true, align: AlignmentType.CENTER, after: 20 }),
    p(`IMPLEMENTATION MATRIX: ${kindTitle(e)}`, { bold: true, align: AlignmentType.CENTER, after: 20 }),
    p(dateRange(e.start_date, e.end_date), { bold: true, align: AlignmentType.CENTER, after: 160 }),
    table([500, 2600, 4700, 3300, 1500, 1300], ['', 'ISSUE', 'FINDING', 'RECOMMENDATION', 'RESPONSIBILITY', 'TIME FRAME'],
      e.findings.map((f: any) => [String(f.seq), f.issue, f.finding_points.map((x: string) => `• ${x}`), f.recommendation || '', f.responsibility || '', f.time_frame]), { size: 19 }),
    p(`LEVEL OF COMPLIANCE UPON SIGNATURE: ${(e.compliance_level || '.........').toUpperCase()}`, { bold: true, align: AlignmentType.LEFT, before: 240 }),
    p('CHAIRPERSON – ZACC ........................................................   DATE ......................', { align: AlignmentType.LEFT, before: 200 }),
    p(`CHAIRPERSON – ${e.institution_name.toUpperCase()} ...............................   DATE ......................`, { align: AlignmentType.LEFT, before: 200 }),
  ];
  return pack(c, `Implementation_Matrix_${slug(e)}.docx`, true);
}

async function buildReport(e: LoadedEngagement) {
  const sop = SOPS[e.sop_type as SopType];
  const c: (Paragraph | Table)[] = [...letterhead(), centreTitle(`REPORT ON ${kindTitle(e)} AT ${e.institution_name.toUpperCase()}`), centreTitle(dateRange(e.start_date, e.end_date)),
    p('COMPLIANCE, SYSTEMS AND PROCESSES REVIEW UNIT', { bold: true, align: AlignmentType.CENTER }),
    p(`Compiled by: ${teamOf(e, 'FocalPerson') || '.........................'} (Focal Person)`, { align: AlignmentType.LEFT, after: 20 }),
    p(`Reviewer 1: ${teamOf(e, 'TeamLeader') || '.........................'} (Team Leader)`, { align: AlignmentType.LEFT, after: 20 }),
    p(`Reviewer 2: Manager, Compliance and Systems Review`, { align: AlignmentType.LEFT, after: 20 }),
    p(`Authorised by: General Manager, Prevention and Corporate Governance`, { align: AlignmentType.LEFT })];
  let n = 1;
  c.push(h(`${n++}.0 INTRODUCTION AND BACKGROUND`));
  c.push(p(e.background || MANDATE_TEXT));
  c.push(p(e.allegations.length ? `The Unit conducted the exercise at ${e.institution_name} prompted by allegations of:` : `The Unit conducted the exercise at ${e.institution_name} as a ${e.rationale ? 'justified' : 'routine'} ${kindTitle(e).toLowerCase()}.`));
  if (e.allegations.length) c.push(...numbered(e.allegations, 'dash'));
  c.push(h(`${n++}.0 RATIONALE / JUSTIFICATION`));
  c.push(p(e.rationale || 'The exercise was carried out under Section 12 of the Anti-Corruption Commission Act [Chapter 9:22], which empowers the Commission (a) to monitor and examine the practices, systems and procurement procedures of public and private institutions; (d) to instruct, advise and assist any officer, agency or institution in the elimination or minimisation of corruption; and (g) to assist in the formulation of practices, systems and procurement procedures with a view to eliminating corrupt practices.'));
  c.push(h(`${n++}.0 OBJECTIVES`)); c.push(...numbered(e.objectives, 'alpha'));
  c.push(h(`${n++}.0 METHODOLOGY`)); c.push(...numbered(e.methodology, 'dash'));
  if (e.interviews.length) c.push(p(`Interviews were conducted with: ${e.interviews.map((i: any) => `${i.interviewee}${i.position ? ` (${i.position})` : ''}`).join('; ')}.`));
  c.push(h(`${n++}.0 TEAM COMPOSITION`));
  c.push(p(`The exercise was conducted by ${numWord(e.team.length)} officer(s): ${e.team.map((m: any) => `${m.name} (${m.team_role === 'TeamLeader' ? 'Team Leader' : m.team_role === 'FocalPerson' ? 'Focal Person' : 'Member'})`).join('; ')}.`));
  c.push(h(`${n++}.0 FINDINGS`));
  e.findings.forEach((f: any) => {
    c.push(p(`${n - 1}.${f.seq} ${f.issue}`, { bold: true, align: AlignmentType.LEFT, keepNext: true }));
    c.push(...numbered(f.finding_points, 'num'));
    if (f.legal_reference) c.push(p(`Legal basis: ${f.legal_reference}.`, { italics: true }));
    c.push(p(`Compliance rating: ${({ Compliant: 'Compliant', PartiallyCompliant: 'Partially Compliant', NonCompliant: 'Non-Compliant' } as any)[f.compliance_rating]}.`));
    if (f.recommendation) c.push(p([t('Recommendation: ', { bold: true }), t(f.recommendation)]));
  });
  c.push(h(`${n++}.0 RECOMMENDATIONS`));
  c.push(...numbered(e.findings.filter((f: any) => f.recommendation).map((f: any) => `${f.recommendation} (Responsibility: ${f.responsibility || 'TBC'}; Time frame: ${f.time_frame}).`), 'num'));
  c.push(h(`${n++}.0 ACTION PLAN AND IMPLEMENTATION STRATEGY`));
  c.push(p(`The institution will be monitored after three (3) months to check implementation of the recommendations in the Implementation Matrix${e.monitoring_due_at ? ` (monitoring due ${longDate(e.monitoring_due_at.slice(0, 10))})` : ''}. Progress will be reflected on the Electronic Compliance Monitoring Dashboard (green: full compliance; amber: partial compliance; red: non-compliance).`));
  c.push(h(`${n++}.0 CONCLUSION`));
  c.push(p(e.conclusion || ''));
  c.push(p(`Level of compliance: ${(e.compliance_level || '—').toUpperCase()}.`, { bold: true }));
  c.push(p(`Evaluation basis: ${sop.evaluation}`));
  c.push(h(`${n++}.0 LIST OF ANNEXURES`));
  c.push(p('Annexure 1: Implementation Matrix'));
  return pack(c, `Report_${slug(e)}.docx`);
}

async function buildMonitoringNotice(e: LoadedEngagement) {
  const due = e.monitoring_due_at ? longDate(e.monitoring_due_at.slice(0, 10)) : 'three (3) months from the date of the exercise';
  const c: (Paragraph | Table)[] = [...letterhead(),
    p(`Ref: ${e.reference}/MON`, { align: AlignmentType.LEFT, after: 20 }), p(longDate(new Date()), { align: AlignmentType.LEFT, after: 160 }),
    p('The Accounting Officer / Chief Executive Officer', { align: AlignmentType.LEFT, bold: true, after: 0 }), p(e.institution_name, { align: AlignmentType.LEFT, after: 160 }),
    p('Dear Sir / Madam', { align: AlignmentType.LEFT }),
    p(`RE: NOTICE OF MONITORING OF IMPLEMENTATION OF THE IMPLEMENTATION MATRIX — ${e.institution_name.toUpperCase()}`, { bold: true, align: AlignmentType.LEFT }),
    p(`Following the ${kindTitle(e).toLowerCase()} carried out at your institution (${dateRange(e.start_date, e.end_date)}), the Commission gives notice that officers of the Compliance, Systems and Processes Review Unit will visit your institution on or about ${due} to check compliance with the recommendations in the Implementation Matrix.`),
    p('The degree of compliance will be recorded on the Electronic Compliance Monitoring Dashboard (green, amber or red). Institutions achieving full compliance may be awarded a Certificate of Compliance, valid for one year. Non-compliant institutions may be subject to the measures provided for in the Compliance Procedure Manual, communicated through the relevant sector regulators.'),
    p('You are requested to prepare evidence of implementation for each recommendation.'),
    p('Yours faithfully', { align: AlignmentType.LEFT, before: 200 }), ...sigBlock([{ title: 'CHAIRPERSON OF THE COMMISSION' }])];
  return pack(c, `Monitoring_Notice_${slug(e)}.docx`);
}
