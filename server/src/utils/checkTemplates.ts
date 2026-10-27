// Drafting assistance for compliance check concept notes: converts a list of
// allegation themes into ZACC-style objectives and methodology, and keeps the
// standard mandate wording used across Compliance, Systems and Processes
// Review documents. Rule-based and fully deterministic (no external calls).

export const MANDATE_TEXT =
  'The Zimbabwe Anti-Corruption Commission, as prescribed by Section 12 of the Anti-Corruption Commission Act [Chapter 9:22], through the Compliance, Systems and Processes Review Unit is mandated to carry out compliance spot checks and systems reviews in public and private institutions in terms of good corporate governance, based on existing laws, policies, procedure manuals and regulations, including procurement procedures governing day-to-day operations.';

const THEMES: { match: RegExp; theme: string; objective: string; docs: string; interviewees: string }[] = [
  { match: /tender|procure|award|quote|rfq|bid|prazp?|plant/i, theme: 'Unprocedural award of tenders', objective: 'To ascertain the veracity of allegations of unprocedural award of tenders and compliance with the Public Procurement and Disposal of Public Assets Act', docs: 'tender and quotation files, adjudication reports, PMU records and council resolutions', interviewees: 'Procurement Management Unit officials' },
  { match: /recruit|post|employ|casual|grade|staff/i, theme: 'Unprocedural recruitment and employment practices', objective: 'To examine the extent of non-compliance in recruitment, grading and employment procedures', docs: 'organisational structure, recruitment files, contracts and grading schedules', interviewees: 'Human Resources officials' },
  { match: /land|stand|auction|allocation|housing/i, theme: 'Unprocedural allocation or disposal of land and stands', objective: 'To establish compliance of land and stand allocation and disposal with council policy and statutory requirements', docs: 'stand registers, council resolutions, valuation and sales records', interviewees: 'Housing and Planning officials' },
  { match: /fund|levy|revenue|zinara|royalt|toll|devolution|cash|bank|t&s|acquit|financ|audit|ipsas|vat/i, theme: 'Financial management and utilisation of funds', objective: 'To assess the utilisation, accounting and acquittal of funds against approved budgets and the Public Finance Management Act', docs: 'cashbooks, acquittals, payment vouchers, audited financial statements and the Auditor-General report', interviewees: 'Finance and internal audit officials' },
  { match: /interfer|councillor|resolution|ultra vires|committee/i, theme: 'Interference with management functions', objective: 'To examine the extent of councillor interference with administrative, recruitment and procurement processes', docs: 'council and committee resolutions and minutes', interviewees: 'Council Chairperson, committee chairpersons and the Secretary' },
  { match: /vehicle|fuel|asset|repair|plant|equipment/i, theme: 'Management and control of assets', objective: 'To assess controls over the use, maintenance and repair of council assets', docs: 'asset register, vehicle logbooks and repair records', interviewees: 'Works and Transport officials' },
];

export function suggestFromAllegations(allegations: string[], opts: { checkType?: string } = {}) {
  const hits = THEMES.filter((t) => allegations.some((a) => t.match.test(a)));
  const objectives = [
    ...(allegations.length ? ['To ascertain the veracity of the allegations'] : ['To assess compliance with applicable laws, policies and procedures']),
    ...hits.map((h) => h.objective),
    'To proffer recommendations that enhance system efficiency and eliminate opportunities for corruption',
  ];
  const interviewees = Array.from(new Set(hits.map((h) => h.interviewees)));
  const docs = Array.from(new Set(hits.map((h) => h.docs)));
  const methodology = [
    `Interviews: ${interviewees.length ? interviewees.join('; ') : 'Council officials and councillors'}`,
    `Document analysis: ${docs.length ? docs.join('; ') : 'relevant records and resolutions'}`,
    ...(opts.checkType === 'DeskCheck' ? [] : ['Physical verification of sites, projects and assets where applicable']),
    'Exit interview and presentation of preliminary findings',
    'Report writing and development of an Implementation Matrix',
  ];
  return { themes: hits.map((h) => h.theme), objectives, methodology };
}

/** Rough road-distance helper for itinerary planning (km, great-circle x1.3 road factor). */
export function roadKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 1.3);
}
