-- ============================================================================
-- ZACC INSTITUTIONAL COMPLIANCE PORTAL — DATABASE SCHEMA
-- Implements PRD v4.0 Section 13 (Database Design & ERM) in full.
-- SQLite (via better-sqlite3). Foreign keys enforced. UUIDs as TEXT PKs.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. IDENTITY & ACCESS (Section 19.1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'SUPER_ADMIN','COMMISSION_CHAIR','PREVENTION_COMMITTEE','EXECUTIVE_SECRETARY','GM_PREVENTION',
    'MANAGER_COMPLIANCE','PROVINCIAL_HEAD','COMPLIANCE_OFFICER','SYSTEMS_REVIEWER','MONITORING_OFFICER',
    'AUDITOR','INVESTIGATIONS_OFFICER','INSTITUTION_FOCAL_PERSON','INTEGRITY_COMMITTEE_CHAIR'
  )),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  institution_id TEXT REFERENCES institutions(id),
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  province TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 2. INSTITUTIONAL REGISTRY (Section 10.1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Ministry','Local Authority','State-Owned Enterprise','Private Entity','Parastatal')),
  sector TEXT NOT NULL,
  ownership TEXT NOT NULL CHECK (ownership IN ('Public','Private','Parastatal')),
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  risk_level TEXT NOT NULL DEFAULT 'Medium' CHECK (risk_level IN ('Low','Medium','High')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  focal_person_user_id TEXT REFERENCES users(id),
  registration_no TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS institution_history (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 3. COMPLIANCE ASSESSMENT MODULE (Section 10.1, acceptance criteria)
-- Weighted: Governance 20%, Internal Controls 25%, Procurement 20%,
--           Financial Management 20%, Integrity 15%
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  officer_id TEXT NOT NULL REFERENCES users(id),
  scheduled_date TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','UnderReview','Returned','Approved','Closed')),
  governance_score REAL,
  controls_score REAL,
  procurement_score REAL,
  finance_score REAL,
  integrity_score REAL,
  composite_score REAL,
  rag_status TEXT CHECK (rag_status IN ('Red','Amber','Green')),
  findings_text TEXT,
  ai_summary TEXT,
  geotag_lat REAL,
  geotag_lng REAL,
  submitted_at TEXT,
  sla_due_at TEXT,
  escalated INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT REFERENCES users(id),
  review_notes TEXT,
  approved_at TEXT,
  closed_at TEXT,
  referred_to_investigations INTEGER NOT NULL DEFAULT 0,
  ecms_case_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessment_checklist_items (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  section TEXT NOT NULL CHECK (section IN ('governance','controls','procurement','finance','integrity')),
  item_text TEXT NOT NULL,
  response TEXT CHECK (response IN ('Compliant','PartiallyCompliant','NonCompliant','NotApplicable')),
  score REAL,
  comments TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assessment_evidence (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 4. SYSTEMS REVIEW MODULE (Section 10.1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS systems_reviews (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  lead_reviewer_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  scope TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','InProgress','UnderApproval','Approved','Closed')),
  executive_summary TEXT,
  ai_summary TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  escalated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS systems_review_reviewers (
  review_id TEXT NOT NULL REFERENCES systems_reviews(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role_in_review TEXT DEFAULT 'Contributor',
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS systems_review_documents (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES systems_reviews(id),
  title TEXT NOT NULL,
  current_version_no INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS systems_review_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES systems_review_documents(id),
  version_no INTEGER NOT NULL,
  file_path TEXT,
  file_name TEXT,
  change_note TEXT,
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS systems_review_findings (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES systems_reviews(id),
  finding_text TEXT NOT NULL,
  category TEXT,
  severity TEXT CHECK (severity IN ('Low','Medium','High','Critical')),
  evidence_ref TEXT,
  duplicate_of_finding_id TEXT REFERENCES systems_review_findings(id),
  similarity_score REAL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 5. RECOMMENDATION TRACKING (Section 10.1, 9.2 state model)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('Assessment','SystemsReview','Engagement','OAG','InternalAudit','Media')),
  source_id TEXT NOT NULL,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  description TEXT NOT NULL,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  assigned_to_user_id TEXT REFERENCES users(id),
  owner_name TEXT,
  responsibility TEXT,
  time_frame TEXT,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Created' CHECK (status IN ('Created','Assigned','ResponseSubmitted','Verified','Closed','Incomplete')),
  escalation_level INTEGER NOT NULL DEFAULT 0,
  last_reminder_sent_at TEXT,
  response_text TEXT,
  response_evidence_path TEXT,
  responded_at TEXT,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  verification_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 6. INTEGRITY COMMITTEE MODULE (Section 10.1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrity_committees (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  charter_text TEXT,
  formed_date TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS committee_members (
  id TEXT PRIMARY KEY,
  committee_id TEXT NOT NULL REFERENCES integrity_committees(id),
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'Member' CHECK (position IN ('Chair','Secretary','Member')),
  joined_date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS committee_trainings (
  id TEXT PRIMARY KEY,
  committee_id TEXT NOT NULL REFERENCES integrity_committees(id),
  member_id TEXT REFERENCES committee_members(id),
  training_name TEXT NOT NULL,
  training_date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS committee_meetings (
  id TEXT PRIMARY KEY,
  committee_id TEXT NOT NULL REFERENCES integrity_committees(id),
  meeting_date TEXT NOT NULL,
  minutes_text TEXT,
  attendees_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS committee_action_plans (
  id TEXT PRIMARY KEY,
  committee_id TEXT NOT NULL REFERENCES integrity_committees(id),
  description TEXT NOT NULL,
  owner TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','InProgress','Complete','Overdue'))
);

-- ----------------------------------------------------------------------------
-- 7. INTEGRITY PLEDGE MODULE (Section 10.1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pledges (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  title TEXT NOT NULL,
  description TEXT,
  expiry_date TEXT,
  bulk_batch_id TEXT,
  engagement_id TEXT,
  ceremony_date TEXT,
  commissioner_of_oaths TEXT,
  copies_printed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pledge_signatories (
  id TEXT PRIMARY KEY,
  pledge_id TEXT NOT NULL REFERENCES pledges(id),
  name TEXT NOT NULL,
  position TEXT,
  institution_id TEXT REFERENCES institutions(id),
  signed_at TEXT NOT NULL DEFAULT (datetime('now')),
  signature_text TEXT NOT NULL,
  ip_address TEXT,
  expiry_reminder_sent INTEGER NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- 8. WHISTLEBLOWER REPORTING MODULE (Section 10.1, 20.3 Restricted tier)
-- Hybrid RSA/AES client-side encryption: server never sees plaintext except
-- when an authorised Investigations Officer explicitly decrypts (logged).
-- No IP / identity captured on submission — guaranteed anonymity.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whistleblower_reports (
  id TEXT PRIMARY KEY,
  tracking_code TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  institution_id TEXT REFERENCES institutions(id),
  institution_freetext TEXT,
  encrypted_payload TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Received' CHECK (status IN ('Received','UnderReview','Referred','Closed','Insufficient')),
  assigned_investigator_id TEXT REFERENCES users(id),
  referral_ecms_case_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS whistleblower_status_updates (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES whistleblower_reports(id),
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS whistleblower_access_log (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES whistleblower_reports(id),
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 9. CORRUPTION RISK REGISTER (Section 10.5)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS corruption_risks (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  likelihood INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  inherent_score INTEGER,
  owner_id TEXT REFERENCES users(id),
  review_date TEXT,
  treatment_status TEXT NOT NULL DEFAULT 'Open' CHECK (treatment_status IN ('Open','Mitigated','Accepted','Transferred','Avoided')),
  linked_assessment_id TEXT REFERENCES assessments(id),
  linked_review_id TEXT REFERENCES systems_reviews(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS risk_mitigations (
  id TEXT PRIMARY KEY,
  risk_id TEXT NOT NULL REFERENCES corruption_risks(id),
  description TEXT NOT NULL,
  effectiveness TEXT NOT NULL CHECK (effectiveness IN ('Low','Medium','High')),
  implemented_date TEXT,
  residual_likelihood INTEGER CHECK (residual_likelihood BETWEEN 1 AND 5),
  residual_impact INTEGER CHECK (residual_impact BETWEEN 1 AND 5),
  residual_score INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 10. PROCUREMENT MONITORING (Section 10.1, PRAZ eGP integration)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurement_records (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  description TEXT NOT NULL,
  value REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT NOT NULL CHECK (method IN ('OpenTender','RestrictedTender','RequestForQuotations','SingleSource','Framework')),
  supplier_name TEXT NOT NULL,
  contract_number TEXT,
  procurement_date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Manual' CHECK (source IN ('Manual','eGP_Sync')),
  red_flags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 11. NOTIFICATION SERVICE (Section 10.2)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','in_app')),
  subject_template TEXT,
  body_template TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  template_code TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  related_entity_type TEXT,
  related_entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  to_address TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  related_notification_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sms_outbox (
  id TEXT PRIMARY KEY,
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  related_notification_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','in_app')),
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, channel)
);

-- ----------------------------------------------------------------------------
-- 12. WORKFLOW ENGINE (Section 10.3)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_configs (
  id TEXT PRIMARY KEY,
  workflow_type TEXT UNIQUE NOT NULL,
  sla_days INTEGER NOT NULL,
  escalate_to_role TEXT NOT NULL,
  reminder_intervals TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflow_history (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 13. AUDIT LOG (Section 19, immutable, cross-cutting)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Indexes for common query patterns
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_assessments_institution ON assessments(institution_id);
CREATE INDEX IF NOT EXISTS idx_assessments_officer ON assessments(officer_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_due ON recommendations(due_date);
CREATE INDEX IF NOT EXISTS idx_recommendations_institution ON recommendations(institution_id);
CREATE INDEX IF NOT EXISTS idx_risks_institution ON corruption_risks(institution_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_institutions_province ON institutions(province);
CREATE INDEX IF NOT EXISTS idx_procurement_institution ON procurement_records(institution_id);
CREATE INDEX IF NOT EXISTS idx_wb_tracking ON whistleblower_reports(tracking_code);



-- ============================================================================
-- 10. ENGAGEMENTS — the Unit's SOP lifecycle (Compliance, Systems and Processes
-- Review Unit SOPs v01). One model for: compliance assessments (spot / desk /
-- comprehensive; RFD, RR, PCC methods), systems reviews, monitoring of audit
-- recommendations, government projects, government programmes, integrity
-- committee initiatives, integrity committee training and pledge signing.
-- ============================================================================
CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  sop_type TEXT NOT NULL CHECK (sop_type IN ('ComplianceAssessment','SystemsReview','AuditRecsMonitoring','GovtProjectsMonitoring','GovtProgramsMonitoring','ICInitiativesMonitoring','ICTraining','PledgeSigning')),
  method TEXT CHECK (method IN ('RFD','RR','PCC')),
  scope_kind TEXT CHECK (scope_kind IN ('SpotCheck','DeskCheck','Comprehensive')),
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  programme_id TEXT,
  title TEXT NOT NULL,
  origin_source TEXT NOT NULL DEFAULT 'RoutineProgramme' CHECK (origin_source IN ('PublicComplaint','MediaReport','AuditReport','DepartmentReferral','InstitutionInvitation','RoutineProgramme','PreviousFindings','ManagementDirective','NationalPriority','Other')),
  origin_detail TEXT,
  location_type TEXT NOT NULL DEFAULT 'HQ' CHECK (location_type IN ('HQ','Provincial')),
  background TEXT,
  rationale TEXT,
  scope_text TEXT,
  allegations TEXT NOT NULL DEFAULT '[]',
  objectives TEXT NOT NULL DEFAULT '[]',
  methodology TEXT NOT NULL DEFAULT '[]',
  expected_outcomes TEXT NOT NULL DEFAULT '[]',
  start_date TEXT,
  end_date TEXT,
  days INTEGER,
  -- preliminary assessment (2 working days)
  credibility TEXT CHECK (credibility IN ('Credible','PartlyCredible','NotCredible','NotApplicable')),
  prelim_notes TEXT,
  prelim_completed_at TEXT,
  deployment_justified INTEGER,
  -- lifecycle
  status TEXT NOT NULL DEFAULT 'Preliminary' CHECK (status IN (
    'Preliminary','ConceptDraft','ConceptReview','Approved','Notified','Fieldwork','IMReview','ReportDraft','ReportReview','Committee','Commission','Completed','Monitoring','Closed','Rejected','Cancelled')),
  current_step TEXT,
  step_due_at TEXT,
  escalated INTEGER NOT NULL DEFAULT 0,
  -- notification letter (drafted within 2 days of approval, signed by Executive Secretary)
  notification_ref TEXT,
  notification_signed_at TEXT,
  notification_due_at TEXT,
  -- implementation matrix
  im_status TEXT NOT NULL DEFAULT 'None' CHECK (im_status IN ('None','Draft','ClientReview','Adopted','Signed')),
  im_client_signatory TEXT,
  im_client_signed_at TEXT,
  im_adopted_at TEXT,
  -- outcome
  compliance_level TEXT CHECK (compliance_level IN ('Red','Amber','Green')),
  conclusion TEXT,
  report_draft_due_at TEXT,
  commission_decision TEXT,
  completed_at TEXT,
  monitoring_due_at TEXT,
  output_data TEXT NOT NULL DEFAULT '{}',
  alerts_sent TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS engagement_team (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  team_role TEXT NOT NULL DEFAULT 'Member' CHECK (team_role IN ('TeamLeader','FocalPerson','Member'))
);

-- Approval / review trail for the three flows: Concept, IM, Report
CREATE TABLE IF NOT EXISTS engagement_steps (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  flow TEXT NOT NULL CHECK (flow IN ('Preliminary','Concept','IM','Report','Notification')),
  step TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('Submitted','Recommended','Approved','Returned','Rejected','Noted')),
  comment TEXT,
  actor_user_id TEXT REFERENCES users(id),
  due_at TEXT,
  on_time INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS engagement_budget_lines (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  unit TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0,
  persons INTEGER NOT NULL DEFAULT 1,
  days INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS engagement_itinerary (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  day_no INTEGER NOT NULL,
  activity_date TEXT,
  location TEXT,
  activity TEXT NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'Interview' CHECK (activity_type IN ('Travel','EntranceMeeting','Interview','Verification','DocumentAnalysis','ReportWriting','ExitMeeting','Training','Signing','Other')),
  distance_km REAL,
  latitude REAL,
  longitude REAL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Request for Documents (RFD) register
CREATE TABLE IF NOT EXISTS engagement_documents (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  document TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  due_date TEXT,
  received_at TEXT,
  status TEXT NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested','Received','Outstanding','NotAvailable')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS engagement_meetings (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('Entrance','Exit')),
  held_at TEXT,
  attendees TEXT,
  summary TEXT,
  focal_person_designated TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS engagement_interviews (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  interviewee TEXT NOT NULL,
  position TEXT,
  interview_date TEXT,
  minutes TEXT,
  recorded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Findings = rows of the Implementation Matrix
CREATE TABLE IF NOT EXISTS engagement_findings (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  issue TEXT NOT NULL,
  finding_points TEXT NOT NULL DEFAULT '[]',
  legal_reference TEXT,
  category TEXT,
  severity TEXT NOT NULL DEFAULT 'Medium' CHECK (severity IN ('Low','Medium','High','Critical')),
  compliance_rating TEXT NOT NULL DEFAULT 'NonCompliant' CHECK (compliance_rating IN ('Compliant','PartiallyCompliant','NonCompliant')),
  recommendation TEXT,
  responsibility TEXT,
  time_frame TEXT NOT NULL DEFAULT 'Immediate',
  due_date TEXT,
  referred_to_investigations INTEGER NOT NULL DEFAULT 0,
  client_response TEXT,
  implementation_status TEXT NOT NULL DEFAULT 'Open' CHECK (implementation_status IN ('Open','InProgress','Implemented','Verified','NotImplemented')),
  verified_at TEXT,
  recommendation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3-month monitoring visits (Manual s14) feeding the ECMD
CREATE TABLE IF NOT EXISTS monitoring_visits (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  notice_sent_at TEXT,
  visit_date TEXT,
  summary TEXT,
  implemented_count INTEGER,
  total_count INTEGER,
  overall_level TEXT CHECK (overall_level IN ('Red','Amber','Green')),
  recorded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compliance_certificates (
  id TEXT PRIMARY KEY,
  certificate_no TEXT UNIQUE NOT NULL,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  engagement_id TEXT REFERENCES engagements(id),
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT NOT NULL,
  issued_by TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Expired','Revoked'))
);

-- Non-compliance consequences notified to sector regulators (Manual s17)
CREATE TABLE IF NOT EXISTS regulator_notices (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  engagement_id TEXT REFERENCES engagements(id),
  measure TEXT NOT NULL CHECK (measure IN ('LimitedDevolutionFunds','SuspendGovtContracts','SuspendTaxHolidays','StockExchangeDelisting','Other')),
  regulator TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Proposed' CHECK (status IN ('Proposed','Approved','Notified','Lifted')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 11. MONITORED GOVERNMENT PROJECTS / PROGRAMMES (SOPs: monitoring of
-- government funded projects and programmes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS monitored_programmes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('Project','Programme')),
  name TEXT NOT NULL,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  source TEXT NOT NULL DEFAULT 'NationalPriority' CHECK (source IN ('NationalPriority','NationalInterest','FiscalPolicy','MonetaryPolicy','Other')),
  scope TEXT,
  budget_usd REAL,
  spent_usd REAL NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  reported_progress REAL NOT NULL DEFAULT 0,
  verified_progress REAL,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Planned','Active','Delayed','Completed','Stalled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS programme_progress_reports (
  id TEXT PRIMARY KEY,
  programme_id TEXT NOT NULL REFERENCES monitored_programmes(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  reported_progress REAL NOT NULL,
  spent_usd REAL,
  narrative TEXT,
  verified_progress REAL,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 12. AUDIT FINDINGS LIBRARY (OAG / internal audit / IPSAS) and FUND ACQUITTALS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_findings (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  source TEXT NOT NULL CHECK (source IN ('OAG','InternalAudit','Media')),
  report_year INTEGER NOT NULL,
  opinion TEXT,
  finding_text TEXT NOT NULL,
  ipsas_ref TEXT,
  category TEXT,
  amount_usd REAL,
  repeat_finding INTEGER NOT NULL DEFAULT 0,
  recommendation TEXT,
  recommendation_id TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fund_disbursements (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  fund TEXT NOT NULL CHECK (fund IN ('ZINARA','Devolution','Other')),
  fiscal_year INTEGER NOT NULL,
  quarter INTEGER CHECK (quarter BETWEEN 1 AND 4),
  amount_disbursed REAL NOT NULL,
  amount_spent REAL NOT NULL DEFAULT 0,
  legacy_debt_paid REAL NOT NULL DEFAULT 0,
  acquitted INTEGER NOT NULL DEFAULT 0,
  acquittal_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 13. INTEGRITY COMMITTEE DELIVERABLES & RETURNS (IC training / initiatives SOPs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ic_deliverables (
  id TEXT PRIMARY KEY,
  committee_id TEXT NOT NULL REFERENCES integrity_committees(id),
  item TEXT NOT NULL CHECK (item IN ('CorruptionRiskMatrix','IntegrityActionPlan','IntegrityCharter','Workplan')),
  due_date TEXT NOT NULL,
  submitted_at TEXT,
  status TEXT NOT NULL DEFAULT 'Due' CHECK (status IN ('Due','Submitted','Overdue'))
);

CREATE TABLE IF NOT EXISTS ic_quarterly_reports (
  id TEXT PRIMARY KEY,
  committee_id TEXT NOT NULL REFERENCES integrity_committees(id),
  period TEXT NOT NULL,
  summary TEXT,
  actions_completed INTEGER,
  actions_planned INTEGER,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_annual_impact INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ic_return_forms (
  id TEXT PRIMARY KEY,
  engagement_id TEXT REFERENCES engagements(id),
  committee_id TEXT NOT NULL REFERENCES integrity_committees(id),
  training_date TEXT NOT NULL,
  member_count INTEGER,
  has_hrm INTEGER NOT NULL DEFAULT 0,
  has_legal INTEGER NOT NULL DEFAULT 0,
  has_audit INTEGER NOT NULL DEFAULT 0,
  topics TEXT,
  trainers TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_eng_institution ON engagements(institution_id);
CREATE INDEX IF NOT EXISTS idx_eng_status ON engagements(status);
CREATE INDEX IF NOT EXISTS idx_eng_step ON engagements(current_step);
CREATE INDEX IF NOT EXISTS idx_eng_findings ON engagement_findings(engagement_id);
CREATE INDEX IF NOT EXISTS idx_eng_steps ON engagement_steps(engagement_id, flow);
CREATE INDEX IF NOT EXISTS idx_audit_findings_inst ON audit_findings(institution_id);
CREATE INDEX IF NOT EXISTS idx_fund_inst ON fund_disbursements(institution_id);

CREATE TABLE IF NOT EXISTS legal_references (
  id TEXT PRIMARY KEY,
  instrument TEXT NOT NULL,
  provision TEXT,
  summary TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'All'
);

CREATE TABLE IF NOT EXISTS red_flag_indicators (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  indicator TEXT NOT NULL
);

-- ============================================================================
-- 14. AI GOVERNANCE: every AI output is logged with its explanation; a human
-- must accept, modify or override it; overrides feed bias/quality monitoring.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_decisions (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,                -- assessment_narrative | review_summary | duplicate_detection | trend_prediction
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  institution_id TEXT REFERENCES institutions(id),
  model_version TEXT NOT NULL,
  input_summary TEXT,
  output_text TEXT,
  explanation TEXT NOT NULL DEFAULT '{}',   -- JSON: method, factors, confidence, limitations
  generated_by TEXT REFERENCES users(id),
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  human_action TEXT NOT NULL DEFAULT 'Pending' CHECK (human_action IN ('Pending','Accepted','Modified','Overridden')),
  human_user_id TEXT REFERENCES users(id),
  human_reason TEXT,
  final_text TEXT,
  acted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_feature ON ai_decisions(feature, human_action);
CREATE INDEX IF NOT EXISTS idx_ai_entity ON ai_decisions(entity_type, entity_id);
