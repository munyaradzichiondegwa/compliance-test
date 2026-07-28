import {
  LayoutDashboard, Building2, ClipboardCheck, FileSearch, ListChecks, Users, ShieldCheck,
  FileSignature, Siren, Map, ShieldAlert, ScrollText, FileBarChart, Settings, Workflow,
  MailCheck, Search, Landmark,
} from 'lucide-react';
import type { Role } from '../../types';

export interface NavItem {
  to: string;
  label: string;
  icon: any;
}

const DASHBOARD: NavItem = { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard };
const INSTITUTIONS: NavItem = { to: '/app/institutions', label: 'Institutions', icon: Building2 };
const GIS: NavItem = { to: '/app/gis', label: 'GIS Map', icon: Map };
const RISK: NavItem = { to: '/app/risk-register', label: 'Risk Register', icon: ShieldAlert };
const SEARCH: NavItem = { to: '/app/search', label: 'Search', icon: Search };
const REPORTS: NavItem = { to: '/app/reports', label: 'Reports', icon: FileBarChart };
const SETTINGS: NavItem = { to: '/app/settings', label: 'Settings', icon: Settings };

export function getNavForRole(role: Role): NavItem[] {
  switch (role) {
    case 'SUPER_ADMIN':
      return [
        DASHBOARD, INSTITUTIONS,
        { to: '/app/users', label: 'Users', icon: Users },
        { to: '/app/workflow-config', label: 'Workflow Config', icon: Workflow },
        { to: '/app/notification-admin', label: 'Notifications Admin', icon: MailCheck },
        { to: '/app/audit-log', label: 'Audit Log', icon: ScrollText },
        RISK, { to: '/app/procurement', label: 'Procurement', icon: Landmark }, GIS, REPORTS, SEARCH, SETTINGS,
      ];
    case 'PREVENTION_HEAD':
      return [
        DASHBOARD, INSTITUTIONS,
        { to: '/app/assessments', label: 'Assessments', icon: ClipboardCheck },
        { to: '/app/systems-reviews', label: 'Systems Reviews', icon: FileSearch },
        { to: '/app/recommendations', label: 'Recommendations', icon: ListChecks },
        RISK, GIS, REPORTS, SEARCH, SETTINGS,
      ];
    case 'COMPLIANCE_OFFICER':
      return [
        DASHBOARD,
        { to: '/app/assessments', label: 'My Assessments', icon: ClipboardCheck },
        INSTITUTIONS, RISK, GIS, SEARCH, SETTINGS,
      ];
    case 'SYSTEMS_REVIEWER':
      return [
        DASHBOARD,
        { to: '/app/systems-reviews', label: 'My Reviews', icon: FileSearch },
        INSTITUTIONS, RISK, SEARCH, SETTINGS,
      ];
    case 'MONITORING_OFFICER':
      return [
        DASHBOARD,
        { to: '/app/recommendations', label: 'Recommendation Tracker', icon: ListChecks },
        INSTITUTIONS, SEARCH, SETTINGS,
      ];
    case 'INSTITUTION_FOCAL_PERSON':
      return [
        DASHBOARD,
        { to: '/app/recommendations', label: 'My Recommendations', icon: ListChecks },
        { to: '/app/pledges', label: 'Integrity Pledges', icon: FileSignature },
        SETTINGS,
      ];
    case 'INTEGRITY_COMMITTEE_CHAIR':
      return [
        DASHBOARD,
        { to: '/app/committees', label: 'My Committee', icon: ShieldCheck },
        { to: '/app/pledges', label: 'Integrity Pledges', icon: FileSignature },
        SETTINGS,
      ];
    case 'AUDITOR':
      return [
        { to: '/app/dashboard', label: 'Audit Dashboard', icon: LayoutDashboard },
        { to: '/app/audit-log', label: 'Audit Log', icon: ScrollText },
        INSTITUTIONS, RISK, { to: '/app/procurement', label: 'Procurement', icon: Landmark }, GIS, REPORTS, SEARCH, SETTINGS,
      ];
    case 'INVESTIGATIONS_OFFICER':
      return [
        { to: '/app/whistleblower-cases', label: 'Whistleblower Cases', icon: Siren },
        DASHBOARD, SETTINGS,
      ];
    default:
      return [DASHBOARD, SETTINGS];
  }
}
