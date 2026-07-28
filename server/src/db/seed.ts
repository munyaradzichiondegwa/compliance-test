/* eslint-disable no-console */
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { db, initSchema, resetDatabase } from './index';
import { computeCompositeScore, ragStatusFor, scoreForResponse, averageSectionScore, SectionScores } from '../utils/scoring';
import { riskScore, residualScoreFromEffectiveness } from '../utils/riskEngine';
import { evaluateRedFlags } from '../utils/procurementRules';
import { encryptForSeed, generateTrackingCode } from '../utils/crypto';

// ============================================================================
// Deterministic PRNG (mulberry32) so the demo dataset is reproducible run to
// run — useful when re-seeding for a live demonstration.
// ============================================================================
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260713);
const rf = () => rng();
const ri = (min: number, max: number) => Math.floor(rf() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[ri(0, arr.length - 1)];
const chance = (p: number) => rf() < p;

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function isoDaysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

const DEMO_PASSWORD = 'ZaccDemo#2026';

console.log('== ZACC Compliance Portal — seeding demo dataset ==');
console.log('Resetting database...');
resetDatabase();
initSchema();

const now = new Date();

// ============================================================================
// 1. USERS — one seed account per persona role (PRD Section 6.2), plus a
//    couple of extra Compliance Officers / Focal Persons for realistic load.
// ============================================================================
interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  province?: string | null;
  phone: string;
}

const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
const insertUser = db.prepare(`
  INSERT INTO users (id, name, email, phone, password_hash, role, institution_id, mfa_enabled, is_active, province, created_at, last_login)
  VALUES (@id, @name, @email, @phone, @passwordHash, @role, NULL, 0, 1, @province, @createdAt, NULL)
`);

const users: SeedUser[] = [
  { id: uuid(), name: 'Tendai Chikafu', email: 'admin@zacc.gov.zw', role: 'SUPER_ADMIN', province: null, phone: '+263771000001' },
  { id: uuid(), name: 'Farai Mutasa', email: 'prevention.head@zacc.gov.zw', role: 'PREVENTION_HEAD', province: null, phone: '+263771000002' },
  { id: uuid(), name: 'Rutendo Gwenzi', email: 'officer1@zacc.gov.zw', role: 'COMPLIANCE_OFFICER', province: 'Harare', phone: '+263771000003' },
  { id: uuid(), name: 'Tapiwa Ncube', email: 'officer2@zacc.gov.zw', role: 'COMPLIANCE_OFFICER', province: 'Midlands', phone: '+263771000004' },
  { id: uuid(), name: 'Chiedza Marufu', email: 'officer3@zacc.gov.zw', role: 'COMPLIANCE_OFFICER', province: 'Manicaland', phone: '+263771000005' },
  { id: uuid(), name: 'Blessing Sithole', email: 'reviewer1@zacc.gov.zw', role: 'SYSTEMS_REVIEWER', province: null, phone: '+263771000006' },
  { id: uuid(), name: 'Nyasha Moyo', email: 'reviewer2@zacc.gov.zw', role: 'SYSTEMS_REVIEWER', province: null, phone: '+263771000007' },
  { id: uuid(), name: 'Tafadzwa Chirwa', email: 'monitoring1@zacc.gov.zw', role: 'MONITORING_OFFICER', province: null, phone: '+263771000008' },
  { id: uuid(), name: 'Simbarashe Dube', email: 'monitoring2@zacc.gov.zw', role: 'MONITORING_OFFICER', province: null, phone: '+263771000009' },
  { id: uuid(), name: 'Panashe Zulu', email: 'auditor@zacc.gov.zw', role: 'AUDITOR', province: null, phone: '+263771000010' },
  { id: uuid(), name: 'Kudzai Mangwana', email: 'oag.auditor@oag.gov.zw', role: 'AUDITOR', province: null, phone: '+263771000011' },
  { id: uuid(), name: 'Tanaka Museva', email: 'investigations@zacc.gov.zw', role: 'INVESTIGATIONS_OFFICER', province: null, phone: '+263771000012' },
];

// Institution Focal Persons and Integrity Committee Chairs are created after
// institutions exist (they reference institution_id). See section 2 below.

const insertMany = db.transaction((rows: SeedUser[]) => {
  for (const u of rows) {
    insertUser.run({ id: u.id, name: u.name, email: u.email, phone: u.phone, passwordHash, role: u.role, province: u.province, createdAt: isoDaysAgo(ri(30, 300)) });
  }
});
insertMany(users);
console.log(`Seeded ${users.length} core ZACC staff users.`);

// ============================================================================
// 2. INSTITUTIONS — 24 fictional institutions spanning all 10 provinces.
//    Deliberately fictional names ("(Demo)" or invented compound names) so
//    the seeded compliance scores below are never attached to a real,
//    identifiable Zimbabwean institution.
// ============================================================================
const PROVINCE_COORDS: Record<string, { lat: number; lng: number }> = {
  Harare: { lat: -17.83, lng: 31.05 },
  Bulawayo: { lat: -20.15, lng: 28.58 },
  Manicaland: { lat: -18.97, lng: 32.67 },
  'Mashonaland Central': { lat: -17.3, lng: 31.33 },
  'Mashonaland East': { lat: -18.19, lng: 31.55 },
  'Mashonaland West': { lat: -17.37, lng: 30.2 },
  Masvingo: { lat: -20.06, lng: 30.83 },
  'Matabeleland North': { lat: -18.37, lng: 26.5 },
  'Matabeleland South': { lat: -20.93, lng: 29.0 },
  Midlands: { lat: -19.45, lng: 29.82 },
};

interface SeedInstitution {
  id: string;
  name: string;
  type: string;
  sector: string;
  ownership: string;
  province: string;
  district: string;
  riskLevel: 'Low' | 'Medium' | 'High';
}

const institutionDefs: Omit<SeedInstitution, 'id'>[] = [
  { name: 'Ministry of Public Infrastructure (Demo)', type: 'Ministry', sector: 'Public Works', ownership: 'Public', province: 'Harare', district: 'Harare Central', riskLevel: 'Medium' },
  { name: 'Ministry of Rural Development (Demo)', type: 'Ministry', sector: 'Rural Development', ownership: 'Public', province: 'Harare', district: 'Harare Central', riskLevel: 'Medium' },
  { name: 'National Housing Trust (Demo)', type: 'Parastatal', sector: 'Housing', ownership: 'Parastatal', province: 'Harare', district: 'Harare South', riskLevel: 'High' },
  { name: 'Rugare State Enterprises (Demo)', type: 'State-Owned Enterprise', sector: 'Manufacturing', ownership: 'Parastatal', province: 'Harare', district: 'Harare West', riskLevel: 'Medium' },
  { name: 'Zororo Private Hospital Group (Demo)', type: 'Private Entity', sector: 'Health', ownership: 'Private', province: 'Harare', district: 'Harare North', riskLevel: 'Low' },
  { name: 'Kumusha Rural District Council (Demo)', type: 'Local Authority', sector: 'Local Government', ownership: 'Public', province: 'Mashonaland Central', district: 'Bindura', riskLevel: 'High' },
  { name: 'Mashonaland Central Grain Trust (Demo)', type: 'State-Owned Enterprise', sector: 'Agriculture', ownership: 'Parastatal', province: 'Mashonaland Central', district: 'Mount Darwin', riskLevel: 'Medium' },
  { name: 'Zvimba Grain Marketing Trust (Demo)', type: 'State-Owned Enterprise', sector: 'Agriculture', ownership: 'Parastatal', province: 'Mashonaland West', district: 'Zvimba', riskLevel: 'Medium' },
  { name: 'Mashonaland West Water Utility Board (Demo)', type: 'State-Owned Enterprise', sector: 'Water & Sanitation', ownership: 'Parastatal', province: 'Mashonaland West', district: 'Chegutu', riskLevel: 'High' },
  { name: 'Chiedza Rural District Council (Demo)', type: 'Local Authority', sector: 'Local Government', ownership: 'Public', province: 'Mashonaland East', district: 'Marondera', riskLevel: 'Medium' },
  { name: 'Mashonaland East Grain Silos (Demo)', type: 'State-Owned Enterprise', sector: 'Agriculture', ownership: 'Parastatal', province: 'Mashonaland East', district: 'Murehwa', riskLevel: 'Low' },
  { name: 'Vumba Tourism Authority (Demo)', type: 'Parastatal', sector: 'Tourism', ownership: 'Parastatal', province: 'Manicaland', district: 'Mutare', riskLevel: 'Low' },
  { name: 'Manicaland Forestry Corporation (Demo)', type: 'Parastatal', sector: 'Forestry', ownership: 'Parastatal', province: 'Manicaland', district: 'Mutasa', riskLevel: 'Medium' },
  { name: 'Nyaradzo Teaching Hospital Trust (Demo)', type: 'State-Owned Enterprise', sector: 'Health', ownership: 'Public', province: 'Manicaland', district: 'Mutare', riskLevel: 'Medium' },
  { name: 'Midlands Mining Development Corporation (Demo)', type: 'Parastatal', sector: 'Mining', ownership: 'Parastatal', province: 'Midlands', district: 'Gweru', riskLevel: 'High' },
  { name: 'Simukai Technical College (Demo)', type: 'State-Owned Enterprise', sector: 'Education', ownership: 'Public', province: 'Midlands', district: 'Gweru', riskLevel: 'Low' },
  { name: 'Tashinga Mining Ventures (Demo)', type: 'Private Entity', sector: 'Mining', ownership: 'Private', province: 'Midlands', district: 'Kwekwe', riskLevel: 'High' },
  { name: 'Masvingo Irrigation Authority (Demo)', type: 'Parastatal', sector: 'Agriculture', ownership: 'Parastatal', province: 'Masvingo', district: 'Masvingo Central', riskLevel: 'Medium' },
  { name: 'Masvingo Heritage & Tourism Trust (Demo)', type: 'Parastatal', sector: 'Tourism & Heritage', ownership: 'Parastatal', province: 'Masvingo', district: 'Masvingo Central', riskLevel: 'Low' },
  { name: 'Matabeleland North Wildlife Authority (Demo)', type: 'Parastatal', sector: 'Environment & Wildlife', ownership: 'Parastatal', province: 'Matabeleland North', district: 'Hwange', riskLevel: 'Medium' },
  { name: 'Matabeleland North Energy Holdings (Demo)', type: 'State-Owned Enterprise', sector: 'Energy', ownership: 'Parastatal', province: 'Matabeleland North', district: 'Hwange', riskLevel: 'High' },
  { name: 'Matabeleland South Rural District Council (Demo)', type: 'Local Authority', sector: 'Local Government', ownership: 'Public', province: 'Matabeleland South', district: 'Gwanda', riskLevel: 'Medium' },
  { name: 'Bulawayo Metropolitan Transport Trust (Demo)', type: 'State-Owned Enterprise', sector: 'Transport', ownership: 'Parastatal', province: 'Bulawayo', district: 'Bulawayo Central', riskLevel: 'Medium' },
  { name: 'Ilanga Private Security Services (Demo)', type: 'Private Entity', sector: 'Security', ownership: 'Private', province: 'Bulawayo', district: 'Bulawayo North', riskLevel: 'Low' },
];

const insertInstitution = db.prepare(`
  INSERT INTO institutions (id, name, type, sector, ownership, province, district, latitude, longitude, risk_level, status, registration_no, created_at, updated_at)
  VALUES (@id, @name, @type, @sector, @ownership, @province, @district, @latitude, @longitude, @riskLevel, 'Active', @registrationNo, @createdAt, @createdAt)
`);

const institutions: SeedInstitution[] = institutionDefs.map((def) => ({ id: uuid(), ...def }));

const insertInstitutions = db.transaction((rows: SeedInstitution[]) => {
  let regCounter = 1001;
  for (const inst of rows) {
    const base = PROVINCE_COORDS[inst.province];
    const jitterLat = (rf() - 0.5) * 0.5;
    const jitterLng = (rf() - 0.5) * 0.5;
    insertInstitution.run({
      id: inst.id,
      name: inst.name,
      type: inst.type,
      sector: inst.sector,
      ownership: inst.ownership,
      province: inst.province,
      district: inst.district,
      latitude: base.lat + jitterLat,
      longitude: base.lng + jitterLng,
      riskLevel: inst.riskLevel,
      registrationNo: `ZACC-REG-${regCounter++}`,
      createdAt: isoDaysAgo(ri(60, 400)),
    });
  }
});
insertInstitutions(institutions);
console.log(`Seeded ${institutions.length} institutions across all 10 provinces.`);

// ============================================================================
// 2b. INSTITUTION FOCAL PERSONS & INTEGRITY COMMITTEE CHAIRS
//     One of each for a representative subset of institutions (10 of 24) —
//     enough to fully demonstrate the Institution Portal and Committee
//     Management workflows without seeding 48 near-identical accounts.
// ============================================================================
const institutionsWithUsers = institutions.slice(0, 10);
const focalPersons: SeedUser[] = institutionsWithUsers.map((inst, i) => ({
  id: uuid(),
  name: `${pick(['Memory', 'Prosper', 'Precious', 'Tatenda', 'Anesu', 'Ropafadzo', 'Nkosana', 'Sekai', 'Tinashe', 'Vimbai'])} ${pick(['Mhizha', 'Chirenje', 'Gumbo', 'Nyathi', 'Chitiga', 'Manyara', 'Sibanda', 'Chikwava'])}`,
  email: `focal.${i + 1}@institution-demo.zw`,
  role: 'INSTITUTION_FOCAL_PERSON',
  province: inst.province,
  phone: `+26377${(2000000 + i).toString().slice(-7)}`,
}));
const committeeChairs: SeedUser[] = institutionsWithUsers.map((inst, i) => ({
  id: uuid(),
  name: `${pick(['Gift', 'Charity', 'Blessing', 'Faith', 'Hope', 'Praise', 'Wisdom', 'Trust'])} ${pick(['Marufu', 'Chademana', 'Ndoro', 'Bhebhe', 'Chirwa', 'Mafios', 'Dzingirai'])}`,
  email: `committee.chair.${i + 1}@institution-demo.zw`,
  role: 'INTEGRITY_COMMITTEE_CHAIR',
  province: inst.province,
  phone: `+26377${(3000000 + i).toString().slice(-7)}`,
}));

const insertLinkedUser = db.prepare(`
  INSERT INTO users (id, name, email, phone, password_hash, role, institution_id, mfa_enabled, is_active, province, created_at, last_login)
  VALUES (@id, @name, @email, @phone, @passwordHash, @role, @institutionId, 0, 1, @province, @createdAt, NULL)
`);
const updateInstitutionFocal = db.prepare(`UPDATE institutions SET focal_person_user_id = ? WHERE id = ?`);

const insertLinked = db.transaction(() => {
  institutionsWithUsers.forEach((inst, i) => {
    const fp = focalPersons[i];
    insertLinkedUser.run({ id: fp.id, name: fp.name, email: fp.email, phone: fp.phone, passwordHash, role: fp.role, institutionId: inst.id, province: fp.province, createdAt: isoDaysAgo(ri(30, 200)) });
    updateInstitutionFocal.run(fp.id, inst.id);

    const cc = committeeChairs[i];
    insertLinkedUser.run({ id: cc.id, name: cc.name, email: cc.email, phone: cc.phone, passwordHash, role: cc.role, institutionId: inst.id, province: cc.province, createdAt: isoDaysAgo(ri(30, 200)) });
  });
});
insertLinked();
console.log(`Seeded ${focalPersons.length} Institution Focal Persons and ${committeeChairs.length} Integrity Committee Chairs.`);

const allStaffUsers = [...users, ...focalPersons, ...committeeChairs];

// ============================================================================
// 3. NOTIFICATION TEMPLATES (Section 10.2, NOT-05) — `channel` marks the
//    highest channel tier this template unlocks (in_app < email < sms; sms
//    templates fire in_app + email + sms together). See utils/notify.ts.
// ============================================================================
const insertTemplate = db.prepare(`
  INSERT INTO notification_templates (id, code, channel, subject_template, body_template, updated_at)
  VALUES (@id, @code, @channel, @subject, @body, datetime('now'))
`);
const templates = [
  { code: 'ASSESSMENT_ASSIGNED', channel: 'email', subject: 'New Compliance Assessment Assigned: {{institutionName}}', body: 'You have been assigned a new compliance assessment for {{institutionName}}. Please log in to the Portal to begin the digital checklist.' },
  { code: 'ASSESSMENT_SUBMITTED', channel: 'email', subject: 'Assessment Submitted for Your Review: {{institutionName}}', body: '{{officerName}} has submitted a compliance assessment for {{institutionName}} (composite score {{score}}, status {{rag}}). Please review within {{slaDays}} working days.' },
  { code: 'ASSESSMENT_APPROVED', channel: 'email', subject: 'Assessment Approved: {{institutionName}}', body: 'Your compliance assessment for {{institutionName}} has been approved. {{recCount}} recommendation(s) have been auto-generated and issued to the institution.' },
  { code: 'ASSESSMENT_RETURNED', channel: 'email', subject: 'Assessment Returned for Revision: {{institutionName}}', body: 'Your assessment for {{institutionName}} was returned by {{reviewerName}} with the following notes: {{notes}}' },
  { code: 'ASSESSMENT_ESCALATED', channel: 'sms', subject: 'Assessment Review Overdue', body: 'URGENT: The compliance assessment for {{institutionName}} has not been reviewed within the SLA and has been escalated to the Prevention Head.' },
  { code: 'RECOMMENDATION_ASSIGNED', channel: 'email', subject: 'New Recommendation Issued: {{institutionName}}', body: 'A new recommendation has been issued to {{institutionName}}: "{{description}}". Please respond with evidence by {{dueDate}}.' },
  { code: 'RECOMMENDATION_REMINDER_30', channel: 'email', subject: 'Reminder: Recommendation Overdue — {{institutionName}}', body: 'This is a reminder that the recommendation "{{description}}" for {{institutionName}} is now {{daysOverdue}} days overdue. Please submit evidence of implementation.' },
  { code: 'RECOMMENDATION_REMINDER_60', channel: 'sms', subject: 'Recommendation 60 Days Overdue', body: 'NOTICE: The recommendation "{{description}}" for {{institutionName}} is now 60 days overdue. Escalation follows at 90 days.' },
  { code: 'RECOMMENDATION_REMINDER_90_ESCALATION', channel: 'sms', subject: 'Recommendation 90+ Days Overdue — Escalated', body: 'ESCALATION: The recommendation "{{description}}" for {{institutionName}} is 90+ days overdue and has been escalated to the Prevention Head.' },
  { code: 'RECOMMENDATION_VERIFIED', channel: 'email', subject: 'Recommendation Verified & Closed', body: 'Your submitted evidence for "{{description}}" has been verified and the recommendation is now closed. Thank you.' },
  { code: 'RECOMMENDATION_REJECTED', channel: 'email', subject: 'Recommendation Evidence Insufficient', body: 'The evidence submitted for "{{description}}" was reviewed and found insufficient: {{notes}}. Please resubmit.' },
  { code: 'WHISTLEBLOWER_ASSIGNED', channel: 'email', subject: 'New Whistleblower Report Assigned', body: 'A new whistleblower report ({{trackingCode}}, category: {{category}}) has been assigned to you for triage.' },
  { code: 'PROCUREMENT_REDFLAG', channel: 'sms', subject: 'Procurement Red Flag Alert', body: 'ALERT: A procurement record for {{institutionName}} ({{description}}, ${{value}}) has triggered {{flagCount}} red flag(s). Review required within 48 hours.' },
  { code: 'PLEDGE_EXPIRY_REMINDER', channel: 'email', subject: 'Integrity Pledge Expiring Soon', body: 'The integrity pledge "{{title}}" signed by {{name}} is expiring on {{expiryDate}}. Please arrange renewal.' },
  { code: 'SYSTEMS_REVIEW_ASSIGNED', channel: 'email', subject: 'Added to Systems Review: {{title}}', body: 'You have been added as a reviewer on the systems review "{{title}}" for {{institutionName}}.' },
];
const insertTemplates = db.transaction(() => {
  templates.forEach((t) => insertTemplate.run({ id: uuid(), ...t }));
});
insertTemplates();
console.log(`Seeded ${templates.length} notification templates.`);

// ============================================================================
// 4. WORKFLOW ENGINE CONFIGURATION (Section 10.3) — editable later via
//    Admin > Workflow Configuration; jobs/scheduler.ts reads these at runtime.
// ============================================================================
const insertWfConfig = db.prepare(`
  INSERT INTO workflow_configs (id, workflow_type, sla_days, escalate_to_role, reminder_intervals, updated_at)
  VALUES (@id, @workflowType, @slaDays, @escalateToRole, @reminderIntervals, datetime('now'))
`);
// Note on escalation targets: the Prevention Head acts as the approving
// supervisor for assessments and systems reviews in this staffing model (the
// PRD's own persona table folds "ZACC IT / Prevention Head" into the Super
// Administrator description), so an overdue *approval* must escalate up to
// Super Admin rather than back to the approver. Recommendation follow-through
// and whistleblower triage are owned day-to-day by the Monitoring Officer and
// Investigations Officer respectively, so those escalate up to the Prevention Head.
const wfConfigs = [
  { workflowType: 'AssessmentReview', slaDays: 5, escalateToRole: 'SUPER_ADMIN', reminderIntervals: JSON.stringify([3, 5]) },
  { workflowType: 'RecommendationResponse', slaDays: 14, escalateToRole: 'PREVENTION_HEAD', reminderIntervals: JSON.stringify([30, 60, 90]) },
  { workflowType: 'SystemsReviewApproval', slaDays: 10, escalateToRole: 'SUPER_ADMIN', reminderIntervals: JSON.stringify([5, 10]) },
  { workflowType: 'WhistleblowerTriage', slaDays: 7, escalateToRole: 'PREVENTION_HEAD', reminderIntervals: JSON.stringify([3, 7]) },
];
const insertWfConfigs = db.transaction(() => {
  wfConfigs.forEach((c) => insertWfConfig.run({ id: uuid(), ...c }));
});
insertWfConfigs();
console.log(`Seeded ${wfConfigs.length} workflow configurations.`);

// ============================================================================
// 5. COMPLIANCE ASSESSMENTS — weighted 5-section digital checklist
//    (PRD Section 10.1 / 7.1 user journey). Response quality is biased by
//    each institution's baseline risk_level so the resulting scores, RAG
//    statuses, GIS map colouring and dashboards all tell a coherent story.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { UPLOADS_DIR } from './index';

const placeholderEvidencePath = path.join(UPLOADS_DIR, 'seed-evidence-placeholder.txt');
fs.writeFileSync(
  placeholderEvidencePath,
  'ZACC Institutional Compliance Portal — demo evidence placeholder.\nIn production this would be a field officer\'s uploaded photograph, scanned document, or PDF captured during a site visit.'
);

type SectionKeyLocal = 'governance' | 'controls' | 'procurement' | 'finance' | 'integrity';
const CHECKLIST_TEMPLATE: { section: SectionKeyLocal; item_text: string }[] = [
  { section: 'governance', item_text: 'Board/Council meets at the legally required minimum frequency' },
  { section: 'governance', item_text: 'Institution has an approved and current strategic plan' },
  { section: 'governance', item_text: 'Clear segregation of oversight and executive management roles exists' },
  { section: 'controls', item_text: 'Internal audit function is established and independent' },
  { section: 'controls', item_text: 'Bank reconciliations are performed and reviewed monthly' },
  { section: 'controls', item_text: 'Fixed asset register is maintained and periodically verified' },
  { section: 'controls', item_text: 'Authorisation limits for expenditure are documented and enforced' },
  { section: 'procurement', item_text: 'Procurement committee is constituted per PRAZ regulations' },
  { section: 'procurement', item_text: 'Competitive bidding is used for purchases above the prescribed threshold' },
  { section: 'procurement', item_text: 'Supplier due-diligence checks are performed and documented' },
  { section: 'finance', item_text: 'Annual financial statements are prepared and externally audited' },
  { section: 'finance', item_text: 'Budget variance reports are reviewed quarterly by management' },
  { section: 'finance', item_text: 'Petty cash controls include dual authorisation' },
  { section: 'integrity', item_text: 'Integrity Committee is constituted and active' },
  { section: 'integrity', item_text: 'Conflict-of-interest declarations are collected annually from staff' },
  { section: 'integrity', item_text: 'Whistleblower policy is published and communicated to staff' },
];

const complianceOfficers = users.filter((u) => u.role === 'COMPLIANCE_OFFICER');
const preventionHead = users.find((u) => u.role === 'PREVENTION_HEAD')!;

function officerForInstitution(inst: SeedInstitution) {
  return complianceOfficers.find((o) => o.province === inst.province) || pick(complianceOfficers);
}

function qualityBiasFor(riskLevel: string): number {
  if (riskLevel === 'Low') return 0.78;
  if (riskLevel === 'Medium') return 0.58;
  return 0.38; // High
}

function pickResponse(qualityBias: number): 'Compliant' | 'PartiallyCompliant' | 'NonCompliant' | 'NotApplicable' {
  if (chance(0.04)) return 'NotApplicable';
  const r = rf();
  if (r < qualityBias) return 'Compliant';
  if (r < qualityBias + (1 - qualityBias) * 0.6) return 'PartiallyCompliant';
  return 'NonCompliant';
}

const insertAssessment = db.prepare(`
  INSERT INTO assessments (
    id, institution_id, officer_id, scheduled_date, status, governance_score, controls_score,
    procurement_score, finance_score, integrity_score, composite_score, rag_status, findings_text,
    geotag_lat, geotag_lng, submitted_at, sla_due_at, escalated, reviewed_by, review_notes,
    approved_at, closed_at, created_at, updated_at
  ) VALUES (
    @id, @institutionId, @officerId, @scheduledDate, @status, @governanceScore, @controlsScore,
    @procurementScore, @financeScore, @integrityScore, @compositeScore, @ragStatus, @findingsText,
    @geotagLat, @geotagLng, @submittedAt, @slaDueAt, @escalated, @reviewedBy, @reviewNotes,
    @approvedAt, @closedAt, @createdAt, @updatedAt
  )
`);
const insertChecklistItem = db.prepare(`
  INSERT INTO assessment_checklist_items (id, assessment_id, section, item_text, response, score, comments, sort_order)
  VALUES (@id, @assessmentId, @section, @itemText, @response, @score, @comments, @sortOrder)
`);
const insertEvidence = db.prepare(`
  INSERT INTO assessment_evidence (id, assessment_id, file_name, file_path, mime_type, size_bytes, uploaded_by, uploaded_at)
  VALUES (@id, @assessmentId, @fileName, @filePath, 'text/plain', @size, @uploadedBy, @uploadedAt)
`);
const insertRecommendation = db.prepare(`
  INSERT INTO recommendations (
    id, source_type, source_id, institution_id, description, category, priority, assigned_to_user_id,
    owner_name, due_date, status, escalation_level, last_reminder_sent_at, response_text, responded_at,
    verified_by, verified_at, verification_notes, created_at, updated_at
  ) VALUES (
    @id, @sourceType, @sourceId, @institutionId, @description, @category, @priority, @assignedToUserId,
    @ownerName, @dueDate, @status, @escalationLevel, @lastReminderSentAt, @responseText, @respondedAt,
    @verifiedBy, @verifiedAt, @verificationNotes, @createdAt, @updatedAt
  )
`);

const NEGATIVE_COMMENTS: Record<string, string> = {
  NonCompliant: 'Not evidenced during site visit; institution unable to produce supporting documentation.',
  PartiallyCompliant: 'Partially evidenced; process exists but is not consistently applied or documented.',
};

let totalAssessments = 0;
let totalRecommendations = 0;

function buildAssessment(inst: SeedInstitution, opts: { status: string; assessedDaysAgo: number; liveDueInDays?: number }) {
  const assessmentId = uuid();
  const officer = officerForInstitution(inst);
  const bias = qualityBiasFor(inst.riskLevel);
  const createdAt = isoDaysAgo(opts.assessedDaysAgo);

  const items = CHECKLIST_TEMPLATE.map((tpl, idx) => {
    const response = pickResponse(bias);
    return { id: uuid(), section: tpl.section, item_text: tpl.item_text, response, score: scoreForResponse(response), sortOrder: idx, comments: response in NEGATIVE_COMMENTS ? NEGATIVE_COMMENTS[response] : null };
  });

  const sectionScores: SectionScores = {
    governance: averageSectionScore(items.filter((i) => i.section === 'governance').map((i) => i.score)),
    controls: averageSectionScore(items.filter((i) => i.section === 'controls').map((i) => i.score)),
    procurement: averageSectionScore(items.filter((i) => i.section === 'procurement').map((i) => i.score)),
    finance: averageSectionScore(items.filter((i) => i.section === 'finance').map((i) => i.score)),
    integrity: averageSectionScore(items.filter((i) => i.section === 'integrity').map((i) => i.score)),
  };
  const composite = computeCompositeScore(sectionScores);
  const rag = ragStatusFor(composite);

  const isDraft = opts.status === 'Draft';
  const isSubmittedOrReview = opts.status === 'Submitted' || opts.status === 'UnderReview';
  const isApprovedOrClosed = opts.status === 'Approved' || opts.status === 'Closed';

  const submittedAt = isDraft ? null : isoDaysAgo(Math.max(opts.assessedDaysAgo - 1, 0));
  const slaDueAt = isDraft ? null : new Date(new Date(submittedAt!).getTime() + 5 * 86400000).toISOString();
  const reviewedBy = isApprovedOrClosed ? preventionHead.id : null;
  const approvedAt = isApprovedOrClosed ? isoDaysAgo(Math.max(opts.assessedDaysAgo - 2, 0)) : null;
  const closedAt = opts.status === 'Closed' ? isoDaysAgo(Math.max(opts.assessedDaysAgo - 2, 0)) : null;

  const base = PROVINCE_COORDS[inst.province];

  insertAssessment.run({
    id: assessmentId,
    institutionId: inst.id,
    officerId: officer.id,
    scheduledDate: dateOnly(createdAt),
    status: opts.status,
    governanceScore: sectionScores.governance,
    controlsScore: sectionScores.controls,
    procurementScore: sectionScores.procurement,
    financeScore: sectionScores.finance,
    integrityScore: sectionScores.integrity,
    compositeScore: composite,
    ragStatus: rag,
    findingsText: isDraft ? null : `Site assessment of ${inst.name} conducted by ${officer.name}. Composite score ${composite.toFixed(1)}/100 (${rag}).`,
    geotagLat: isDraft ? null : base.lat + (rf() - 0.5) * 0.4,
    geotagLng: isDraft ? null : base.lng + (rf() - 0.5) * 0.4,
    submittedAt,
    slaDueAt,
    escalated: 0,
    reviewedBy,
    reviewNotes: isApprovedOrClosed ? 'Reviewed and approved. Implementation matrix generated automatically.' : null,
    approvedAt,
    closedAt,
    createdAt,
    updatedAt: closedAt || approvedAt || submittedAt || createdAt,
  });

  items.forEach((item) => {
    insertChecklistItem.run({
      id: item.id,
      assessmentId,
      section: item.section,
      itemText: item.item_text,
      response: item.response,
      score: item.score,
      comments: item.comments,
      sortOrder: item.sortOrder,
    });
  });

  if (!isDraft) {
    const evidenceCount = ri(1, 3);
    for (let i = 0; i < evidenceCount; i++) {
      insertEvidence.run({
        id: uuid(),
        assessmentId,
        fileName: `site-visit-evidence-${i + 1}.txt`,
        filePath: placeholderEvidencePath,
        size: fs.statSync(placeholderEvidencePath).size,
        uploadedBy: officer.id,
        uploadedAt: createdAt,
      });
    }
  }

  totalAssessments++;

  // Auto-generate the implementation matrix (recommendations) for approved/closed assessments only.
  if (isApprovedOrClosed) {
    const problemItems = items.filter((i) => i.response === 'NonCompliant' || i.response === 'PartiallyCompliant').slice(0, 6);
    problemItems.forEach((item, idx) => {
      const recId = uuid();
      const dueDate = new Date(new Date(approvedAt!).getTime() + ri(14, 45) * 86400000);
      const recCreatedAt = approvedAt!;
      const ageInDays = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);

      // Vary recommendation lifecycle so the audit dashboard aging buckets (30/60/90) have real data.
      let status: string;
      let escalationLevel = 0;
      let respondedAt: string | null = null;
      let responseText: string | null = null;
      let verifiedBy: string | null = null;
      let verifiedAt: string | null = null;
      let verificationNotes: string | null = null;
      const monitoring = pick(users.filter((u) => u.role === 'MONITORING_OFFICER'));

      if (opts.status === 'Closed' && ageInDays > 30 && chance(0.55)) {
        status = 'Closed';
        respondedAt = isoDaysAgo(ri(5, Math.max(ageInDays - 5, 6)));
        responseText = 'Corrective action implemented; supporting evidence attached.';
        verifiedBy = monitoring.id;
        verifiedAt = isoDaysAgo(Math.max(ri(1, 5), 1));
        verificationNotes = 'Evidence reviewed and accepted as adequate closure.';
      } else if (ageInDays > 90) {
        status = 'Incomplete';
        escalationLevel = 3;
      } else if (ageInDays > 60) {
        status = chance(0.5) ? 'ResponseSubmitted' : 'Assigned';
        escalationLevel = 2;
        if (status === 'ResponseSubmitted') {
          respondedAt = isoDaysAgo(ri(1, 10));
          responseText = 'Partial corrective action taken; requesting verification.';
        }
      } else if (ageInDays > 30) {
        status = chance(0.4) ? 'ResponseSubmitted' : 'Assigned';
        escalationLevel = 1;
        if (status === 'ResponseSubmitted') {
          respondedAt = isoDaysAgo(ri(1, 8));
          responseText = 'Corrective action underway; documentation attached.';
        }
      } else if (ageInDays > 0) {
        status = 'Assigned';
      } else {
        status = 'Assigned'; // not yet due
      }

      const focal = focalPersons.find((f, i2) => institutionsWithUsers[i2]?.id === inst.id) || null;

      insertRecommendation.run({
        id: recId,
        sourceType: 'Assessment',
        sourceId: assessmentId,
        institutionId: inst.id,
        description: `Address ${item.response === 'NonCompliant' ? 'non-compliance' : 'partial compliance'} finding: "${item.item_text}"`,
        category: capitalizeStr(item.section),
        priority: item.response === 'NonCompliant' ? 'High' : 'Medium',
        assignedToUserId: focal ? focal.id : null,
        ownerName: focal ? focal.name : 'Institution Focal Person',
        dueDate: dateOnly(dueDate.toISOString()),
        status,
        escalationLevel,
        lastReminderSentAt: escalationLevel > 0 ? isoDaysAgo(ri(1, 20)) : null,
        responseText,
        respondedAt,
        verifiedBy,
        verifiedAt,
        verificationNotes,
        createdAt: recCreatedAt,
        updatedAt: verifiedAt || respondedAt || recCreatedAt,
      });
      totalRecommendations++;
    });
  }

  return { assessmentId, composite, rag, createdAt };
}

function capitalizeStr(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const seedAssessments = db.transaction(() => {
  institutions.forEach((inst, idx) => {
    // Baseline historical assessment (6-14 months ago), always Closed.
    buildAssessment(inst, { status: 'Closed', assessedDaysAgo: ri(180, 420) });

    // ~58% of institutions get a second, more recent assessment.
    if (chance(0.58)) {
      const makeLive = idx % 4 === 0; // roughly a quarter of the "second assessment" institutions
      if (makeLive) {
        const liveStatus = pick(['Draft', 'Submitted', 'UnderReview']);
        buildAssessment(inst, { status: liveStatus, assessedDaysAgo: ri(0, 6) });
      } else {
        buildAssessment(inst, { status: 'Closed', assessedDaysAgo: ri(20, 150) });
      }
    }
  });
});
seedAssessments();
console.log(`Seeded ${totalAssessments} assessments and ${totalRecommendations} auto-generated recommendations.`);

// ============================================================================
// 6. SYSTEMS REVIEWS — deep-dive, multi-reviewer, version-controlled reviews
//    (PRD Section 10.1). Targeted at higher-risk institutions, matching how
//    ZACC would prioritise deep-dive capacity in practice.
// ============================================================================
import { summarize } from '../utils/ai';

const systemsReviewers = users.filter((u) => u.role === 'SYSTEMS_REVIEWER');
const reviewTargets = institutions.filter((i) => i.riskLevel !== 'Low').slice(0, 5);

const insertReview = db.prepare(`
  INSERT INTO systems_reviews (id, institution_id, lead_reviewer_id, title, scope, status, executive_summary, ai_summary, started_at, completed_at, created_at)
  VALUES (@id, @institutionId, @leadReviewerId, @title, @scope, @status, @executiveSummary, @aiSummary, @startedAt, @completedAt, @createdAt)
`);
const insertReviewer = db.prepare(`INSERT INTO systems_review_reviewers (review_id, user_id, role_in_review) VALUES (?, ?, ?)`);
const insertDoc = db.prepare(`INSERT INTO systems_review_documents (id, review_id, title, current_version_no, created_at) VALUES (?, ?, ?, ?, ?)`);
const insertDocVersion = db.prepare(`
  INSERT INTO systems_review_document_versions (id, document_id, version_no, file_path, file_name, change_note, uploaded_by, uploaded_at)
  VALUES (@id, @documentId, @versionNo, @filePath, @fileName, @changeNote, @uploadedBy, @uploadedAt)
`);
const insertFinding = db.prepare(`
  INSERT INTO systems_review_findings (id, review_id, finding_text, category, severity, evidence_ref, duplicate_of_finding_id, similarity_score, created_by, created_at)
  VALUES (@id, @reviewId, @findingText, @category, @severity, @evidenceRef, @duplicateOfFindingId, @similarityScore, @createdBy, @createdAt)
`);

const REVIEW_STATUSES = ['Closed', 'Closed', 'Approved', 'UnderApproval', 'InProgress'];
let firstProcurementFindingId: string | null = null;

const seedReviews = db.transaction(() => {
  reviewTargets.forEach((inst, idx) => {
    const reviewId = uuid();
    const lead = pick(systemsReviewers);
    const secondReviewer = systemsReviewers.find((r) => r.id !== lead.id)!;
    const status = REVIEW_STATUSES[idx % REVIEW_STATUSES.length];
    const startedDaysAgo = ri(30, 200);
    const startedAt = isoDaysAgo(startedDaysAgo);
    const isDone = status === 'Closed' || status === 'Approved';
    const completedAt = isDone ? isoDaysAgo(Math.max(startedDaysAgo - ri(10, 25), 1)) : null;

    const longSummary = `This systems review examined governance, procurement and financial control processes at ${inst.name} over a ${ri(2, 6)}-week engagement. The review team conducted structured interviews with department heads, sampled ${ri(15, 60)} transactions across the procurement and payments cycles, and cross-referenced findings against the institution's own policy framework. Several control weaknesses were identified in the procurement cycle, particularly around segregation of duties between requisition and approval. Financial reporting timelines were found to be broadly adequate but lacking independent review at the reconciliation stage. Governance structures exist on paper but meeting minutes evidence inconsistent quorum. The review team's overall assessment is that ${inst.name} requires a structured remediation plan focused on procurement segregation of duties and strengthened internal audit coverage, with an estimated ${ri(3, 8)}-month implementation horizon for the resulting recommendations.`;

    insertReview.run({
      id: reviewId,
      institutionId: inst.id,
      leadReviewerId: lead.id,
      title: `Systems Review: ${inst.name}`,
      scope: 'Governance, Procurement Cycle, Financial Controls',
      status,
      executiveSummary: longSummary,
      aiSummary: summarize(longSummary, 3),
      startedAt,
      completedAt,
      createdAt: startedAt,
    });

    insertReviewer.run(reviewId, lead.id, 'Lead Reviewer');
    insertReviewer.run(reviewId, secondReviewer.id, 'Contributor');

    ['Procurement Process Walkthrough', 'Financial Controls Assessment'].forEach((docTitle, di) => {
      const docId = uuid();
      insertDoc.run(docId, reviewId, docTitle, di === 0 ? 2 : 1, startedAt);
      insertDocVersion.run({
        id: uuid(),
        documentId: docId,
        versionNo: 1,
        filePath: placeholderEvidencePath,
        fileName: `${docTitle.replace(/\s+/g, '_')}_v1.txt`,
        changeNote: 'Initial draft from fieldwork notes.',
        uploadedBy: lead.id,
        uploadedAt: startedAt,
      });
      if (di === 0) {
        insertDocVersion.run({
          id: uuid(),
          documentId: docId,
          versionNo: 2,
          filePath: placeholderEvidencePath,
          fileName: `${docTitle.replace(/\s+/g, '_')}_v2.txt`,
          changeNote: 'Revised after second-reviewer comments; added sampling appendix.',
          uploadedBy: secondReviewer.id,
          uploadedAt: isoDaysAgo(Math.max(startedDaysAgo - 5, 1)),
        });
      }
    });

    const findingsPool = [
      { text: 'Procurement requisitions are approved by the same officer who raises them, with no independent second signatory.', category: 'Procurement', severity: 'High' },
      { text: 'The procurement requisition and approval process lacks segregation of duties: the same officer who raises a requisition is also able to approve it.', category: 'Procurement', severity: 'High' }, // deliberate near-duplicate of the above, independently phrased
      { text: 'Bank reconciliations for the last two quarters were not independently reviewed by a second officer.', category: 'Finance', severity: 'Medium' },
      { text: 'Integrity Committee meeting minutes show quorum was not met in 3 of the last 6 scheduled meetings.', category: 'Integrity', severity: 'Medium' },
      { text: 'Fixed asset register has not been physically verified in over 18 months.', category: 'Controls', severity: 'Low' },
    ];
    const numFindings = ri(3, 5);
    const chosen = findingsPool.slice(0, numFindings);
    chosen.forEach((f) => {
      const findingId = uuid();
      insertFinding.run({
        id: findingId,
        reviewId,
        findingText: f.text,
        category: f.category,
        severity: f.severity,
        evidenceRef: 'Site fieldwork notes, Annex B',
        duplicateOfFindingId: null,
        similarityScore: null,
        createdBy: lead.id,
        createdAt: isoDaysAgo(Math.max(startedDaysAgo - ri(1, 10), 1)),
      });
      if (f.text.includes('Procurement requisitions are approved by the same officer') && !firstProcurementFindingId) {
        firstProcurementFindingId = findingId;
      }
    });
  });
});
seedReviews();
console.log(`Seeded ${reviewTargets.length} systems reviews with reviewers, versioned documents and findings.`);

// ============================================================================
// 7. INTEGRITY COMMITTEE MODULE (Section 10.1)
// ============================================================================
const insertCommittee = db.prepare(`
  INSERT INTO integrity_committees (id, institution_id, charter_text, formed_date, status, created_at)
  VALUES (@id, @institutionId, @charterText, @formedDate, 'Active', @createdAt)
`);
const insertMember = db.prepare(`
  INSERT INTO committee_members (id, committee_id, user_id, name, position, joined_date)
  VALUES (@id, @committeeId, @userId, @name, @position, @joinedDate)
`);
const insertTraining = db.prepare(`
  INSERT INTO committee_trainings (id, committee_id, member_id, training_name, training_date, completed)
  VALUES (@id, @committeeId, @memberId, @trainingName, @trainingDate, @completed)
`);
const insertMeeting = db.prepare(`
  INSERT INTO committee_meetings (id, committee_id, meeting_date, minutes_text, attendees_count, created_at)
  VALUES (@id, @committeeId, @meetingDate, @minutesText, @attendeesCount, @createdAt)
`);
const insertActionPlan = db.prepare(`
  INSERT INTO committee_action_plans (id, committee_id, description, owner, due_date, status)
  VALUES (@id, @committeeId, @description, @owner, @dueDate, @status)
`);

const MEMBER_NAME_POOL = ['Ndamo Chirairo', 'Rufaro Muzenda', 'Tapiwanashe Gono', 'Ropafadzo Mabhena', 'Kudakwashe Mhaka', 'Nomsa Khumalo', 'Tafara Chikanda', 'Anesu Zishiri'];

const seedCommittees = db.transaction(() => {
  institutionsWithUsers.forEach((inst, idx) => {
    const chair = committeeChairs[idx];
    const committeeId = uuid();
    const formedDate = isoDaysAgo(ri(200, 700));
    insertCommittee.run({
      id: committeeId,
      institutionId: inst.id,
      charterText: `Integrity Committee Charter of ${inst.name}. Established pursuant to ZACC Prevention & Corporate Governance guidance to promote ethical conduct, oversee integrity pledges, and coordinate corruption-prevention action plans within the institution.`,
      formedDate: dateOnly(formedDate),
      createdAt: formedDate,
    });

    const chairMemberId = uuid();
    insertMember.run({ id: chairMemberId, committeeId, userId: chair.id, name: chair.name, position: 'Chair', joinedDate: dateOnly(formedDate) });
    const memberIds = [chairMemberId];
    const memberCount = ri(3, 5);
    for (let i = 0; i < memberCount; i++) {
      const mid = uuid();
      insertMember.run({ id: mid, committeeId, userId: null, name: pick(MEMBER_NAME_POOL), position: i === 0 ? 'Secretary' : 'Member', joinedDate: dateOnly(formedDate) });
      memberIds.push(mid);
    }

    const trainingCount = ri(2, 4);
    for (let i = 0; i < trainingCount; i++) {
      insertTraining.run({
        id: uuid(),
        committeeId,
        memberId: chance(0.5) ? pick(memberIds) : null,
        trainingName: pick(['Anti-Corruption Fundamentals', 'Conflict of Interest Management', 'Whistleblower Protection Awareness', 'Procurement Ethics', 'ISO 37001 Orientation']),
        trainingDate: dateOnly(isoDaysAgo(ri(10, 300))),
        completed: chance(0.75) ? 1 : 0,
      });
    }

    const meetingCount = ri(2, 4);
    for (let i = 0; i < meetingCount; i++) {
      insertMeeting.run({
        id: uuid(),
        committeeId,
        meetingDate: dateOnly(isoDaysAgo(ri(5, 250))),
        minutesText: 'Quarterly Integrity Committee meeting. Reviewed outstanding action items, training completion status, and pending integrity pledge renewals. Agreed follow-up actions recorded below.',
        attendeesCount: ri(3, memberCount + 1),
        createdAt: isoDaysAgo(ri(5, 250)),
      });
    }

    const planCount = ri(1, 3);
    for (let i = 0; i < planCount; i++) {
      insertActionPlan.run({
        id: uuid(),
        committeeId,
        description: pick([
          'Roll out annual conflict-of-interest declaration to all staff',
          'Conduct integrity awareness session for new employees',
          'Review and update the institution whistleblower policy poster',
          'Complete outstanding Integrity Committee member training',
        ]),
        owner: chair.name,
        dueDate: dateOnly(isoDaysFromNow(ri(-30, 90))),
        status: pick(['Open', 'InProgress', 'Complete', 'Overdue']),
      });
    }
  });
});
seedCommittees();
console.log(`Seeded ${institutionsWithUsers.length} Integrity Committees with members, trainings, meetings and action plans.`);

// ============================================================================
// 8. INTEGRITY PLEDGE MODULE (Section 10.1) — digital signing, expiry
//    reminders, bulk upload for large institutions.
// ============================================================================
const insertPledge = db.prepare(`
  INSERT INTO pledges (id, institution_id, title, description, expiry_date, bulk_batch_id, created_by, created_at)
  VALUES (@id, @institutionId, @title, @description, @expiryDate, @bulkBatchId, @createdBy, @createdAt)
`);
const insertSignatory = db.prepare(`
  INSERT INTO pledge_signatories (id, pledge_id, name, position, institution_id, signed_at, signature_text, ip_address, expiry_reminder_sent)
  VALUES (@id, @pledgeId, @name, @position, @institutionId, @signedAt, @signatureText, @ipAddress, @expiryReminderSent)
`);

const seedPledges = db.transaction(() => {
  institutionsWithUsers.forEach((inst, idx) => {
    const pledgeId = uuid();
    const createdAt = isoDaysAgo(ri(60, 300));
    const expiresInDays = idx < 3 ? ri(5, 25) : ri(60, 400); // first 3 institutions get pledges expiring soon, to exercise the reminder job
    insertPledge.run({
      id: pledgeId,
      institutionId: inst.id,
      title: `${new Date().getFullYear()} Annual Integrity Pledge`,
      description: 'Annual institutional commitment to ethical conduct, transparency and zero tolerance of corruption, signed by institutional leadership and Integrity Committee members.',
      expiryDate: dateOnly(isoDaysFromNow(expiresInDays)),
      bulkBatchId: idx === 0 ? 'BATCH-2026-Q1-BULK' : null,
      createdBy: committeeChairs[idx].id,
      createdAt,
    });

    const signCount = idx === 0 ? 12 : ri(3, 6); // institution 0 demonstrates a bulk-uploaded batch
    for (let i = 0; i < signCount; i++) {
      insertSignatory.run({
        id: uuid(),
        pledgeId,
        name: pick(MEMBER_NAME_POOL) + (i > 0 ? ` ${i}` : ''),
        position: pick(['Department Head', 'Finance Officer', 'Procurement Officer', 'Staff Member', 'Integrity Committee Member']),
        institutionId: inst.id,
        signedAt: isoDaysAgo(ri(1, 250)),
        signatureText: pick(MEMBER_NAME_POOL),
        ipAddress: idx === 0 ? null : `10.${ri(0, 255)}.${ri(0, 255)}.${ri(1, 254)}`, // bulk-imported batch has no per-signature IP
        expiryReminderSent: 0,
      });
    }
  });
});
seedPledges();
console.log(`Seeded ${institutionsWithUsers.length} pledge instruments with signatories (including one bulk-uploaded batch).`);

// ============================================================================
// 9. CORRUPTION RISK REGISTER (Section 10.5)
// ============================================================================
const insertRisk = db.prepare(`
  INSERT INTO corruption_risks (
    id, institution_id, name, description, category, likelihood, impact, inherent_score, owner_id,
    review_date, treatment_status, linked_assessment_id, linked_review_id, created_at, updated_at
  ) VALUES (
    @id, @institutionId, @name, @description, @category, @likelihood, @impact, @inherentScore, @ownerId,
    @reviewDate, @treatmentStatus, @linkedAssessmentId, @linkedReviewId, @createdAt, @updatedAt
  )
`);
const insertMitigation = db.prepare(`
  INSERT INTO risk_mitigations (id, risk_id, description, effectiveness, implemented_date, residual_likelihood, residual_impact, residual_score, created_at)
  VALUES (@id, @riskId, @description, @effectiveness, @implementedDate, @residualLikelihood, @residualImpact, @residualScore, @createdAt)
`);

const RISK_DEFS: { name: string; description: string; category: string }[] = [
  { name: 'Single-source procurement abuse', description: 'Risk that single-sourcing justification is used to bypass competitive bidding requirements.', category: 'Procurement' },
  { name: 'Ghost employees on payroll', description: 'Risk of fictitious or departed staff remaining active on the payroll system.', category: 'HR' },
  { name: 'Unreconciled bank accounts', description: 'Risk of financial misstatement or concealment due to infrequent bank reconciliation.', category: 'Finance' },
  { name: 'Conflict of interest in tender evaluation', description: 'Risk that tender evaluators have undisclosed relationships with bidding suppliers.', category: 'Procurement' },
  { name: 'Weak asset disposal controls', description: 'Risk of state assets being disposed of below fair value without proper authorisation.', category: 'Finance' },
  { name: 'IT access control gaps', description: 'Risk of unauthorised access to financial systems due to excessive standing privileges.', category: 'IT' },
  { name: 'Nepotism in recruitment', description: 'Risk of recruitment decisions being influenced by familial or personal relationships rather than merit.', category: 'HR' },
  { name: 'Inadequate whistleblower protection awareness', description: 'Risk that staff are unaware of, or distrust, whistleblowing channels, suppressing early detection of misconduct.', category: 'Governance' },
  { name: 'Delayed asset register verification', description: 'Risk of asset loss or misappropriation going undetected due to infrequent physical verification.', category: 'Controls' },
  { name: 'Petty cash control weakness', description: 'Risk of misappropriation due to single-signatory petty cash authorisation.', category: 'Finance' },
  { name: 'Fuel and travel claim inflation', description: 'Risk of inflated mileage or fuel claims by field officers absent independent verification.', category: 'Finance' },
  { name: 'Politically exposed person (PEP) blind spot', description: 'Risk of inadequate screening of suppliers or beneficiaries connected to politically exposed persons.', category: 'Governance' },
];

const riskOwnerPool = users.filter((u) => ['COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER'].includes(u.role));
const closedAssessmentIds = db.prepare(`SELECT id, institution_id FROM assessments WHERE status = 'Closed'`).all() as { id: string; institution_id: string }[];
const reviewIds = db.prepare(`SELECT id, institution_id FROM systems_reviews`).all() as { id: string; institution_id: string }[];

const seedRisks = db.transaction(() => {
  RISK_DEFS.forEach((def, i) => {
    const inst = pick(institutions.filter((x) => x.riskLevel !== 'Low'));
    const likelihood = ri(2, 5);
    const impact = ri(2, 5);
    const inherent = riskScore(likelihood, impact);
    const treatment = pick(['Open', 'Open', 'Mitigated', 'Accepted', 'Transferred']);
    const linkedAssessment = chance(0.4) ? closedAssessmentIds.find((a) => a.institution_id === inst.id) : null;
    const linkedReview = chance(0.3) ? reviewIds.find((r) => r.institution_id === inst.id) : null;
    const riskId = uuid();
    const createdAt = isoDaysAgo(ri(30, 300));

    insertRisk.run({
      id: riskId,
      institutionId: inst.id,
      name: def.name,
      description: def.description,
      category: def.category,
      likelihood,
      impact,
      inherentScore: inherent,
      ownerId: pick(riskOwnerPool).id,
      reviewDate: dateOnly(isoDaysFromNow(ri(-20, 120))),
      treatmentStatus: treatment,
      linkedAssessmentId: linkedAssessment ? linkedAssessment.id : null,
      linkedReviewId: linkedReview ? linkedReview.id : null,
      createdAt,
      updatedAt: createdAt,
    });

    if (treatment === 'Mitigated' || chance(0.4)) {
      const effectiveness = pick<'Low' | 'Medium' | 'High'>(['Low', 'Medium', 'High']);
      const residual = residualScoreFromEffectiveness(inherent, effectiveness);
      insertMitigation.run({
        id: uuid(),
        riskId,
        description: pick([
          'Introduced dual-authorisation requirement for transactions above threshold.',
          'Implemented quarterly independent reconciliation review.',
          'Deployed role-based access control review on financial systems.',
          'Established rotation policy for tender evaluation panel members.',
        ]),
        effectiveness,
        implementedDate: dateOnly(isoDaysAgo(ri(5, 150))),
        residualLikelihood: Math.max(1, Math.round(likelihood * 0.6)),
        residualImpact: Math.max(1, Math.round(impact * 0.7)),
        residualScore: residual,
        createdAt: isoDaysAgo(ri(1, 140)),
      });
    }
  });
});
seedRisks();
console.log(`Seeded ${RISK_DEFS.length} corruption risk register entries with mitigations.`);

// ============================================================================
// 10. PROCUREMENT MONITORING (Section 10.1) — records are inserted in
//     chronological order and run through the SAME red-flag rule engine used
//     by the live API, so the seeded red flags are genuinely computed, not
//     hand-authored.
// ============================================================================
const insertProcurement = db.prepare(`
  INSERT INTO procurement_records (id, institution_id, description, value, currency, method, supplier_name, contract_number, procurement_date, source, red_flags, created_at)
  VALUES (@id, @institutionId, @description, @value, 'USD', @method, @supplierName, @contractNumber, @procurementDate, @source, @redFlags, @createdAt)
`);

const SUPPLIERS = ['Ruvimbo Trading (Pvt) Ltd', 'Zvishavane Hardware Suppliers', 'TechBridge Solutions Zimbabwe', 'Kwame General Dealers', 'Nyati Construction Co.', 'Prime Office Solutions', 'Golden Harvest Logistics', 'Apex Fleet Services', 'Masasa Stationery Wholesalers', 'Chiedza Civil Works'];
const METHODS = ['OpenTender', 'RestrictedTender', 'RequestForQuotations', 'SingleSource', 'Framework'];
const PROC_DESCRIPTIONS = ['Office furniture supply', 'Fleet vehicle maintenance contract', 'IT equipment procurement', 'Building refurbishment works', 'Stationery annual supply', 'Security services contract', 'Catering services for training workshops', 'Road maintenance equipment hire'];

function seedProcurementRecord(rec: { institutionId: string; description: string; value: number; method: string; supplierName: string; contractNumber: string | null; procurementDate: string; source?: string }) {
  const flags = evaluateRedFlags({
    institution_id: rec.institutionId,
    supplier_name: rec.supplierName,
    contract_number: rec.contractNumber,
    value: rec.value,
    method: rec.method,
    procurement_date: rec.procurementDate,
  });
  insertProcurement.run({
    id: uuid(),
    institutionId: rec.institutionId,
    description: rec.description,
    value: rec.value,
    method: rec.method,
    supplierName: rec.supplierName,
    contractNumber: rec.contractNumber,
    procurementDate: rec.procurementDate,
    source: rec.source ?? 'Manual',
    redFlags: flags.length > 0 ? JSON.stringify(flags) : null,
    createdAt: new Date(rec.procurementDate).toISOString(),
  });
  return flags;
}

const seedProcurement = db.transaction(() => {
  let flagCount = 0;
  let contractCounter = 1;

  // 24 baseline "normal" records, one per institution, spread across the last 5 months.
  institutions.forEach((inst) => {
    const daysAgo = ri(10, 150);
    const flags = seedProcurementRecord({
      institutionId: inst.id,
      description: pick(PROC_DESCRIPTIONS),
      value: ri(2000, 22000),
      method: pick(METHODS),
      supplierName: pick(SUPPLIERS),
      contractNumber: `ZW-CN-2026-${String(contractCounter++).padStart(4, '0')}`,
      procurementDate: dateOnly(isoDaysAgo(daysAgo)),
      source: chance(0.3) ? 'eGP_Sync' : 'Manual',
    });
    if (flags.length) flagCount++;
  });

  // Deliberate: single-source award above threshold.
  seedProcurementRecord({
    institutionId: pick(institutions).id,
    description: 'Emergency generator supply (single-source justification)',
    value: 45000,
    method: 'SingleSource',
    supplierName: 'TechBridge Solutions Zimbabwe',
    contractNumber: `ZW-CN-2026-${String(contractCounter++).padStart(4, '0')}`,
    procurementDate: dateOnly(isoDaysAgo(20)),
  });

  // Deliberate: missing contract number.
  seedProcurementRecord({
    institutionId: pick(institutions).id,
    description: 'Ad-hoc catering services',
    value: 8500,
    method: 'RequestForQuotations',
    supplierName: 'Masasa Stationery Wholesalers',
    contractNumber: null,
    procurementDate: dateOnly(isoDaysAgo(35)),
  });

  // Deliberate: duplicate contract number reused across two unrelated awards.
  const dupInstA = institutions[3];
  const dupInstB = institutions[9];
  seedProcurementRecord({ institutionId: dupInstA.id, description: 'Vehicle fleet servicing', value: 14000, method: 'RestrictedTender', supplierName: 'Apex Fleet Services', contractNumber: 'ZW-CN-2026-0099', procurementDate: dateOnly(isoDaysAgo(50)) });
  seedProcurementRecord({ institutionId: dupInstB.id, description: 'Office refurbishment', value: 17500, method: 'OpenTender', supplierName: 'Chiedza Civil Works', contractNumber: 'ZW-CN-2026-0099', procurementDate: dateOnly(isoDaysAgo(45)) });

  // Deliberate: possible split purchase — same institution + supplier, two awards 10 days apart, combined over threshold.
  const splitInst = institutions[6];
  seedProcurementRecord({ institutionId: splitInst.id, description: 'IT equipment procurement (batch 1)', value: 22000, method: 'RequestForQuotations', supplierName: 'Golden Harvest Logistics', contractNumber: `ZW-CN-2026-${String(contractCounter++).padStart(4, '0')}`, procurementDate: dateOnly(isoDaysAgo(28)) });
  seedProcurementRecord({ institutionId: splitInst.id, description: 'IT equipment procurement (batch 2)', value: 21000, method: 'RequestForQuotations', supplierName: 'Golden Harvest Logistics', contractNumber: `ZW-CN-2026-${String(contractCounter++).padStart(4, '0')}`, procurementDate: dateOnly(isoDaysAgo(18)) });

  // Deliberate: supplier concentration across 3+ institutions within 60 days.
  const concInsts = [institutions[1], institutions[11], institutions[18]];
  concInsts.forEach((inst, i) => {
    seedProcurementRecord({
      institutionId: inst.id,
      description: 'Security services contract',
      value: ri(9000, 15000),
      method: 'RestrictedTender',
      supplierName: 'Prime Office Solutions',
      contractNumber: `ZW-CN-2026-${String(contractCounter++).padStart(4, '0')}`,
      procurementDate: dateOnly(isoDaysAgo(40 - i * 10)),
    });
  });

  console.log(`Seeded procurement records with ${flagCount} baseline red flags plus 6 deliberately-crafted flag scenarios.`);
});
seedProcurement();

// ============================================================================
// 11. WHISTLEBLOWER REPORTING (Section 10.1, 19, 20.3) — every seeded report
//     is genuinely RSA/AES encrypted through the exact same code path a real
//     browser submission uses (see utils/crypto.ts encryptForSeed), so the
//     Investigations Officer demo account can really decrypt them. No IP
//     address or submitter identity is stored anywhere, by design.
// ============================================================================
const insertWbReport = db.prepare(`
  INSERT INTO whistleblower_reports (id, tracking_code, category, institution_id, institution_freetext, encrypted_payload, encrypted_key, iv, status, assigned_investigator_id, referral_ecms_case_id, created_at, updated_at)
  VALUES (@id, @trackingCode, @category, @institutionId, @institutionFreetext, @payload, @encryptedKey, @iv, @status, @assignedInvestigatorId, @referralEcmsCaseId, @createdAt, @updatedAt)
`);
const insertWbUpdate = db.prepare(`
  INSERT INTO whistleblower_status_updates (id, report_id, status, note, created_at)
  VALUES (@id, @reportId, @status, @note, @createdAt)
`);
const insertWbAccess = db.prepare(`
  INSERT INTO whistleblower_access_log (id, report_id, user_id, action, created_at)
  VALUES (@id, @reportId, @userId, @action, @createdAt)
`);

const investigationsOfficer = users.find((u) => u.role === 'INVESTIGATIONS_OFFICER')!;

interface WbSeed {
  category: string;
  institution: SeedInstitution | null;
  freetext: string | null;
  narrative: string;
  status: string;
  daysAgo: number;
  ecmsCase?: string;
  updates?: { status: string; note: string; daysAgo: number }[];
}

const wbReports: WbSeed[] = [
  {
    category: 'Procurement',
    institution: institutions[8],
    freetext: null,
    narrative: 'I work in the procurement section and have seen the same supplier win three separate tenders in the last two months, each just under the amount that would require competitive bidding. Documents are backdated to make it look compliant.',
    status: 'Received',
    daysAgo: 2,
  },
  {
    category: 'Financial Mismanagement',
    institution: institutions[2],
    freetext: null,
    narrative: 'Fuel coupons allocated to senior management vehicles are being redeemed at a rate far exceeding actual usage. I believe coupons are being resold. I can provide the vehicle log discrepancies if a secure channel is available.',
    status: 'UnderReview',
    daysAgo: 10,
    updates: [{ status: 'UnderReview', note: 'Triaged and assigned for preliminary review.', daysAgo: 9 }],
  },
  {
    category: 'Abuse of Office',
    institution: institutions[14],
    freetext: null,
    narrative: 'A senior manager awarded a relative a supply contract without disclosing the family relationship on the conflict-of-interest register. The contract value is well above the single-source threshold.',
    status: 'Referred',
    daysAgo: 25,
    ecmsCase: 'ECMS-2026-0341',
    updates: [
      { status: 'UnderReview', note: 'Initial triage complete; corroborating evidence requested from institution HR records.', daysAgo: 20 },
      { status: 'Referred', note: 'Sufficient indicators of possible criminal conduct; referred to Investigations (ECMS-2026-0341).', daysAgo: 12 },
    ],
  },
  {
    category: 'Nepotism',
    institution: null,
    freetext: 'A rural clinic construction project in a district I would rather not name in this initial report',
    narrative: 'The contractor building a rural clinic is the cousin of the district administrator. Community members were not consulted on the contractor selection as required by policy.',
    status: 'Insufficient',
    daysAgo: 40,
    updates: [{ status: 'Insufficient', note: 'Unable to corroborate without further identifying detail; reporter invited to provide additional information via tracking code if comfortable doing so.', daysAgo: 30 }],
  },
  {
    category: 'Financial Mismanagement',
    institution: institutions[20],
    freetext: null,
    narrative: 'Petty cash records for the last financial year show repeated withdrawals just under the authorisation limit, always approved by the same single officer despite policy requiring dual sign-off.',
    status: 'Closed',
    daysAgo: 90,
    updates: [
      { status: 'UnderReview', note: 'Confirmed pattern consistent with the report during preliminary review.', daysAgo: 80 },
      { status: 'Closed', note: 'Matter referred to institution management for corrective action; dual-authorisation control now enforced. Case closed.', daysAgo: 55 },
    ],
  },
  {
    category: 'Other',
    institution: institutions[16],
    freetext: null,
    narrative: 'I want to report that mining equipment registered to the company appears to be used on unrelated private sites on weekends without any hire agreement on file.',
    status: 'Received',
    daysAgo: 1,
  },
  {
    category: 'Procurement',
    institution: institutions[5],
    freetext: null,
    narrative: 'Council tender documents for the borehole rehabilitation project were only made available to bidders 2 days before the submission deadline, well short of the required notice period, which appears designed to favour a pre-selected bidder.',
    status: 'UnderReview',
    daysAgo: 15,
    updates: [{ status: 'UnderReview', note: 'Tender timeline being cross-checked against PRAZ eGP records.', daysAgo: 13 }],
  },
];

const seedWhistleblower = db.transaction(() => {
  wbReports.forEach((wb) => {
    const enc = encryptForSeed(wb.narrative);
    const reportId = uuid();
    const createdAt = isoDaysAgo(wb.daysAgo);
    const needsInvestigator = wb.status !== 'Received';
    insertWbReport.run({
      id: reportId,
      trackingCode: generateTrackingCode(),
      category: wb.category,
      institutionId: wb.institution ? wb.institution.id : null,
      institutionFreetext: wb.freetext,
      payload: enc.payload,
      encryptedKey: enc.encryptedKey,
      iv: enc.iv,
      status: wb.status,
      assignedInvestigatorId: needsInvestigator ? investigationsOfficer.id : null,
      referralEcmsCaseId: wb.ecmsCase ?? null,
      createdAt,
      updatedAt: wb.updates && wb.updates.length ? isoDaysAgo(wb.updates[wb.updates.length - 1].daysAgo) : createdAt,
    });

    (wb.updates ?? []).forEach((u) => {
      insertWbUpdate.run({ id: uuid(), reportId, status: u.status, note: u.note, createdAt: isoDaysAgo(u.daysAgo) });
      // Every status change by an investigator is itself an access-log event —
      // guaranteeing the "specific, named investigation teams" audit trail (Section 20.3).
      insertWbAccess.run({ id: uuid(), reportId, userId: investigationsOfficer.id, action: `Status changed to ${u.status}`, createdAt: isoDaysAgo(u.daysAgo) });
    });
    if (needsInvestigator) {
      insertWbAccess.run({ id: uuid(), reportId, userId: investigationsOfficer.id, action: 'Decrypted and viewed report', createdAt: isoDaysAgo(Math.max(wb.daysAgo - 1, 0)) });
    }
  });
});
seedWhistleblower();
console.log(`Seeded ${wbReports.length} whistleblower reports, genuinely RSA/AES encrypted end-to-end.`);

// ============================================================================
// 12. NOTIFICATION PREFERENCES — demonstrate the preference centre actually
//     changes dispatch behaviour for one user.
// ============================================================================
const smsOptOutUser = users.find((u) => u.role === 'MONITORING_OFFICER');
if (smsOptOutUser) {
  db.prepare(`INSERT INTO user_notification_preferences (user_id, channel, enabled) VALUES (?, 'sms', 0)`).run(smsOptOutUser.id);
  console.log(`Demo notification preference: ${smsOptOutUser.name} has opted out of SMS.`);
}

// ============================================================================
// DONE
// ============================================================================
console.log('\n================================================================');
console.log(' ZACC INSTITUTIONAL COMPLIANCE PORTAL — DEMO DATA READY');
console.log('================================================================');
console.log(` Shared demo password for every seeded account: ${DEMO_PASSWORD}`);
console.log(' Sign in as any of:');
users.forEach((u) => console.log(`   ${u.role.padEnd(26)} ${u.email}`));
console.log(`   ${'INSTITUTION_FOCAL_PERSON'.padEnd(26)} ${focalPersons[0].email}  (institution: ${institutionsWithUsers[0].name})`);
console.log(`   ${'INTEGRITY_COMMITTEE_CHAIR'.padEnd(26)} ${committeeChairs[0].email}  (institution: ${institutionsWithUsers[0].name})`);
console.log('================================================================\n');
