import {
  LayoutDashboard, Building2, ClipboardCheck, FileSearch, ListChecks, Users, ShieldCheck,
  FileSignature, Siren, Map, ShieldAlert, ScrollText, FileBarChart, Settings, Workflow,
  MailCheck, Search, Landmark, ClipboardList, Gauge, CalendarClock, BookOpenCheck, Coins,
  HardHat, Award, Bot, Smartphone,
} from 'lucide-react';
import type { Role } from '../../types';

export interface NavItem {
  to: string;
  /** i18n key (see src/i18n) */
  label: string;
  icon: any;
}

const N = (to: string, label: string, icon: any): NavItem => ({ to: `/app/${to}`, label, icon });

const DASHBOARD = N('dashboard', 'nav.dashboard', LayoutDashboard);
const WORK = N('engagements', 'nav.engagements', ClipboardList);
const INSTITUTIONS = N('institutions', 'nav.institutions', Building2);
const ASSESSMENTS = N('assessments', 'nav.assessments', ClipboardCheck);
const REVIEWS = N('systems-reviews', 'nav.systemsReviews', FileSearch);
const RECS = N('recommendations', 'nav.recommendations', ListChecks);
const RISK = N('risk-register', 'nav.risk', ShieldAlert);
const GIS = N('gis', 'nav.gis', Map);
const REPORTS = N('reports', 'nav.reports', FileBarChart);
const SEARCH = N('search', 'nav.search', Search);
const SETTINGS = N('settings', 'nav.settings', Settings);
const PROCUREMENT = N('procurement', 'nav.procurement', Landmark);
const ECMD = N('ecmd', 'nav.ecmd', Gauge);
const PLAN = N('monitoring-plan', 'nav.plan', CalendarClock);
const AUDIT_FINDINGS = N('audit-findings', 'nav.auditFindings', BookOpenCheck);
const FUNDS = N('funds', 'nav.funds', Coins);
const PROGRAMMES = N('programmes', 'nav.programmes', HardHat);
const IC = N('ic-monitoring', 'nav.ic', ShieldCheck);
const CERTS = N('certificates', 'nav.certificates', Award);
const AI_GOV = N('ai-governance', 'nav.aiGov', Bot);
const FIELD = N('field-capture', 'nav.fieldCapture', Smartphone);
const AUDIT_LOG = N('audit-log', 'nav.auditLog', ScrollText);
const PLEDGES = N('pledges', 'nav.pledges', FileSignature);
const COMMITTEES = N('committees', 'nav.committees', ShieldCheck);

export function getNavForRole(role: Role): NavItem[] {
  switch (role) {
    case 'SUPER_ADMIN':
      return [DASHBOARD, WORK, INSTITUTIONS, ASSESSMENTS, REVIEWS, RECS, ECMD, PLAN, AUDIT_FINDINGS, FUNDS, PROGRAMMES, IC, CERTS, COMMITTEES, PLEDGES, RISK, PROCUREMENT, GIS, REPORTS, AI_GOV, FIELD,
        N('users', 'nav.users', Users), N('workflow-config', 'nav.workflow', Workflow), N('notification-admin', 'nav.notifAdmin', MailCheck), AUDIT_LOG, N('whistleblower-cases', 'nav.whistleblower', Siren), SEARCH, SETTINGS];
    case 'COMMISSION_CHAIR':
    case 'PREVENTION_COMMITTEE':
    case 'EXECUTIVE_SECRETARY':
      return [DASHBOARD, WORK, ECMD, PLAN, INSTITUTIONS, RECS, CERTS, REPORTS, SEARCH, SETTINGS];
    case 'GM_PREVENTION':
    case 'MANAGER_COMPLIANCE':
      return [DASHBOARD, WORK, ASSESSMENTS, REVIEWS, INSTITUTIONS, RECS, ECMD, PLAN, AUDIT_FINDINGS, FUNDS, PROGRAMMES, IC, CERTS, RISK, GIS, REPORTS, AI_GOV, ...(role === 'GM_PREVENTION' ? [AUDIT_LOG] : []), SEARCH, SETTINGS];
    case 'PROVINCIAL_HEAD':
      return [DASHBOARD, WORK, ASSESSMENTS, INSTITUTIONS, RECS, ECMD, PLAN, FUNDS, PROGRAMMES, IC, FIELD, RISK, REPORTS, SEARCH, SETTINGS];
    case 'COMPLIANCE_OFFICER':
      return [DASHBOARD, WORK, ASSESSMENTS, INSTITUTIONS, ECMD, AUDIT_FINDINGS, FUNDS, PROGRAMMES, FIELD, RISK, GIS, SEARCH, SETTINGS];
    case 'SYSTEMS_REVIEWER':
      return [DASHBOARD, WORK, REVIEWS, INSTITUTIONS, AUDIT_FINDINGS, RISK, FIELD, SEARCH, SETTINGS];
    case 'MONITORING_OFFICER':
      return [DASHBOARD, WORK, RECS, ECMD, PLAN, IC, PROGRAMMES, FUNDS, AUDIT_FINDINGS, INSTITUTIONS, FIELD, SEARCH, SETTINGS];
    case 'AUDITOR':
      return [N('dashboard', 'nav.dashboard', LayoutDashboard), AUDIT_LOG, INSTITUTIONS, AUDIT_FINDINGS, FUNDS, ECMD, RISK, PROCUREMENT, GIS, REPORTS, AI_GOV, SEARCH, SETTINGS];
    case 'INVESTIGATIONS_OFFICER':
      return [N('whistleblower-cases', 'nav.whistleblower', Siren), DASHBOARD, SETTINGS];
    case 'INSTITUTION_FOCAL_PERSON':
      return [DASHBOARD, WORK, RECS, CERTS, PLEDGES, SETTINGS];
    case 'INTEGRITY_COMMITTEE_CHAIR':
      return [DASHBOARD, COMMITTEES, IC, WORK, PLEDGES, SETTINGS];
    default:
      return [DASHBOARD, SETTINGS];
  }
}
