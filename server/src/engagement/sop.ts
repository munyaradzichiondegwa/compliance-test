// Definitions taken from the Compliance, Systems and Processes Review Unit
// SOPs (v01), the Compliance Procedure Manual and the Unit Policy.
// Everything workflow-specific (chains, SLAs, outputs) is data here so the
// engine in engine.ts stays generic.

export type SopType =
  | 'ComplianceAssessment' | 'SystemsReview' | 'AuditRecsMonitoring' | 'GovtProjectsMonitoring'
  | 'GovtProgramsMonitoring' | 'ICInitiativesMonitoring' | 'ICTraining' | 'PledgeSigning';

export type StepKey = 'Manager' | 'GM' | 'TeamLeader' | 'ProvincialHead' | 'ExecutiveSecretary' | 'PreventionCommittee' | 'CommissionChair';
export type FlowName = 'Preliminary' | 'Concept' | 'IM' | 'Report';

export interface StepDef {
  key: StepKey;
  label: string;
  role: string;            // user role that acts (SUPER_ADMIN may always act)
  slaDays: number;         // working days allowed at this step
  decision: 'Recommended' | 'Approved'; // positive decision wording
}

export const STEPS: Record<StepKey, StepDef> = {
  TeamLeader: { key: 'TeamLeader', label: 'Team Leader', role: 'COMPLIANCE_OFFICER', slaDays: 1, decision: 'Recommended' },
  ProvincialHead: { key: 'ProvincialHead', label: 'Provincial Head', role: 'PROVINCIAL_HEAD', slaDays: 1, decision: 'Recommended' },
  Manager: { key: 'Manager', label: 'Manager, Compliance and Systems Review', role: 'MANAGER_COMPLIANCE', slaDays: 1, decision: 'Recommended' },
  GM: { key: 'GM', label: 'General Manager, Prevention and Corporate Governance', role: 'GM_PREVENTION', slaDays: 2, decision: 'Recommended' },
  ExecutiveSecretary: { key: 'ExecutiveSecretary', label: 'Executive Secretary', role: 'EXECUTIVE_SECRETARY', slaDays: 1, decision: 'Approved' },
  PreventionCommittee: { key: 'PreventionCommittee', label: 'Prevention and Corporate Governance Committee', role: 'PREVENTION_COMMITTEE', slaDays: 10, decision: 'Recommended' },
  CommissionChair: { key: 'CommissionChair', label: 'Commission (Chairperson)', role: 'COMMISSION_CHAIR', slaDays: 10, decision: 'Approved' },
};

export interface SopDef {
  type: SopType;
  label: string;
  sopRef: string;
  hasIM: boolean;
  hasReport: boolean;
  hasMonitoring: boolean;
  needsMethod: boolean;
  minWorkingDays: number;
  conceptChain: StepKey[];
  triggers: string[];
  outputs: string[];
  documentsToRequest: string[];
  evaluation: string;
  defaultObjectives: string[];
  defaultMethodology: string[];
  defaultOutcomes: string[];
  teamMin: number;
}

const COMMON_DOCS = [
  'Governing Acts and Statutory Instruments', 'Strategic plan', 'Annual reports', 'Audit reports (internal and Auditor-General)',
  'Board / Council and management minutes and resolutions', 'Procurement records', 'Human resources records', 'Policies and procedures manuals',
  'Financial statements',
];

const CHAIN_STANDARD: StepKey[] = ['TeamLeader', 'Manager', 'GM', 'ExecutiveSecretary'];
const CHAIN_LIGHT: StepKey[] = ['Manager', 'ExecutiveSecretary'];

export const SOPS: Record<SopType, SopDef> = {
  ComplianceAssessment: {
    type: 'ComplianceAssessment', label: 'Compliance Assessment', sopRef: 'Compliance Assessment SOP v01',
    hasIM: true, hasReport: true, hasMonitoring: true, needsMethod: true, minWorkingDays: 2, conceptChain: CHAIN_STANDARD, teamMin: 2,
    triggers: ['Public complaints and allegations', 'Electronic and print media reports', 'Internal and external audit reports', 'Referrals from ZACC departments', 'Invitations from institutions', 'Routine compliance programmes', 'Previous compliance findings', 'Management directives'],
    outputs: ['Compliance Assessment Report', 'Implementation Matrix'],
    documentsToRequest: COMMON_DOCS,
    evaluation: 'Compliance rated against applicable legislation, regulations and institutional policies as Compliant, Partially Compliant or Non-Compliant.',
    defaultObjectives: ['To ascertain the veracity of the allegations / assess adherence to the governing laws, policies and procedures', 'To identify corruption vulnerabilities and system weaknesses', 'To proffer recommendations that aid system efficiency'],
    defaultMethodology: ['Request for documents and document analysis', 'Interviews with relevant office bearers (conducted in a separate working room)', 'Observation of processes and physical verification where applicable', 'Entrance and exit meetings with the Accounting Officer / management'],
    defaultOutcomes: ['Compliance Assessment Report', 'Implementation Matrix with findings, recommendations, responsible officers and timeframes'],
  },
  SystemsReview: {
    type: 'SystemsReview', label: 'Systems and Processes Review', sopRef: 'Systems and Processes Review SOP v01',
    hasIM: true, hasReport: true, hasMonitoring: true, needsMethod: false, minWorkingDays: 10, conceptChain: CHAIN_STANDARD, teamMin: 2,
    triggers: ['Public complaints and allegations', 'Media reports', 'Internal and external audit reports', 'Systems audits for local authorities and public entities', 'Referrals from ZACC departments', 'Invitations from institutions', 'Routine systems reviews', 'Previous review findings', 'Management directives'],
    outputs: ['Systems and Processes Report', 'Systems and Processes Matrix'],
    documentsToRequest: COMMON_DOCS,
    evaluation: 'Systems, processes, governance structures and internal controls assessed to identify corruption risks, system weaknesses and opportunities for improvement.',
    defaultObjectives: ['To assess institutional systems, processes, governance structures and internal controls', 'To identify corruption risks and system weaknesses', 'To secure the revision of procedures, policies and practices that curb corrupt tendencies'],
    defaultMethodology: ['Document analysis', 'Interviews', 'Process observation (walk-through of key processes)', 'Assessment of governance systems and controls'],
    defaultOutcomes: ['Systems and Processes Report', 'Systems and Processes Matrix'],
  },
  AuditRecsMonitoring: {
    type: 'AuditRecsMonitoring', label: 'Monitoring of Audit Recommendations', sopRef: 'Monitoring of Internal and External Audit Recommendations SOP v01',
    hasIM: false, hasReport: true, hasMonitoring: false, needsMethod: false, minWorkingDays: 2, conceptChain: CHAIN_STANDARD, teamMin: 2,
    triggers: ['Internal audit recommendations', 'Office of the Auditor-General recommendations', 'Media reports'],
    outputs: ['Implementation of Internal and External Audit Recommendations Monitoring Report'],
    documentsToRequest: [...COMMON_DOCS, 'Programme concept paper', 'Progress reports', 'Audit recommendation implementation tracker'],
    evaluation: 'Implementation of audit proposals tracked against set timelines and guiding statutes.',
    defaultObjectives: ['To monitor implementation of internal and external audit recommendations', 'To establish reasons for non-implementation and recommend corrective action'],
    defaultMethodology: ['Review of audit reports and the institution implementation tracker', 'Interviews with responsible officers', 'Verification or site visits of outputs where applicable'],
    defaultOutcomes: ['Monitoring Report on implementation of audit recommendations'],
  },
  GovtProjectsMonitoring: {
    type: 'GovtProjectsMonitoring', label: 'Monitoring of Government Funded Projects', sopRef: 'Monitoring of Government Funded Projects SOP v01',
    hasIM: false, hasReport: true, hasMonitoring: false, needsMethod: false, minWorkingDays: 2, conceptChain: CHAIN_STANDARD, teamMin: 2,
    triggers: ['National Priority Programmes', 'National Interest Projects', 'Fiscal policy', 'Monetary policy'],
    outputs: ['Government Projects Monitoring Report'],
    documentsToRequest: [...COMMON_DOCS, 'Project concept paper', 'Project implementation plan and contracts', 'Progress and payment certificates'],
    evaluation: 'Monitoring assessed against applicable legislation, regulations, policies and the project concept paper and progress reports.',
    defaultObjectives: ['To monitor implementation of the government project against scope, budget and timelines', 'To verify that procurement and payments comply with the law', 'To proffer recommendations'],
    defaultMethodology: ['Review of project concept paper, contracts and progress reports', 'Interviews with project managers and contractors', 'Physical verification of project outputs'],
    defaultOutcomes: ['Government Projects Monitoring Report; key recommendations communicated to Government through the Commission Chairperson'],
  },
  GovtProgramsMonitoring: {
    type: 'GovtProgramsMonitoring', label: 'Monitoring of Government Funded Programmes', sopRef: 'Monitoring of Government Funded Programmes SOP v01',
    hasIM: false, hasReport: true, hasMonitoring: false, needsMethod: false, minWorkingDays: 2, conceptChain: CHAIN_STANDARD, teamMin: 2,
    triggers: ['National Priority Programmes', 'National Interest Programmes'],
    outputs: ['Government Programmes Monitoring Report'],
    documentsToRequest: [...COMMON_DOCS, 'Programme concept paper', 'Programme progress reports', 'Beneficiary registers'],
    evaluation: 'Programme tracked against its scope, budget, timelines and guiding rules and regulations.',
    defaultObjectives: ['To monitor implementation of the government programme against scope, budget and timelines', 'To verify targeting and delivery to intended beneficiaries', 'To proffer recommendations'],
    defaultMethodology: ['Review of programme concept paper and progress reports', 'Interviews with programme officers and beneficiaries', 'Verification of programme outputs'],
    defaultOutcomes: ['Government Programmes Monitoring Report'],
  },
  ICInitiativesMonitoring: {
    type: 'ICInitiativesMonitoring', label: 'Monitoring of Integrity Committee Initiatives', sopRef: 'Monitoring of Implementation of Integrity Committee Initiatives SOP v01',
    hasIM: false, hasReport: true, hasMonitoring: false, needsMethod: false, minWorkingDays: 2, conceptChain: CHAIN_STANDARD, teamMin: 2,
    triggers: ['Endorsed corruption risk matrix', 'Integrity action plan', 'Workplan', 'Integrity charter'],
    outputs: ['Implementation of Integrity Committee Initiatives Monitoring Report'],
    documentsToRequest: [...COMMON_DOCS, 'Corruption risk matrix', 'Integrity action plan', 'Integrity committee workplan', 'Integrity charter', 'Quarterly reports'],
    evaluation: 'Monitoring assessed against applicable legislation, regulations, institutional policies and the committee\'s own risk matrix, action plan, workplan and charter.',
    defaultObjectives: ['To monitor implementation of the integrity committee initiatives', 'To assess the effectiveness of the committee in mainstreaming corruption prevention'],
    defaultMethodology: ['Review of risk matrix, action plan, workplan, charter and quarterly reports', 'Interviews with committee members', 'Verification of committee outputs'],
    defaultOutcomes: ['Integrity Committee Initiatives Monitoring Report'],
  },
  ICTraining: {
    type: 'ICTraining', label: 'Integrity Committee Training', sopRef: 'Integrity Committee Training SOP v01',
    hasIM: false, hasReport: false, hasMonitoring: true, needsMethod: false, minWorkingDays: 1, conceptChain: CHAIN_LIGHT, teamMin: 2,
    triggers: ['Request from the institution', 'ZACC initiated (approved by the Executive Secretary)'],
    outputs: ['Integrity Committee return form'],
    documentsToRequest: ['Institution mandate and structure', 'Integrity committee composition (HRM, Corporate Legal Affairs, Corporate Audit)'],
    evaluation: 'Committee composition assessed against the Integrity Committee framework (minimum three members including HRM, Legal Affairs and Audit representatives).',
    defaultObjectives: ['To capacitate the Integrity Committee as an institutional mechanism for corruption prevention and ethical governance'],
    defaultMethodology: ['Training on: unpacking the Integrity Committee concept; corruption risk identification; anti-corruption integrity action plan; integrity charter; integrity committee workplan'],
    defaultOutcomes: ['Integrity Committee return form; draft corruption risk matrix, action plan, charter and workplan to be submitted within 30 days'],
  },
  PledgeSigning: {
    type: 'PledgeSigning', label: 'Integrity Pledge Signing', sopRef: 'Integrity Pledge Signing SOP v01',
    hasIM: false, hasReport: false, hasMonitoring: true, needsMethod: false, minWorkingDays: 1, conceptChain: CHAIN_LIGHT, teamMin: 2,
    triggers: ['Request by letter from the institution', 'ZACC initiated (approved by the Executive Secretary)'],
    outputs: ['Signed Integrity Pledges (individual copy, HR file copy, ZACC copy)'],
    documentsToRequest: ['Institution mandate and structure', 'List of officers to sign'],
    evaluation: 'Pledges customised to the institution\'s mandate, signed before a Commissioner of Oaths; renewed annually.',
    defaultObjectives: ['To promote ethical conduct and commitment to integrity among public officials and stakeholders'],
    defaultMethodology: ['Customisation of the pledge to the institution mandate', 'Presentation on the integrity pledge', 'Signing before a Commissioner of Oaths (three copies per signatory)'],
    defaultOutcomes: ['Signed integrity pledges; annual renewal schedule'],
  },
};

export const SOP_TYPES = Object.keys(SOPS) as SopType[];

/** Concept chain, prepending the Provincial Head for provincially-originated exercises. */
export function conceptChainFor(sop: SopDef, locationType: string): StepKey[] {
  return locationType === 'Provincial' ? ['ProvincialHead', ...sop.conceptChain] : sop.conceptChain;
}
export const IM_CHAIN: StepKey[] = ['TeamLeader', 'Manager', 'GM', 'ExecutiveSecretary'];
// Report: TL 2d, Manager 2d, GM 3d, then Prevention Committee, then Commission (SOP s14 / s13)
export const REPORT_CHAIN: StepKey[] = ['TeamLeader', 'Manager', 'GM', 'PreventionCommittee', 'CommissionChair'];
export const REPORT_STEP_SLA: Partial<Record<StepKey, number>> = { TeamLeader: 2, Manager: 2, GM: 3, ExecutiveSecretary: 1 };
export const PRELIM_CHAIN: StepKey[] = ['Manager', 'GM'];
export const MONITORING_MONTHS = 3;       // Manual s14
export const CERTIFICATE_VALID_MONTHS = 12; // Manual s15
export const IC_FOLLOW_UP_DAYS = 30;        // IC training SOP s10.1

export const RED_FLAGS: { category: string; indicators: string[] }[] = [
  { category: 'Poor Corporate Governance', indicators: [
    'Board term expired but Board still transacting corporate business', 'Board composition weak in terms of skill portfolio',
    'Board not complying with the Act (frequency of sitting, notice, quorum, voting)', 'Ministry interfering in Board issues, or Board interfering in Management issues',
    'Ministry failing to supervise Board, or Board failing to supervise Management', 'Ministry, Board and Management pursuing self-interest',
    'Disregard of public interest (environment, staff welfare, social responsibility)', 'Failure to comply with ZSE, accounting and industry requirements',
    'Audited accounts not produced timeously (two or more years behind)', 'Excessive centralisation of power',
    'Abuse of organisation resources (motor transport, equipment, travel and subsistence, overtime claims)'] },
  { category: 'Poor Financial Management', indicators: [
    'Huge losses reported', 'Failure to collect debts, poor credit management', 'Serious cash flow problems (e.g. huge bank overdraft)', 'High provision for bad debts',
    'Heavy losses through accidents, theft, fraud', 'Negative net asset position', 'Poor return on assets', 'Weak systems of accounting and control',
    'Failure to comply with international financial requirements', 'Poor record keeping; reconciliations (cash book, debtors, creditors, stocks, fixed assets) not current'] },
  { category: 'Poor Human Resources Management', indicators: [
    'Job mismatches, high staff turnover', 'Reporting structure poorly defined', 'Delegation of authority not defined', 'Job functions not available in writing',
    'Incumbents lack professional qualifications', 'Under- or over-staffing (nepotism, favouritism)', 'Client lost most disciplinary cases in court',
    'Senior posts not substantively filled', 'Recruitment procedures not documented', 'No succession planning', 'No regular staff meetings'] },
  { category: 'Poor Procurement Practices', indicators: [
    'Procedures poorly defined or violated at will', 'No trail for individual purchases', 'Comparative schedules not available for inspection',
    'Management creating own side companies to supply the organisation (conflict of interest)', 'Customer / supplier information not easily available', 'Service levels unpredictable', 'Bid rigging'] },
  { category: 'Distressed Operations', indicators: [
    'Pay days overshot', 'Disconnection of electricity and water supplies', 'Credit lines cut or barred by suppliers', 'Operating below capacity', 'Errant stock-outs', 'Very low staff morale'] },
];

export const COMPLIANCE_CHECKLIST: { organisation: string; subject: string; items: string[]; framework: string[] }[] = [
  { organisation: 'Ministries, Departments & Agencies; Commissions; State Entities and Local Authorities', subject: 'Corporate Governance',
    items: ['Tenure of officials', 'Filling of critical vacant posts', 'Officers in acting positions for more than 90 days / the legally stipulated period', 'Board Charter', 'Code of ethics', 'Transparency and accountability', 'Conflict of interest', 'Declaration of assets', 'Organisational structure / organogram', 'Human resource management'],
    framework: ['Public Entities Corporate Governance Act', 'Zimbabwe National Code of Corporate Governance', 'Governing Acts and Statutory Instruments', 'Anti-corruption laws', 'Labour Act', 'Contracts of employment', 'Human resource policies', 'Manuals', 'Ratified international and regional conventions'] },
  { organisation: 'Ministries, Departments & Agencies; Commissions; State Entities and Local Authorities', subject: 'Procurement and Asset Management',
    items: ['Purchase / hire of assets and services', 'Disposal of public assets', 'Management of assets', 'Due diligence processes'],
    framework: ['Public Procurement and Disposal of Public Assets Act [Chapter 22:23]', 'Procurement and disposal regulations', 'Governing Acts', 'Asset management policies'] },
  { organisation: 'Ministries, Departments & Agencies; Commissions; State Entities and Local Authorities', subject: 'Provision of basic goods, services, social amenities and infrastructure',
    items: ['Transport (road, rail, air)', 'Housing', 'Road network', 'Communication', 'Health', 'Social safety nets', 'Utilities (water, electricity)', 'State land management', 'Ease of doing business'],
    framework: ['Governing Acts', 'Governing Statutory Instruments', 'Government policy pronouncements', 'Contracts / agreements', 'Project implementation plans', 'Manuals', 'State Land Management / Allocation Policy'] },
  { organisation: 'Ministries, Departments & Agencies; Commissions; State Entities and Local Authorities', subject: 'Financial Management',
    items: ['Audited financial statements', 'International financial standards (IPSAS)', 'Internal and external audit recommendations'],
    framework: ['Internal and external audit reports', 'International financial laws', 'Relevant Government Acts', 'Governing Acts'] },
  { organisation: 'Industry & Commerce', subject: 'Investment and Trading of Goods & Services',
    items: ['Adherence to investment procedures', 'Observance of import and export procedures', 'Adherence to taxation laws', 'Compliance with consumer laws and regulations', 'Observance of competition laws and regulations'],
    framework: ['Governing Acts', 'Taxation laws', 'Exchange Control Act and Regulations', 'Stock Exchange / Investment laws', 'Consumer, competition, import and export laws'] },
  { organisation: 'Public & Private Institutions; Civil Society; Religious organisations; Political Parties', subject: 'Integrity Issues',
    items: ['Establishment of Integrity Committees', 'Signing of Integrity Pledges', 'Observance of work ethics', 'Ethical behaviour practices'],
    framework: ['Public Entities Corporate Governance Act', 'Ratified anti-corruption conventions (UNCAC, AU, SADC Protocol)', 'Anti-corruption and anti-bribery policies', 'National Anti-Corruption Strategy', 'Integrity pledges'] },
];

export const LEGAL_REFERENCES: [string, string, string, string][] = [
  ['Constitution of Zimbabwe Amendment (No. 20) Act 2013', 'Sections 254-255', 'Establishes ZACC and its functions: prevention, investigation and asset recovery in public and private institutions.', 'All'],
  ['Anti-Corruption Commission Act [Chapter 9:22]', 'Section 12', 'Functions: monitor and examine practices, systems and procurement procedures; instruct, advise and assist; assist in formulating practices and systems.', 'All'],
  ['Prevention of Corruption Act [Chapter 9:16]', 'General', 'Offences and obligations relating to corruption in public and private bodies.', 'All'],
  ['Public Entities Corporate Governance Act [Chapter 10:31]', 'General', 'Corporate governance of public entities: boards, tenure, conflict of interest, accountability.', 'Governance'],
  ['Public Procurement and Disposal of Public Assets Act [Chapter 22:23]', 'Section 39', 'Procurement Management Unit holds the procurement function; governing bodies must not interfere in adjudication outcomes.', 'Procurement'],
  ['Public Procurement and Disposal of Public Assets Act [Chapter 22:23]', 'PMU staffing', 'A Procurement Management Unit requires a minimum of three officers.', 'Procurement'],
  ['Urban Councils Act [Chapter 29:15]', 'Section 89', 'Procedure for rescission or alteration of a resolution of Council or an executive committee.', 'Local Authority'],
  ['Urban Councils Act [Chapter 29:15]', 'Section 141(1)(a)', 'Powers of the executive on recruitment of employees.', 'Local Authority'],
  ['Rural District Councils Act [Chapter 29:13]', 'General', 'Governance and administration of Rural District Councils, resolutions and committees.', 'Local Authority'],
  ['Public Finance Management Act [Chapter 22:19]', 'Accountability', 'Acquittal of travel and subsistence and advances; prudent financial management.', 'Finance'],
  ['IPSAS', 'IPSAS 1 / IPSAS 4', 'International Public Sector Accounting Standards (presentation of statements; effects of changes in foreign exchange rates) applied in Auditor-General reports.', 'Finance'],
  ['Criminal Law (Codification and Reform) Act [Chapter 9:23]', 'Sections 136, 170-174', 'Fraud; bribery; using a false document; concealing a transaction or personal interest; criminal abuse of duty.', 'Integrity'],
  ['National Anti-Corruption Strategy (NACS)', 'Integrity pledges and committees', 'Launched 11 July 2020; promotes integrity pledges and Integrity Committees in MDAs, SOEs and parastatals.', 'Integrity'],
  ['Cyber and Data Protection Act [Chapter 12:07]', 'General', 'Personal data protection; breach notification to POTRAZ.', 'Data'],
  ['Labour Act [Chapter 28:01]', 'General', 'Employment contracts, termination and discipline.', 'HR'],
];
