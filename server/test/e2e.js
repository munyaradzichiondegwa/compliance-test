const { authenticator } = require('otplib');
const crypto = require('crypto');

const BASE = 'http://localhost:4000/api/v1';
let pass = 0, fail = 0;

function check(label, cond, extra) {
  if (cond) { pass++; console.log(`  OK   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0,300) : ''); }
}

async function api(method, path, body, token, isForm) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let opts = { method, headers };
  if (body && !isForm) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, opts);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(()=>null) : await res.arrayBuffer();
  return { status: res.status, data, headers: res.headers };
}

const SECRETS = {};
async function loginAs(email, password = 'ZaccDemo#2026') {
  const step1 = await api('POST', '/auth/login', { email, password });
  if (step1.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(step1.data)}`);
  if (step1.data.mfaSetupRequired) {
    SECRETS[email] = step1.data.manualEntryKey;
    const code = authenticator.generate(step1.data.manualEntryKey);
    const step2 = await api('POST', '/auth/mfa/setup/verify', { tempToken: step1.data.tempToken, token: code });
    if (step2.status !== 200) throw new Error(`mfa setup failed for ${email}: ${JSON.stringify(step2.data)}`);
    return step2.data;
  } else if (step1.data.mfaChallengeRequired) {
    if (!SECRETS[email]) throw new Error(`no MFA secret cached for ${email}`);
    const step2 = await api('POST', '/auth/mfa/challenge', { tempToken: step1.data.tempToken, token: authenticator.generate(SECRETS[email]) });
    if (step2.status !== 200) throw new Error(`mfa challenge failed for ${email}: ${JSON.stringify(step2.data)}`);
    return step2.data;
  }
  throw new Error('unexpected login response shape');
}

(async () => {
  console.log('=== 1. Health check ===');
  const health = await api('GET', '/../health'.replace('/api/v1',''));
  // fallback direct
  const health2 = await fetch('http://localhost:4000/health').then(r => r.json());
  check('GET /health returns ok', health2.ok === true, health2);

  console.log('=== 2. Auth + MFA enrolment (Super Admin) ===');
  const admin = await loginAs('admin@zacc.gov.zw');
  check('login issues accessToken', !!admin.accessToken);
  check('login issues refreshToken', !!admin.refreshToken);
  check('user role is SUPER_ADMIN', admin.user.role === 'SUPER_ADMIN', admin.user);

  const me = await api('GET', '/auth/me', null, admin.accessToken);
  check('GET /auth/me works', me.status === 200 && me.data.email === 'admin@zacc.gov.zw');

  const refreshed = await api('POST', '/auth/refresh', { refreshToken: admin.refreshToken });
  check('POST /auth/refresh issues new access token', refreshed.status === 200 && !!refreshed.data.accessToken);

  console.log('=== 3. Institutional Registry ===');
  const instList = await api('GET', '/institutions?limit=100', null, admin.accessToken);
  check('institutions list returns 24 seeded institutions', instList.data.total === 24, instList.data.total);
  const inst = instList.data.results[0];
  const instSummary = await api('GET', `/institutions/${inst.id}/summary`, null, admin.accessToken);
  check('institution summary works', instSummary.status === 200 && instSummary.data.institution.id === inst.id);

  console.log('=== 4. Compliance Assessment full lifecycle ===');
  const officer = await loginAs('officer1@zacc.gov.zw');
  const targetInst = instList.data.results.find(i => i.province === 'Harare');
  const createA = await api('POST', '/assessments', { institutionId: targetInst.id }, officer.accessToken);
  check('assessment created', createA.status === 201 && !!createA.data.id, createA.data);
  const assessmentId = createA.data.id;

  const detail = await api('GET', `/assessments/${assessmentId}`, null, officer.accessToken);
  check('assessment has 16 checklist items', detail.data.items.length === 16, detail.data.items.length);

  const items = detail.data.items.map(it => ({ id: it.id, response: 'Compliant', comments: null }));
  items[2].response = 'NonCompliant'; items[2].comments = 'Test non-compliance';
  items[5].response = 'PartiallyCompliant';
  const checklistUpdate = await api('PUT', `/assessments/${assessmentId}/checklist`, { items }, officer.accessToken);
  check('checklist update computes composite score', typeof checklistUpdate.data.compositeScore === 'number', checklistUpdate.data);
  check('RAG status computed', ['Red','Amber','Green'].includes(checklistUpdate.data.ragStatus), checklistUpdate.data.ragStatus);

  const draft = await api('POST', `/assessments/${assessmentId}/ai-draft`, {}, officer.accessToken);
  check('AI auto-draft narrative generated', draft.status === 200 && draft.data.narrative.length > 50);

  const submit = await api('PUT', `/assessments/${assessmentId}/submit`, {}, officer.accessToken);
  check('assessment submitted', submit.status === 200 && submit.data.compositeScore !== undefined, submit.data);

  const preventionHead = await loginAs('gm.prevention@zacc.gov.zw');
  const review = await api('PUT', `/assessments/${assessmentId}/review`, { decision: 'approve', notes: 'Looks good' }, preventionHead.accessToken);
  check('assessment approved + recommendations generated', review.status === 200 && review.data.recommendationsGenerated >= 1, review.data);

  const report = await api('GET', `/assessments/${assessmentId}/report`, null, officer.accessToken);
  check('PDF report generated', report.status === 200 && report.data.byteLength > 1000, report.data && report.data.byteLength);

  console.log('=== 5. Systems Reviews + AI-02 duplicate detection ===');
  const reviewer = await loginAs('reviewer1@zacc.gov.zw');
  const reviews = await api('GET', '/systems-reviews', null, reviewer.accessToken);
  check('systems reviews seeded', reviews.data.length >= 1, reviews.data.length);
  const reviewDetail = await api('GET', `/systems-reviews/${reviews.data[0].id}`, null, reviewer.accessToken);
  check('review has findings', reviewDetail.data.findings.length >= 1);
  check('review has ai_summary populated', !!reviewDetail.data.ai_summary);

  const dupTest = await api('POST', `/systems-reviews/${reviews.data[0].id}/findings`, {
    findingText: 'There is no segregation of duties between the officer who raises procurement requisitions and the one who approves them.',
    category: 'Procurement', severity: 'High'
  }, reviewer.accessToken);
  check('duplicate detection flags similar existing finding', dupTest.data.possibleDuplicates && dupTest.data.possibleDuplicates.length > 0, dupTest.data.possibleDuplicates);

  console.log('=== 6. Recommendations ===');
  const monitoring = await loginAs('monitoring1@zacc.gov.zw');
  const recs = await api('GET', '/recommendations', null, monitoring.accessToken);
  check('recommendations list populated', recs.data.length > 50, recs.data.length);
  const csvExport = await api('GET', '/recommendations/register/export.csv', null, monitoring.accessToken);
  check('recommendation register CSV export works', csvExport.status === 200);

  console.log('=== 7. Integrity Committees & Pledges ===');
  const committees = await api('GET', '/committees', null, admin.accessToken);
  check('committees seeded', committees.data.length === 10, committees.data.length);
  const committeeDetail = await api('GET', `/committees/${committees.data[0].id}`, null, admin.accessToken);
  check('committee has members/trainings/meetings/actionPlans', committeeDetail.data.members.length > 0 && committeeDetail.data.trainings.length > 0 && committeeDetail.data.meetings.length > 0);

  const pledges = await api('GET', '/pledges', null, admin.accessToken);
  check('pledges seeded', pledges.data.length === 10, pledges.data.length);
  const signRes = await api('POST', `/pledges/${pledges.data[0].id}/sign`, { name: 'Test Signer', position: 'Tester', signatureText: 'Test Signer' }, admin.accessToken);
  check('pledge signing works', signRes.status === 201, signRes.data);

  console.log('=== 8. Whistleblower — full anonymous encrypted flow ===');
  const pubKeyRes = await api('GET', '/whistleblower/public-key');
  check('public key endpoint works (no auth)', pubKeyRes.status === 200 && pubKeyRes.data.publicKeyPem.includes('BEGIN PUBLIC KEY'));

  // Mirror the browser's Web Crypto flow using Node's crypto for this test.
  const plaintext = 'E2E test report: irregular single-source award observed at a test institution.';
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([ciphertext, authTag]).toString('base64');
  const wrappedKey = crypto.publicEncrypt({ key: pubKeyRes.data.publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey).toString('base64');

  const submitWb = await api('POST', '/whistleblower/submit', { category: 'Procurement', encryptedKey: wrappedKey, iv: iv.toString('base64'), payload });
  check('whistleblower submission succeeds', submitWb.status === 201 && !!submitWb.data.trackingCode, submitWb.data);
  const trackingCode = submitWb.data.trackingCode;

  const track = await api('GET', `/whistleblower/track/${trackingCode}`);
  check('tracking lookup works (no auth)', track.status === 200 && track.data.status === 'Received');

  const investigator = await loginAs('investigations@zacc.gov.zw');
  const wbList = await api('GET', '/whistleblower', null, investigator.accessToken);
  check('investigator can list reports', wbList.status === 200 && wbList.data.length >= 8, wbList.data.length);
  const newReport = wbList.data.find(r => r.tracking_code === trackingCode);
  const wbDetail = await api('GET', `/whistleblower/${newReport.id}`, null, investigator.accessToken);
  check('investigator decrypts report correctly', wbDetail.data.narrative === plaintext, wbDetail.data.narrative);
  const accessLog = await api('GET', `/whistleblower/${newReport.id}/access-log`, null, investigator.accessToken);
  check('decryption was logged to access log', accessLog.data.some(a => a.action.includes('Decrypted')));

  const officerNoAccess = await api('GET', '/whistleblower', null, officer.accessToken);
  check('non-investigator role is forbidden from whistleblower list', officerNoAccess.status === 403);

  console.log('=== 9. Corruption Risk Register ===');
  const risks = await api('GET', '/risk-register', null, admin.accessToken);
  check('risk register seeded', risks.data.length === 12, risks.data.length);
  const heatmap = await api('GET', '/risk-register/heatmap', null, admin.accessToken);
  check('heatmap has 25 cells (5x5)', heatmap.data.length === 25, heatmap.data.length);
  const newRisk = await api('POST', '/risk-register', { institutionId: inst.id, name: 'Test risk', category: 'Test', likelihood: 4, impact: 5 }, admin.accessToken);
  check('new risk computes inherent score 20 (Critical)', newRisk.data.inherentScore === 20 && newRisk.data.category === 'Critical', newRisk.data);
  const mitigation = await api('POST', `/risk-register/${newRisk.data.id}/mitigations`, { description: 'test mitigation', effectiveness: 'High' }, admin.accessToken);
  check('mitigation reduces residual score', mitigation.data.residualScore < 20, mitigation.data);

  console.log('=== 10. Procurement Monitoring + red flags ===');
  const flagged = await api('GET', '/procurement?flaggedOnly=true', null, admin.accessToken);
  check('flagged procurement records exist from seed', flagged.data.length >= 5, flagged.data.length);
  const egpSync = await api('POST', '/procurement/egp-sync', {}, admin.accessToken);
  check('eGP sync creates records', egpSync.data.imported === 4, egpSync.data);

  console.log('=== 11. Notifications ===');
  const notifs = await api('GET', '/notifications', null, officer.accessToken);
  check('notifications endpoint works', notifs.status === 200 && typeof notifs.data.unreadCount === 'number', notifs.data.unreadCount);
  const prefs = await api('PUT', '/notifications/preferences', { channel: 'sms', enabled: false }, officer.accessToken);
  check('notification preference update works', prefs.status === 200);
  const outbox = await api('GET', '/notifications/outbox/email', null, admin.accessToken);
  check('email outbox has entries (dev mailbox pattern)', outbox.data.length > 0, outbox.data.length);

  console.log('=== 12. Workflow Configs ===');
  const wfConfigs = await api('GET', '/workflow-configs', null, admin.accessToken);
  check('5 workflow configs seeded', wfConfigs.data.length === 5, wfConfigs.data.length);

  console.log('=== 13. GIS ===');
  const provinces = await api('GET', '/gis/provinces');
  check('GIS provinces cover all 10 provinces', provinces.data.length === 10, provinces.data.length);
  const clusters = await api('GET', '/gis/clusters?k=4', null, admin.accessToken);
  check('GIS clustering returns clusters with routes', clusters.data.length > 0 && clusters.data[0].suggestedRoute.length > 0, clusters.data.length);

  console.log('=== 14. Audit Dashboard (AUD-01..06) ===');
  const overview = await api('GET', '/dashboard/overview', null, admin.accessToken);
  check('dashboard overview works', overview.status === 200 && overview.data.activeInstitutions === 24, overview.data);
  const aud01 = await api('GET', '/dashboard/aud-01-overdue-recommendations', null, admin.accessToken);
  check('AUD-01 overdue recommendations buckets', aud01.status === 200 && typeof aud01.data.buckets === 'object', aud01.data.buckets);
  const aud02 = await api('GET', '/dashboard/aud-02-high-risk-institutions', null, admin.accessToken);
  check('AUD-02 high-risk institutions', aud02.status === 200);
  const aud04 = await api('GET', '/dashboard/aud-04-committee-performance', null, admin.accessToken);
  check('AUD-04 committee performance', aud04.status === 200 && aud04.data.length === 10, aud04.data.length);
  const aud06 = await api('GET', '/dashboard/aud-06-implementation-rate', null, admin.accessToken);
  check('AUD-06 implementation rate by source', aud06.status === 200 && aud06.data.length > 0, aud06.data);

  console.log('=== 15. Audit Log Explorer ===');
  const auditor = await loginAs('auditor@zacc.gov.zw');
  const auditLogs = await api('GET', '/audit-logs', null, auditor.accessToken);
  check('audit logs accessible to auditor', auditLogs.status === 200 && auditLogs.data.length > 0, auditLogs.data.length);
  const forbiddenAudit = await api('GET', '/audit-logs', null, officer.accessToken);
  check('audit logs forbidden to compliance officer', forbiddenAudit.status === 403);

  console.log('=== 16. Reports ===');
  const scorecard = await api('GET', `/reports/scorecard/${inst.id}`, null, admin.accessToken);
  check('scorecard PDF generated', scorecard.status === 200 && scorecard.data.byteLength > 1000);

  console.log('=== 17. AI Natural-Language Search ===');
  const search = await api('GET', '/ai/search?q=procurement segregation of duties', null, admin.accessToken);
  check('NL search returns ranked results', search.status === 200 && search.data.length > 0, search.data.length);

  console.log('=== 18. Mock External Systems ===');
  const ecms = await api('POST', '/mock-external/ecms/case', { sourceType: 'test', sourceId: '1', summary: 'test' }, admin.accessToken);
  check('mock ECMS case creation works', ecms.status === 200 && !!ecms.data.caseId);

  console.log('=== 19. Admin scheduler trigger ===');
  const schedRun = await api('POST', '/admin/run-scheduler', {}, admin.accessToken);
  check('manual scheduler run works', schedRun.status === 200 && !!schedRun.data.runAt, schedRun.data);

  console.log('=== 20. Engagement lifecycle (SOP engine, approval chains, documents) ===');
  const L = {
    officer: await loginAs('officer1@zacc.gov.zw'), tl: await loginAs('officer2@zacc.gov.zw'), prov: await loginAs('provincial.head@zacc.gov.zw'),
    mgr: await loginAs('manager.compliance@zacc.gov.zw'), gm: await loginAs('gm.prevention@zacc.gov.zw'), es: await loginAs('exec.secretary@zacc.gov.zw'),
    pc: await loginAs('prevention.committee@zacc.gov.zw'), cc: await loginAs('commission.chair@zacc.gov.zw'), mon: await loginAs('monitoring1@zacc.gov.zw'),
    focal: await loginAs('focal.1@institution-demo.zw'),
  };
  const STEP_USER = { TeamLeader: L.tl, ProvincialHead: L.prov, Manager: L.mgr, GM: L.gm, ExecutiveSecretary: L.es, PreventionCommittee: L.pc, CommissionChair: L.cc };
  const A = (u) => u.accessToken;
  const get = async (id, u = L.officer) => (await api('GET', `/engagements/${id}`, null, A(u))).data;
  async function drive(id, label) {
    let guard = 0, last = null;
    for (;;) {
      const e = await get(id);
      if (!e.current_step || guard++ > 12) break;
      const u = STEP_USER[e.current_step];
      const r = await api('POST', `/engagements/${id}/decision`, { decision: 'Approve', comment: 'ok', method: 'PCC' }, A(u));
      if (r.status !== 200) { check(`${label}: ${e.current_step} approval works`, false, r.data); break; }
      last = e.current_step;
    }
    return last;
  }

  const meta = await api('GET', '/engagements/meta', null, A(L.officer));
  check('engagement meta lists 8 SOP types', meta.status === 200 && (meta.data.sops || meta.data.sopTypes || []).length === 8, Object.keys(meta.data || {}));
  const sugg = await api('POST', '/engagements/suggest', { allegations: ['Unprocedural award of tender'] }, A(L.officer));
  check('suggest returns objectives and methodology', sugg.status === 200 && sugg.data.objectives.length >= 3 && sugg.data.methodology.length >= 3, sugg.data);

  const mk = await api('POST', '/engagements', { sopType: 'ComplianceAssessment', scopeKind: 'SpotCheck', institutionId: inst.id, title: 'E2E spot check', originSource: 'PublicComplaint', allegations: ['Unprocedural award of tender'], startDate: '2026-12-01', endDate: '2026-12-03', days: 3 }, A(L.officer));
  check('create engagement returns reference', mk.status === 201 && /^ZACC\/CSR\/\d{4}\/\d{3}$/.test(mk.data.reference), mk.data);
  const eid = mk.data.id;
  const noRole = await api('POST', '/engagements', { sopType: 'ComplianceAssessment', institutionId: inst.id, title: 'x' }, A(L.mon.accessToken ? L.focal : L.focal));
  check('institution user cannot create engagements', noRole.status === 403, noRole.status);
  const earlyC = await api('POST', `/engagements/${eid}/submit-concept`, {}, A(L.officer));
  check('concept cannot be submitted before preliminary assessment', earlyC.status === 400, earlyC.data);
  const badPre = await api('POST', `/engagements/${eid}/preliminary`, { credibility: 'Credible', notes: 'x' }, A(L.officer));
  check('preliminary requires proper notes', badPre.status === 400);
  const pre = await api('POST', `/engagements/${eid}/preliminary`, { credibility: 'Credible', notes: 'Complaint corroborated by documents received.' }, A(L.officer));
  check('preliminary assessment goes to Manager', pre.status === 200 && pre.data.current_step === 'Manager', pre.data.current_step);
  const wrongPre = await api('POST', `/engagements/${eid}/decision`, { decision: 'Approve' }, A(L.gm));
  check('GM cannot decide at the Manager step', wrongPre.status === 403, wrongPre.data);
  const noMethod = await (async () => { await api('POST', `/engagements/${eid}/decision`, { decision: 'Approve' }, A(L.mgr)); return api('POST', `/engagements/${eid}/decision`, { decision: 'Approve' }, A(L.gm)); })();
  check('GM must set the method (RFD/RR/PCC)', noMethod.status === 400, noMethod.data);
  const gmOk = await api('POST', `/engagements/${eid}/decision`, { decision: 'Approve', method: 'PCC', deploymentJustified: true }, A(L.gm));
  check('GM approval opens concept drafting', gmOk.data.status === 'ConceptDraft', gmOk.data.status);

  const team = await api('PUT', `/engagements/${eid}/team`, { team: [{ userId: L.officer.user.id, role: 'FocalPerson' }, { userId: L.tl.user.id, role: 'TeamLeader' }] }, A(L.officer));
  check('team allocated', team.status === 200 && team.data.team.length === 2, team.data);
  const dr = await api('POST', `/engagements/${eid}/draft-concept`, {}, A(L.officer));
  check('concept drafted from SOP defaults with RFD register', dr.status === 200 && dr.data.objectives.length >= 3 && dr.data.documents.length > 0, dr.data.objectives);
  const early = await api('POST', `/engagements/${eid}/submit-concept`, {}, A(L.officer));
  check('incomplete concept (no budget/itinerary) rejected', early.status === 400, early.data);
  const bud = await api('PUT', `/engagements/${eid}/budget`, { lines: [{ item: 'Fuel', unit: 'litres', quantity: 120, unit_cost: 1.5, persons: 1, days: 1 }, { item: 'Lunch', quantity: 1, unit_cost: 10, persons: 3, days: 4 }] }, A(L.officer));
  check('budget total computed (180 + 120)', bud.data.budgetTotal === 300, bud.data.budgetTotal);
  await api('PUT', `/engagements/${eid}/itinerary`, { rows: [{ day_no: 1, activity: 'Entrance meeting and interviews', activity_type: 'EntranceMeeting' }, { day_no: 3, activity: 'Exit meeting', activity_type: 'ExitMeeting' }] }, A(L.officer));
  const sub = await api('POST', `/engagements/${eid}/submit-concept`, {}, A(L.officer));
  check('concept submitted to Team Leader', sub.status === 200 && sub.data.status === 'ConceptReview' && sub.data.current_step === 'TeamLeader', sub.data.current_step);
  const lastC = await drive(eid, 'concept');
  const afterC = await get(eid);
  check('concept chain ends with Executive Secretary approval', lastC === 'ExecutiveSecretary' && afterC.status === 'Approved', [lastC, afterC.status]);
  const preFocal = await api('GET', `/engagements/${eid}`, null, A(L.focal));
  check('institution user cannot see engagement before notification', [403, 404].includes(preFocal.status), preFocal.status);

  const docs = {};
  for (const k of ['concept-note', 'memorandum']) { const r = await api('GET', `/engagements/${eid}/docs/${k}`, null, A(L.officer)); docs[k] = r; check(`${k} .docx generated`, r.status === 200 && r.data.byteLength > 5000 && Buffer.from(r.data).slice(0, 2).toString() === 'PK', [r.status, r.data && r.data.byteLength]); }
  const badNot = await api('POST', `/engagements/${eid}/notification`, {}, A(L.officer));
  check('only Executive Secretary may sign the notification letter', badNot.status === 403, badNot.status);
  const not = await api('POST', `/engagements/${eid}/notification`, {}, A(L.es));
  check('notification letter issued with reference', not.status === 200 && /^ZACC\/PREV\/CSR\/\d{4}\/\d{3}$/.test(not.data.notification_ref) && not.data.status === 'Notified', not.data.notification_ref);
  const nl = await api('GET', `/engagements/${eid}/docs/notification-letter`, null, A(L.es));
  check('notification letter .docx generated', nl.status === 200 && nl.data.byteLength > 5000, nl.status);
  const seen = await api('GET', `/engagements/${eid}`, null, A(L.focal));
  check('institution user cannot see another institution engagement', [403, 404].includes(seen.status), seen.status);

  const early2 = await api('PUT', `/engagements/${eid}/findings`, { findings: [{ issue: 'x' }] }, A(L.officer));
  check('findings blocked before fieldwork', early2.status === 400);
  const st = await api('POST', `/engagements/${eid}/start`, {}, A(L.officer));
  check('fieldwork started', st.data.status === 'Fieldwork', st.data);
  await api('POST', `/engagements/${eid}/meetings`, { kind: 'Entrance', summary: 'Scope explained', attendees: 'CEO, ZACC team' }, A(L.officer));
  await api('POST', `/engagements/${eid}/interviews`, { interviewee: 'Procurement Officer', position: 'PMU', minutes: 'Confirmed adjudication reversed.' }, A(L.officer));
  const fnd = await api('PUT', `/engagements/${eid}/findings`, { findings: [
    { issue: 'PMU understaffed', finding_points: ['2 officers'], legal_reference: 'PPDPA Act', recommendation: 'Increase PMU to 3', responsibility: 'CEO', time_frame: '3 months', severity: 'Medium', compliance_rating: 'PartiallyCompliant' },
    { issue: 'Possible criminal conduct', finding_points: ['Land sold without service'], recommendation: 'Refer to Investigations', responsibility: 'ZACC', referred_to_investigations: true }] }, A(L.officer));
  check('findings saved', fnd.status === 200 && fnd.data.length === 2, fnd.data);
  const noExit = await api('POST', `/engagements/${eid}/conclude`, {}, A(L.officer));
  check('cannot conclude without exit meeting', noExit.status === 400, noExit.data);
  await api('POST', `/engagements/${eid}/meetings`, { kind: 'Exit', summary: 'Preliminary findings discussed', attendees: 'CEO, ZACC team' }, A(L.officer));
  const con = await api('POST', `/engagements/${eid}/conclude`, {}, A(L.officer));
  check('conclusion starts the Implementation Matrix review', con.status === 200 && con.data.status === 'IMReview' && con.data.current_step === 'TeamLeader', [con.status, con.data.status]);
  const fid = (await get(eid)).findings[0].id;
  await api('POST', `/engagements/${eid}/decision`, { decision: 'Approve' }, A(L.tl));
  const cresp = await api('PUT', `/engagements/${eid}/findings/${fid}/client-response`, { response: 'Agreed' }, A(L.officer));
  check('client comment recorded on matrix', cresp.status === 200, cresp.data);
  const lastIM = await drive(eid, 'IM');
  const afterIM = await get(eid);
  check('IM adopted then report drafting', lastIM === 'ExecutiveSecretary' && afterIM.status === 'ReportDraft' && afterIM.im_status === 'Adopted', [afterIM.status, afterIM.im_status]);
  const sign = await api('POST', `/engagements/${eid}/im/sign`, { signatory: 'Council Chairperson' }, A(L.officer));
  check('IM signed by the client', sign.status === 200 && sign.data.im_status === 'Signed', sign.data.im_status);
  const rep = await api('POST', `/engagements/${eid}/report/submit`, { complianceLevel: 'Amber', conclusion: 'Partial compliance; recommendations proffered.' }, A(L.officer));
  check('report submitted for review', rep.status === 200 && rep.data.status === 'ReportReview', rep.data.status);
  const lastR = await drive(eid, 'report');
  const done = await get(eid);
  check('report chain ends at Commission; engagement completed with 3-month monitoring date', lastR === 'CommissionChair' && done.status === 'Completed' && !!done.monitoring_due_at, [lastR, done.status, done.monitoring_due_at]);
  check('only institution-owned findings published as recommendations (1 of 2)', done.findings.filter((f) => f.recommendation_id).length === 1, done.findings.map((f) => f.recommendation_id));
  for (const k of ['report', 'matrix', 'monitoring-notice']) { const r = await api('GET', `/engagements/${eid}/docs/${k}`, null, A(L.officer)); check(`${k} .docx generated`, r.status === 200 && r.data.byteLength > 4000 && Buffer.from(r.data).slice(0, 2).toString() === 'PK', [r.status, r.data && r.data.byteLength]); }
  const csv = await api('GET', `/engagements/${eid}/matrix.csv`, null, A(L.officer));
  check('implementation matrix CSV generated', csv.status === 200 && csv.data.byteLength > 50);
  const badDoc = await api('GET', `/engagements/${eid}/docs/nonsense`, null, A(L.officer));
  check('unknown document kind returns 404', badDoc.status === 404, badDoc.status);

  const mn = await api('POST', `/engagements/${eid}/monitoring/notice`, {}, A(L.mon));
  check('monitoring notice sent', mn.status === 200, mn.data);
  const certEarly = await api('POST', `/engagements/${eid}/certificate`, {}, A(L.es));
  check('certificate refused until Green', certEarly.status === 400, certEarly.data);
  const pend = await get(eid);
  const reg = await api('POST', `/engagements/${eid}/regulator-notices`, { measure: 'LimitedDevolutionFunds', regulator: 'Ministry of Local Government' }, A(L.gm));
  check('regulator measure can be proposed for non-compliant client', reg.status === 201, reg.data);
  const visit = await api('POST', `/engagements/${eid}/monitoring/visit`, { summary: 'All recommendations implemented', updates: pend.findings.filter((f) => f.recommendation_id).map((f) => ({ findingId: f.id, status: 'Verified' })) }, A(L.mon));
  check('monitoring visit updates findings', visit.status === 200, visit.data);
  const afterV = await get(eid);
  const referred = afterV.findings.filter((f) => !f.recommendation_id);
  check('monitoring visit sets status Monitoring', afterV.status === 'Monitoring', afterV.status);
  await api('POST', `/engagements/${eid}/monitoring/visit`, { summary: 'Referred item closed', updates: referred.map((f) => ({ findingId: f.id, status: 'Verified' })) }, A(L.mon));
  const cert = await api('POST', `/engagements/${eid}/certificate`, {}, A(L.es));
  check('certificate issued once Green', cert.status === 200 && !!cert.data.certificateNo, cert.data);
  const pdf = await api('GET', `/engagements/${eid}/docs/certificate`, null, A(L.es));
  check('certificate PDF generated', pdf.status === 200 && Buffer.from(pdf.data).slice(0, 4).toString() === '%PDF', pdf.status);

  // Return & reject rules
  const mk2 = await api('POST', '/engagements', { sopType: 'SystemsReview', institutionId: inst.id, title: 'E2E systems review' }, A(L.officer));
  await api('POST', `/engagements/${mk2.data.id}/preliminary`, { credibility: 'NotApplicable', notes: 'Routine programme item for the year.' }, A(L.officer));
  const noComment = await api('POST', `/engagements/${mk2.data.id}/decision`, { decision: 'Return' }, A(L.mgr));
  check('return requires a comment', noComment.status === 400, noComment.data);
  const ret = await api('POST', `/engagements/${mk2.data.id}/decision`, { decision: 'Return', comment: 'Clarify scope' }, A(L.mgr));
  check('returned preliminary goes back to the officer', ret.status === 200 && ret.data.status === 'Preliminary' && !ret.data.current_step, ret.data.status);
  await api('POST', `/engagements/${mk2.data.id}/preliminary`, { credibility: 'NotApplicable', notes: 'Scope clarified, resubmitting.' }, A(L.officer));
  await api('POST', `/engagements/${mk2.data.id}/decision`, { decision: 'Approve' }, A(L.mgr));
  const notJust = await api('POST', `/engagements/${mk2.data.id}/decision`, { decision: 'Approve', deploymentJustified: false, comment: 'Not justified' }, A(L.gm));
  check('GM can cancel when deployment is not justified', notJust.status === 200 && (await get(mk2.data.id)).status === 'Cancelled');

  const worklist = await api('GET', '/engagements?awaitingMe=true', null, A(L.gm));
  check('GM worklist includes seeded pending concept', worklist.status === 200 && worklist.data.some((c) => c.status === 'ConceptReview'), worklist.data.length);
  const focalList = await api('GET', '/engagements', null, A(L.focal));
  check('institution user sees only own-institution notified engagements', focalList.status === 200 && focalList.data.every((c) => c.institution_id === L.focal.user.institutionId), focalList.data.length);
  console.log('=== 21. Access control, scoping and temporary passwords ===');
  const focalInst = L.focal.user.institutionId;
  const otherInst = instList.data.results.find((i) => i.id !== focalInst);
  const anon = await api('GET', '/institutions');
  check('institution registry requires sign-in', anon.status === 401, anon.status);
  const pub = await api('GET', '/gis/provinces');
  check('province map aggregate remains public', pub.status === 200);
  const wbInst = await api('GET', '/whistleblower/institutions');
  check('whistleblower institution picker is public and minimal', wbInst.status === 200 && wbInst.data.length > 0 && !('risk_level' in wbInst.data[0]), wbInst.status);
  const fa = await api('GET', '/assessments', null, A(L.focal));
  check('focal person sees only own-institution assessments', fa.status === 200 && fa.data.every((a) => a.institution_id === focalInst), fa.data.length);
  const otherA = await api('GET', '/assessments', null, A(admin));
  const foreign = otherA.data.find((a) => a.institution_id !== focalInst);
  const fa2 = await api('GET', `/assessments/${foreign.id}`, null, A(L.focal));
  check('focal person cannot open another institution assessment', fa2.status === 404, fa2.status);
  const fa3 = await api('GET', `/recommendations?institutionId=${otherInst.id}`, null, A(L.focal));
  check('focal person cannot query another institution recommendations', fa3.status === 403, fa3.status);
  const fr = await api('GET', '/recommendations', null, A(L.focal));
  check('recommendation list pinned to own institution', fr.status === 200 && fr.data.every((r) => r.institution_id === focalInst), fr.data.length);
  for (const path of ['/dashboard/aud-02-high-risk-institutions', '/procurement', '/systems-reviews', '/reports/summary', '/ai/search?q=test', '/gis/heatmap', '/users?role=COMPLIANCE_OFFICER', '/recommendations/register/export.csv', '/ai-governance/decisions', '/monitoring/ecmd', '/monitoring/funds'])
    { const r = await api('GET', path, null, A(L.focal)); check(`institution user blocked from ${path}`, r.status === 403, r.status); }
  const ov = await api('GET', '/dashboard/overview', null, A(L.focal));
  check('institution dashboard overview is scoped to own institution', ov.status === 200 && ov.data.scope === 'institution' && ov.data.activeInstitutions === 1, ov.data);
  const wrongWrite = await api('PUT', `/assessments/${assessmentId}/submit`, {}, A(L.focal));
  check('institution user cannot submit assessments', wrongWrite.status === 403, wrongWrite.status);
  const ph = await api('GET', '/assessments', null, A(L.prov));
  check('Provincial Head sees only own province assessments', ph.status === 200 && ph.data.length > 0 ? ph.data.every((a) => a.institution_province === 'Masvingo') : ph.status === 200, ph.data.length);
  const phInst = await api('GET', '/institutions?limit=100', null, A(L.prov));
  check('Provincial Head institution list pinned to province', phInst.status === 200 && phInst.data.results.every((i) => i.province === 'Masvingo'), phInst.data.total);
  const phOther = await api('GET', `/institutions/${instList.data.results.find((i) => i.province !== 'Masvingo').id}/summary`, null, A(L.prov));
  check('Provincial Head cannot open an institution outside the province', phOther.status === 404, phOther.status);

  const newU = await api('POST', '/users', { name: 'Temp User', email: 'temp.user@zacc.gov.zw', role: 'COMPLIANCE_OFFICER', province: 'Harare' }, A(admin));
  check('created user gets a generated one-time password (not the shared demo one)', newU.status === 201 && newU.data.temporaryPassword && newU.data.temporaryPassword !== 'ZaccDemo#2026' && newU.data.temporaryPassword.length >= 10, newU.status);
  const tmp = await loginAs('temp.user@zacc.gov.zw', newU.data.temporaryPassword);
  const blocked = await api('GET', '/institutions', null, A(tmp));
  check('temporary-password session is blocked until the password is changed', blocked.status === 403 && blocked.data.code === 'PASSWORD_CHANGE_REQUIRED', blocked.data);
  const weak = await api('POST', '/auth/change-password', { currentPassword: newU.data.temporaryPassword, newPassword: 'short' }, A(tmp));
  check('weak new password rejected', weak.status === 400, weak.data);
  const chg = await api('POST', '/auth/change-password', { currentPassword: newU.data.temporaryPassword, newPassword: 'Str0ng-Passw0rd!' }, A(tmp));
  check('password change returns a fresh unrestricted session', chg.status === 200 && !!chg.data.accessToken, chg.data);
  const okNow = await api('GET', '/institutions', null, chg.data.accessToken ? { accessToken: chg.data.accessToken } && chg.data.accessToken : null);
  check('normal access after the password is changed', okNow.status === 200, okNow.status);
  const badRole = await api('POST', '/users', { name: 'X', email: 'x1@zacc.gov.zw', role: 'GM_PREVENTION_OLD' }, A(admin));
  check('unknown role rejected on user create', badRole.status === 400);

  console.log('=== 22. Registers: audit findings, funds, projects, IC, ECMD, plan ===');
  const af = await api('POST', '/monitoring/audit-findings', { institutionId: inst.id, source: 'OAG', reportYear: 2023, opinion: 'Qualified', findingText: 'Fixed asset register not maintained and assets not verified', ipsasRef: 'IPSAS 17', category: 'Assets', amountUsd: 1000 }, A(L.mgr));
  check('audit finding recorded', af.status === 201 && af.data.repeat === false, af.data);
  const af2 = await api('POST', '/monitoring/audit-findings', { institutionId: inst.id, source: 'OAG', reportYear: 2024, findingText: 'Fixed asset register not maintained; assets were not verified', category: 'Assets' }, A(L.mgr));
  check('repeat finding detected across years', af2.status === 201 && af2.data.repeat === true, af2.data);
  const imp = await api('POST', '/monitoring/audit-findings/import', { institutionId: inst.id, source: 'OAG', reportYear: 2025, findings: [{ findingText: 'Payroll deductions not remitted timeously' }, { findingText: 'Fixed asset register not maintained and assets not verified' }] }, A(L.mgr));
  check('OAG bulk import with repeat detection', imp.status === 201 && imp.data.imported === 2 && imp.data.repeats >= 1, imp.data);
  const tr = await api('POST', `/monitoring/audit-findings/${af2.data.id}/recommend`, {}, A(L.mgr));
  check('audit finding converted into a tracked recommendation', tr.status === 201 && !!tr.data.recommendationId, tr.data);
  const tr2 = await api('POST', `/monitoring/audit-findings/${af2.data.id}/recommend`, {}, A(L.mgr));
  check('cannot track the same finding twice', tr2.status === 400);
  const sumF = await api('GET', '/monitoring/audit-findings/summary', null, A(L.mgr));
  check('audit findings summary per institution', sumF.status === 200 && sumF.data.length > 0, sumF.status);
  const noAud = await api('POST', '/monitoring/audit-findings', { institutionId: inst.id, source: 'OAG', reportYear: 2025, findingText: 'x' }, A(L.focal));
  check('institution user cannot add audit findings', noAud.status === 403);

  const fd = await api('POST', '/monitoring/funds', { institutionId: inst.id, fund: 'ZINARA', fiscalYear: 2024, quarter: 1, amountDisbursed: 1000, amountSpent: 1000, legacyDebtPaid: 600 }, A(L.mgr));
  check('fund disbursement recorded', fd.status === 201, fd.data);
  const fl = await api('GET', '/monitoring/funds?flagged=true', null, A(L.mgr));
  const mine2 = fl.data.find((f) => f.id === fd.data.id);
  check('overdue acquittal and high legacy-debt share flagged', mine2 && mine2.flags.includes('AcquittalOverdue') && mine2.flags.includes('LegacyDebtHigh'), mine2 && mine2.flags);
  const acq = await api('PUT', `/monitoring/funds/${fd.data.id}`, { acquitted: true }, A(L.mgr));
  check('fund acquitted', acq.status === 200);
  const fcsv = await api('GET', '/monitoring/funds/export.csv', null, A(L.mgr));
  check('fund acquittal CSV export', fcsv.status === 200 && fcsv.data.byteLength > 50);

  const pg = await api('POST', '/monitoring/programmes', { institutionId: inst.id, kind: 'Project', name: 'E2E clinic', budgetUsd: 1000, spentUsd: 900, endDate: '2025-01-01', reportedProgress: 80 }, A(L.officer));
  check('government project registered', pg.status === 201, pg.data);
  const rp = await api('POST', `/monitoring/programmes/${pg.data.id}/reports`, { period: '2026-Q3', reportedProgress: 90, spentUsd: 900, narrative: 'Roof done' }, A(L.officer));
  check('progress report filed', rp.status === 201, rp.data);
  const vr = await api('PUT', `/monitoring/programmes/${pg.data.id}/reports/${rp.data.id}/verify`, { verifiedProgress: 50 }, A(L.officer));
  check('physical verification recorded', vr.status === 200, vr.data);
  const pd = await api('GET', `/monitoring/programmes/${pg.data.id}`, null, A(L.officer));
  check('gap between reported and verified progress flagged', pd.data.flags.includes('ReportedAheadOfVerified') && pd.data.flags.includes('SpendAheadOfProgress') && pd.data.flags.includes('PastEndDate'), pd.data.flags);

  const icOv = await api('GET', '/monitoring/ic/overview', null, A(L.officer));
  check('IC overview lists committees', icOv.status === 200 && icOv.data.length > 0, icOv.status);
  const com = icOv.data[0];
  const rf = await api('POST', '/monitoring/ic/return-forms', { committeeId: com.id, trainingDate: '2026-10-01', memberCount: 7, hasHrm: true, hasLegal: false, hasAudit: true }, A(L.officer));
  check('IC return form warns about missing legal representation and schedules 30-day deliverables', rf.status === 201 && rf.data.warnings.length === 1, rf.data);
  const icd = await api('GET', `/monitoring/ic/${com.id}/detail`, null, A(L.officer));
  check('IC detail shows deliverables', icd.status === 200 && icd.data.deliverables.length >= 4, icd.data.deliverables && icd.data.deliverables.length);
  const sd = await api('POST', `/monitoring/ic/deliverables/${icd.data.deliverables[0].id}/submit`, {}, A(L.officer));
  check('IC deliverable submitted', sd.status === 200);
  const qr = await api('POST', '/monitoring/ic/quarterly-reports', { committeeId: com.id, period: '2026-Q3', summary: 'ok', actionsCompleted: 5, actionsPlanned: 4 }, A(L.officer));
  check('quarterly report rejects completed > planned', qr.status === 400, qr.data);
  const qr2 = await api('POST', '/monitoring/ic/quarterly-reports', { committeeId: com.id, period: '2026-Q3', summary: 'ok', actionsCompleted: 3, actionsPlanned: 4 }, A(L.officer));
  check('quarterly report filed', qr2.status === 201);
  const chairs = await loginAs('committee.chair.1@institution-demo.zw');
  const own = await api('GET', '/monitoring/ic/overview', null, A(chairs));
  check('committee chair sees only own committee', own.status === 200 && own.data.every((c) => c.institution_id === chairs.user.institutionId), own.data.length);

  const ecmd = await api('GET', '/monitoring/ecmd', null, A(L.gm));
  check('ECMD shows RAG summary with history', ecmd.status === 200 && ecmd.data.summary.total >= 2 && ecmd.data.rows.some((r) => r.history.length >= 1), ecmd.data.summary);
  const planR = await api('GET', '/monitoring/plan', null, A(L.mgr));
  check('quarterly monitoring plan generated', planR.status === 200 && Array.isArray(planR.data.items) && planR.data.items.length > 0, planR.data);
  const certs = await api('GET', '/monitoring/certificates', null, A(L.gm));
  check('certificate register lists issued certificates', certs.status === 200 && certs.data.length >= 2, certs.data.length);
  const lib = await api('GET', '/monitoring/libraries', null, A(L.officer));
  check('legal and red-flag libraries available', lib.status === 200 && lib.data.legalReferences.length >= 10 && lib.data.redFlags.length >= 20, [lib.data.legalReferences && lib.data.legalReferences.length, lib.data.redFlags && lib.data.redFlags.length]);

  const pl = await api('POST', '/pledges', { institutionId: inst.id, title: 'E2E pledge', expiryDate: '2026-11-01' }, A(L.officer));
  const cer0 = await api('PUT', `/pledges/${pl.data.id}/ceremony`, { ceremonyDate: '2026-10-20', commissionerOfOaths: 'J. Moyo', copiesPrinted: 2 }, A(L.officer));
  check('pledge ceremony needs three copies', cer0.status === 400, cer0.data);
  const cer = await api('PUT', `/pledges/${pl.data.id}/ceremony`, { ceremonyDate: '2026-10-20', commissionerOfOaths: 'J. Moyo', copiesPrinted: 3 }, A(L.officer));
  check('pledge ceremony recorded', cer.status === 200, cer.data);
  const ren = await api('POST', `/pledges/${pl.data.id}/renew`, {}, A(L.officer));
  check('pledge renewed for a further year', ren.status === 200 && ren.data.expiryDate === '2027-11-01', ren.data);

  console.log('=== 23. AI governance ===');
  const ai = await api('POST', `/assessments/${assessmentId}/ai-draft`, {}, A(officer));
  check('AI draft returns decision id, explanation and human-review flag', ai.status === 200 && !!ai.data.aiDecisionId && ai.data.explanation.method && ai.data.requiresHumanReview === true, ai.data);
  const noReason = await api('POST', `/ai-governance/decisions/${ai.data.aiDecisionId}/review`, { action: 'Overridden' }, A(L.officer));
  check('override requires a reason', noReason.status === 400, noReason.data);
  const mod = await api('POST', `/ai-governance/decisions/${ai.data.aiDecisionId}/review`, { action: 'Modified', reason: 'Added local context', finalText: 'Edited narrative by officer.' }, A(L.officer));
  check('human modification recorded', mod.status === 200, mod.data);
  const applied = await api('GET', `/assessments/${assessmentId}`, null, A(L.officer));
  check('modified text is applied to the assessment', applied.data.findings_text === 'Edited narrative by officer.', applied.data.findings_text);
  const again = await api('POST', `/ai-governance/decisions/${ai.data.aiDecisionId}/review`, { action: 'Accepted' }, A(L.officer));
  check('an AI output can only be reviewed once', again.status === 400);
  const pred = await api('GET', `/dashboard/predictive/${inst.id}`, null, A(L.gm));
  check('predictive output is explained and logged', pred.status === 200 && pred.data.explanation && pred.data.explanation.method, pred.status);
  const bias = await api('GET', '/ai-governance/bias', null, A(L.gm));
  check('bias monitoring reports override rates and disparities', bias.status === 200 && bias.data.features.length >= 1 && Array.isArray(bias.data.byProvince), bias.data);
  const noBias = await api('GET', '/ai-governance/bias', null, A(L.officer));
  check('bias monitoring restricted to oversight roles', noBias.status === 403);
  const sch = await api('POST', '/admin/run-scheduler', {}, A(admin));
  check('scheduler sweep includes engagement timelines', sch.status === 200 && sch.data.engagements && 'escalated' in sch.data.engagements, sch.data);

  console.log('=== 24. Simple SOPs, additive findings and recommendation sync ===');
  const toFieldwork = async (sopType, title, method) => {
    const m = await api('POST', '/engagements', { sopType, institutionId: inst.id, title, originSource: 'RoutineProgramme', rationale: 'Annual programme', startDate: '2026-12-10', endDate: '2026-12-10', days: 1 }, A(L.officer));
    const id = m.data.id;
    await api('POST', `/engagements/${id}/preliminary`, { credibility: 'NotApplicable', notes: 'Routine programme item for the year.' }, A(L.officer));
    await api('POST', `/engagements/${id}/decision`, { decision: 'Approve' }, A(L.mgr));
    await api('POST', `/engagements/${id}/decision`, { decision: 'Approve', method, deploymentJustified: true }, A(L.gm));
    await api('PUT', `/engagements/${id}/team`, { team: [{ userId: L.officer.user.id, role: 'FocalPerson' }, { userId: L.tl.user.id, role: 'TeamLeader' }] }, A(L.officer));
    await api('POST', `/engagements/${id}/draft-concept`, {}, A(L.officer));
    await api('PUT', `/engagements/${id}/budget`, { lines: [{ item: 'Fuel', unit: 'litres', quantity: 40, unit_cost: 1.5, persons: 1, days: 1 }] }, A(L.officer));
    await api('PUT', `/engagements/${id}/itinerary`, { rows: [{ day_no: 1, activity: 'Session', activity_type: 'Training' }] }, A(L.officer));
    const sub = await api('POST', `/engagements/${id}/submit-concept`, {}, A(L.officer));
    await drive(id, 'concept');
    await api('POST', `/engagements/${id}/notification`, {}, A(L.es));
    const st = await api('POST', `/engagements/${id}/start`, {}, A(L.officer));
    return { id, sub, st };
  };
  const mkIc = await api('POST', '/committees', { institutionId: inst.id, formedDate: '2026-01-15' }, admin.accessToken);
  check('Integrity Committee registered for the demo institution', mkIc.status === 201, mkIc.data);
  const ict = await toFieldwork('ICTraining', 'E2E IC training');
  check('IC training reaches fieldwork', ict.st.data && ict.st.data.status === 'Fieldwork', [ict.sub.data && ict.sub.data.status, ict.st.data]);
  const badT = await api('POST', `/engagements/${ict.id}/complete-simple`, { trainingDate: '2026-12-10', memberCount: 2, hasHrm: true, hasLegal: true, hasAudit: true }, A(L.officer));
  check('IC training needs at least 3 members', badT.status === 400, badT.data);
  const okT = await api('POST', `/engagements/${ict.id}/complete-simple`, { trainingDate: '2026-12-10', memberCount: 5, hasHrm: true, hasLegal: true, hasAudit: false, topics: 'Integrity planning', trainers: 'ZACC' }, A(L.officer));
  check('IC training completed', okT.status === 200 && okT.data.status === 'Completed', okT.data);
  const pst = await toFieldwork('PledgeSigning', 'E2E pledge signing');
  const badP = await api('POST', `/engagements/${pst.id}/complete-simple`, { signedCount: 4, commissionerOfOaths: 'J. Moyo', copiesPrinted: 2, ceremonyDate: '2026-12-10' }, A(L.officer));
  check('pledge signing needs three copies', badP.status === 400, badP.data);
  const okP = await api('POST', `/engagements/${pst.id}/complete-simple`, { signedCount: 4, commissionerOfOaths: 'J. Moyo', copiesPrinted: 3, ceremonyDate: '2026-12-10' }, A(L.officer));
  check('pledge signing completed', okP.status === 200 && okP.data.status === 'Completed', okP.data);
  const csr = await toFieldwork('ComplianceAssessment', 'E2E additive findings', 'RFD');
  const add = await api('POST', `/engagements/${csr.id}/findings/add`, { issue: 'Offline-captured finding', finding_points: ['Seen on site'], recommendation: 'Fix it', responsibility: 'CEO' }, A(L.officer));
  const add2 = await api('POST', `/engagements/${csr.id}/findings/add`, { issue: 'Second finding', recommendation: 'Fix too', responsibility: 'CEO' }, A(L.officer));
  const lst = await get(csr.id);
  check('findings/add appends without overwriting', add.status === 201 && add2.status === 201 && lst.findings.length === 2 && lst.findings[1].seq === 2, lst.findings && lst.findings.length);

  console.log('\n=================================');
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  console.log('=================================');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL TEST ERROR:', e); process.exit(1); });
