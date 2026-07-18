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
    'SUPER_ADMIN','PREVENTION_HEAD','COMPLIANCE_OFFICER','SYSTEMS_REVIEWER',
    'MONITORING_OFFICER','INSTITUTION_FOCAL_PERSON','INTEGRITY_COMMITTEE_CHAIR',
    'AUDITOR','INVESTIGATIONS_OFFICER'
  )),
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
  source_type TEXT NOT NULL CHECK (source_type IN ('Assessment','SystemsReview')),
  source_id TEXT NOT NULL,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  description TEXT NOT NULL,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
  assigned_to_user_id TEXT REFERENCES users(id),
  owner_name TEXT,
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
