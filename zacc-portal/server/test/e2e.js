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

async function loginAs(email, password = 'ZaccDemo#2026') {
  const step1 = await api('POST', '/auth/login', { email, password });
  if (step1.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(step1.data)}`);
  if (step1.data.mfaSetupRequired) {
    const code = authenticator.generate(step1.data.manualEntryKey);
    const step2 = await api('POST', '/auth/mfa/setup/verify', { tempToken: step1.data.tempToken, token: code });
    if (step2.status !== 200) throw new Error(`mfa setup failed for ${email}: ${JSON.stringify(step2.data)}`);
    return step2.data;
  } else if (step1.data.mfaChallengeRequired) {
    // shouldn't happen on fresh seed, but handle it
    throw new Error('unexpected mfaChallengeRequired on first login');
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
  const instList = await api('GET', '/institutions?limit=100');
  check('institutions list returns 24 seeded institutions', instList.data.total === 24, instList.data.total);
  const inst = instList.data.results[0];
  const instSummary = await api('GET', `/institutions/${inst.id}/summary`);
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

  const preventionHead = await loginAs('prevention.head@zacc.gov.zw');
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
  check('4 workflow configs seeded', wfConfigs.data.length === 4, wfConfigs.data.length);

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

  console.log('\n=================================');
  console.log(`RESULTS: ${pass} passed, ${fail} failed`);
  console.log('=================================');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL TEST ERROR:', e); process.exit(1); });
