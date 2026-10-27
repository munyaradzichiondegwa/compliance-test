import { useEffect, useState } from 'react';
import { api } from '../../api/client';

export const STATUS_LABELS: Record<string, string> = {
  Preliminary: 'Preliminary assessment', ConceptDraft: 'Concept note drafting', ConceptReview: 'Concept note under review', Approved: 'Approved — letter pending',
  Notified: 'Institution notified', Fieldwork: 'Fieldwork', IMReview: 'Implementation Matrix review', ReportDraft: 'Drafting report', ReportReview: 'Report review',
  Committee: 'Prevention Committee', Commission: 'Commission', Completed: 'Completed', Monitoring: 'Under monitoring', Closed: 'Closed', Rejected: 'Rejected', Cancelled: 'Cancelled',
};
export const STATUS_ORDER = ['Preliminary', 'ConceptDraft', 'ConceptReview', 'Approved', 'Notified', 'Fieldwork', 'IMReview', 'ReportDraft', 'ReportReview', 'Committee', 'Commission', 'Completed', 'Monitoring', 'Rejected', 'Cancelled'];
export const SCOPE_LABELS: Record<string, string> = { SpotCheck: 'Spot check', DeskCheck: 'Desk check', Comprehensive: 'Comprehensive check' };
export const METHOD_LABELS: Record<string, string> = { RFD: 'Request for Documents (RFD)', RR: 'Rapid Response (RR)', PCC: 'Physical Compliance Check (PCC)' };
export const ORIGIN_LABELS: Record<string, string> = {
  PublicComplaint: 'Public complaint', MediaReport: 'Media report', AuditReport: 'Audit report', DepartmentReferral: 'Referral from a ZACC department', InstitutionInvitation: 'Invitation from the institution',
  RoutineProgramme: 'Routine programme', PreviousFindings: 'Follow-up of previous findings', ManagementDirective: 'Management directive', NationalPriority: 'National priority', Other: 'Other',
};
export const RATING_LABELS: Record<string, string> = { Compliant: 'Compliant', PartiallyCompliant: 'Partially compliant', NonCompliant: 'Non-compliant' };
export const IMPL_LABELS: Record<string, string> = { Open: 'Open', InProgress: 'In progress', Implemented: 'Implemented', Verified: 'Verified', NotImplemented: 'Not implemented' };

export interface Meta {
  sops: { type: string; label: string; sopRef: string; triggers: string[]; outputs: string[]; hasIM: boolean; hasReport: boolean; hasMonitoring: boolean; needsMethod: boolean; minWorkingDays: number; documentsToRequest: string[] }[];
  steps: { key: string; label: string; role: string; slaDays: number }[];
  origins: string[]; docKinds: { kind: string; label: string }[]; redFlags: { category: string; indicators: string[] }[]; checklist: any; mandate: string; legalReferences: any[];
}
let cache: Meta | null = null;
export function useEngagementMeta() {
  const [meta, setMeta] = useState<Meta | null>(cache);
  useEffect(() => { if (!cache) api.get('/engagements/meta').then((m) => { cache = m; setMeta(m); }).catch(() => {}); }, []);
  return meta;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d?: string | null) => (d ? String(d).slice(0, 10) : '—');
export const isOverdue = (d?: string | null) => !!d && new Date(d).getTime() < Date.now();
