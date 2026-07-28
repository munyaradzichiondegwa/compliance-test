export type Role =
  | 'SUPER_ADMIN'
  | 'PREVENTION_HEAD'
  | 'COMPLIANCE_OFFICER'
  | 'SYSTEMS_REVIEWER'
  | 'MONITORING_OFFICER'
  | 'INSTITUTION_FOCAL_PERSON'
  | 'INTEGRITY_COMMITTEE_CHAIR'
  | 'AUDITOR'
  | 'INVESTIGATIONS_OFFICER';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  institutionId: string | null;
  mfaEnabled: boolean;
}

export interface Institution {
  id: string;
  name: string;
  type: string;
  sector: string;
  ownership: string;
  province: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  risk_level: 'Low' | 'Medium' | 'High';
  status: string;
  focal_person_user_id: string | null;
  registration_no: string | null;
}

export type RagStatus = 'Red' | 'Amber' | 'Green';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Administrator',
  PREVENTION_HEAD: 'Prevention & Corporate Governance Head',
  COMPLIANCE_OFFICER: 'Compliance Officer',
  SYSTEMS_REVIEWER: 'Systems Reviewer',
  MONITORING_OFFICER: 'Monitoring Officer',
  INSTITUTION_FOCAL_PERSON: 'Institution Focal Person',
  INTEGRITY_COMMITTEE_CHAIR: 'Integrity Committee Chair',
  AUDITOR: 'Auditor',
  INVESTIGATIONS_OFFICER: 'Investigations Officer',
};

export const PROVINCES = [
  'Harare', 'Bulawayo', 'Manicaland', 'Mashonaland Central', 'Mashonaland East',
  'Mashonaland West', 'Masvingo', 'Matabeleland North', 'Matabeleland South', 'Midlands',
];
