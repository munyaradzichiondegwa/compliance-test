import React, { useState } from 'react';
import { api, downloadBlob } from '../../api/client';
import { RagBadge } from '../../components/common/UI';
import { useAction, Section, Err, Field } from './parts';
import { IMPL_LABELS, RATING_LABELS, fmtDate, today } from './common';

type P = { e: any; onChange: (e: any) => void; canEdit: boolean };

export function DocumentsPanel({ e, onChange, canEdit }: P) {
  const [doc, setDoc] = useState('');
  const a = useAction(onChange);
  const editable = canEdit && ['ConceptDraft', 'Notified', 'Fieldwork'].includes(e.status);
  const setStatus = (id: string, status: string) => a.run(async () => { await api.put(`/engagements/${e.id}/documents/${id}`, { status }); return api.get(`/engagements/${e.id}`); });
  return (
    <Section title="Request for documents (RFD)" hint="Documents requested from the institution, and whether they have been received.">
      {e.documents.length === 0 ? <p className="text-sm text-slate">No documents requested yet.</p> : (
        <table className="w-full text-sm"><caption className="sr-only">Documents requested</caption>
          <thead><tr className="text-xs text-slate text-left"><th scope="col" className="pb-1">Document</th><th scope="col">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{e.documents.map((d: any) => (
            <tr key={d.id}><td className="py-1.5 pr-3">{d.document}</td>
              <td>{editable ? <select aria-label={`Status of ${d.document}`} className="input !py-0.5 text-xs !w-auto" value={d.status} onChange={(x) => setStatus(d.id, x.target.value)}>{['Requested', 'Received', 'Outstanding', 'NotAvailable'].map((s) => <option key={s}>{s}</option>)}</select> : d.status}</td></tr>))}
          </tbody></table>)}
      {editable && (
        <div className="flex gap-2 mt-3"><input aria-label="Document to request" className="input" placeholder="Add a document to request" value={doc} onChange={(x) => setDoc(x.target.value)} />
          <button className="btn-outline" disabled={!doc.trim() || a.busy} onClick={() => a.run(async () => { await api.post(`/engagements/${e.id}/documents`, { document: doc }); setDoc(''); return api.get(`/engagements/${e.id}`); })}>Add</button></div>)}
      <Err msg={a.error} />
    </Section>
  );
}

export function FieldworkRecords({ e, onChange, canEdit }: P) {
  const editable = canEdit && e.status === 'Fieldwork';
  const refresh = () => api.get(`/engagements/${e.id}`);
  const a = useAction(onChange);
  const [m, setM] = useState({ kind: 'Entrance', summary: '', attendees: '', heldAt: today(), focalPerson: '' });
  const [iv, setIv] = useState({ interviewee: '', position: '', date: today(), minutes: '' });
  return (
    <Section title="Meetings and interviews" hint="Entrance meeting (agree the focal person), exit meeting, and minutes of every interview.">
      <h3 className="text-sm font-medium mb-1">Meetings</h3>
      {e.meetings.length === 0 && <p className="text-sm text-slate mb-2">None recorded.</p>}
      <ul className="text-sm mb-3 space-y-1">{e.meetings.map((x: any) => <li key={x.id}><strong>{x.kind} meeting</strong> · {fmtDate(x.held_at)} — {x.summary}{x.focal_person_designated ? ` (focal person: ${x.focal_person_designated})` : ''}</li>)}</ul>
      {editable && (
        <div className="grid gap-2 mb-5 sm:grid-cols-2">
          <Field id="m-k" label="Meeting"><select id="m-k" className="input" value={m.kind} onChange={(x) => setM({ ...m, kind: x.target.value })}><option>Entrance</option><option>Exit</option></select></Field>
          <Field id="m-d" label="Date"><input id="m-d" type="date" className="input" value={m.heldAt} onChange={(x) => setM({ ...m, heldAt: x.target.value })} /></Field>
          <Field id="m-a" label="Attendees"><input id="m-a" className="input" value={m.attendees} onChange={(x) => setM({ ...m, attendees: x.target.value })} /></Field>
          {m.kind === 'Entrance' && <Field id="m-f" label="Focal person designated"><input id="m-f" className="input" value={m.focalPerson} onChange={(x) => setM({ ...m, focalPerson: x.target.value })} /></Field>}
          <div className="sm:col-span-2"><Field id="m-s" label="Summary"><textarea id="m-s" className="input" rows={2} value={m.summary} onChange={(x) => setM({ ...m, summary: x.target.value })} /></Field></div>
          <div><button className="btn-outline" disabled={!m.summary.trim() || a.busy} onClick={() => a.run(async () => { await api.post(`/engagements/${e.id}/meetings`, m); setM({ ...m, summary: '' }); return refresh(); })}>Record meeting</button></div>
        </div>)}
      <h3 className="text-sm font-medium mb-1">Interviews</h3>
      {e.interviews.length === 0 && <p className="text-sm text-slate mb-2">None recorded.</p>}
      <ul className="text-sm mb-3 space-y-1">{e.interviews.map((x: any) => <li key={x.id}><strong>{x.interviewee}</strong>{x.position ? `, ${x.position}` : ''} · {fmtDate(x.interview_date)} — {x.minutes}</li>)}</ul>
      {editable && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field id="i-n" label="Interviewee"><input id="i-n" className="input" value={iv.interviewee} onChange={(x) => setIv({ ...iv, interviewee: x.target.value })} /></Field>
          <Field id="i-p" label="Position"><input id="i-p" className="input" value={iv.position} onChange={(x) => setIv({ ...iv, position: x.target.value })} /></Field>
          <div className="sm:col-span-2"><Field id="i-m" label="Minutes"><textarea id="i-m" className="input" rows={3} value={iv.minutes} onChange={(x) => setIv({ ...iv, minutes: x.target.value })} /></Field></div>
          <div><button className="btn-outline" disabled={!iv.interviewee.trim() || !iv.minutes.trim() || a.busy} onClick={() => a.run(async () => { await api.post(`/engagements/${e.id}/interviews`, iv); setIv({ ...iv, interviewee: '', position: '', minutes: '' }); return refresh(); })}>Record interview</button></div>
        </div>)}
      <Err msg={a.error} />
    </Section>
  );
}

const blankFinding = () => ({ issue: '', finding_points: [''] as string[], legal_reference: '', category: '', severity: 'Medium', compliance_rating: 'NonCompliant', recommendation: '', responsibility: '', time_frame: 'Immediate', due_date: '', referred_to_investigations: false });

export function FindingsEditor({ e, onChange, canEdit }: P) {
  const [rows, setRows] = useState<any[]>(e.findings.map((f: any) => ({ ...f, due_date: f.due_date || '' })));
  const a = useAction(onChange);
  const editable = canEdit && e.status === 'Fieldwork';
  const set = (i: number, k: string, v: any) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = () => a.run(async () => { await api.put(`/engagements/${e.id}/findings`, { findings: rows.map((r) => ({ ...r, finding_points: (r.finding_points as string[]).filter((p) => p.trim()) })) }); return api.get(`/engagements/${e.id}`); });
  if (!editable) return null;
  return (
    <Section title="Findings and Implementation Matrix" hint="Each finding becomes a row of the Implementation Matrix: issue, finding, recommendation, responsibility and time frame.">
      {rows.map((r, i) => (
        <fieldset key={r.id || i} className="border border-line rounded-lg p-3 mb-3">
          <legend className="text-xs font-medium px-1">Finding {i + 1}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field id={`f-i${i}`} label="Issue"><input id={`f-i${i}`} className="input" value={r.issue} onChange={(x) => set(i, 'issue', x.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Field id={`f-p${i}`} label="Findings (one per line)"><textarea id={`f-p${i}`} className="input" rows={3} value={(r.finding_points as string[]).join('\n')} onChange={(x) => set(i, 'finding_points', x.target.value.split('\n'))} /></Field></div>
            <Field id={`f-l${i}`} label="Legal reference"><input id={`f-l${i}`} className="input" value={r.legal_reference || ''} onChange={(x) => set(i, 'legal_reference', x.target.value)} /></Field>
            <Field id={`f-c${i}`} label="Category"><input id={`f-c${i}`} className="input" value={r.category || ''} onChange={(x) => set(i, 'category', x.target.value)} /></Field>
            <Field id={`f-r${i}`} label="Compliance rating"><select id={`f-r${i}`} className="input" value={r.compliance_rating} onChange={(x) => set(i, 'compliance_rating', x.target.value)}>{Object.entries(RATING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field id={`f-s${i}`} label="Severity"><select id={`f-s${i}`} className="input" value={r.severity} onChange={(x) => set(i, 'severity', x.target.value)}>{['Low', 'Medium', 'High', 'Critical'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field id={`f-rc${i}`} label="Recommendation"><textarea id={`f-rc${i}`} className="input" rows={2} value={r.recommendation || ''} onChange={(x) => set(i, 'recommendation', x.target.value)} /></Field></div>
            <Field id={`f-rs${i}`} label="Responsibility"><input id={`f-rs${i}`} className="input" value={r.responsibility || ''} onChange={(x) => set(i, 'responsibility', x.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field id={`f-t${i}`} label="Time frame"><input id={`f-t${i}`} className="input" value={r.time_frame || ''} onChange={(x) => set(i, 'time_frame', x.target.value)} /></Field>
              <Field id={`f-d${i}`} label="Due date"><input id={`f-d${i}`} type="date" className="input" value={r.due_date} onChange={(x) => set(i, 'due_date', x.target.value)} /></Field>
            </div>
            <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={!!r.referred_to_investigations} onChange={(x) => set(i, 'referred_to_investigations', x.target.checked)} /> Refer to Investigations (suspected corruption beyond the compliance mandate)</label>
          </div>
          <button type="button" className="text-xs text-status-red mt-2" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove finding {i + 1}</button>
        </fieldset>
      ))}
      <div className="flex gap-2"><button className="btn-outline" onClick={() => setRows([...rows, blankFinding()])}>+ Add finding</button><button className="btn-primary" disabled={a.busy} onClick={save}>Save findings</button></div>
      <Err msg={a.error} />
    </Section>
  );
}

export function SimpleCompletion({ e, onChange, canEdit }: P) {
  const a = useAction(onChange);
  const [t, setT] = useState({ trainingDate: today(), memberCount: 3, hasHrm: true, hasLegal: false, hasAudit: false, topics: '', trainers: '' });
  const [p, setP] = useState({ signedCount: 1, commissionerOfOaths: '', copiesPrinted: 3, ceremonyDate: today() });
  if (!canEdit || e.status !== 'Fieldwork' || e.sop.hasReport) return null;
  const isTraining = e.sop_type === 'ICTraining';
  return (
    <Section title={isTraining ? 'Record the training' : 'Record the pledge-signing ceremony'} hint={isTraining ? 'The Integrity Committee must have at least 3 members, including HRM, Legal and Audit representatives.' : 'Pledges are signed before a Commissioner of Oaths; three copies are printed and signed.'}>
      {isTraining ? (
        <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
          <Field id="t-d" label="Training date"><input id="t-d" type="date" className="input" value={t.trainingDate} onChange={(x) => setT({ ...t, trainingDate: x.target.value })} /></Field>
          <Field id="t-n" label="Committee members trained"><input id="t-n" type="number" min={1} className="input" value={t.memberCount} onChange={(x) => setT({ ...t, memberCount: Number(x.target.value) })} /></Field>
          <fieldset className="sm:col-span-2 flex gap-4 text-sm"><legend className="sr-only">Representation</legend>
            {([['hasHrm', 'HRM'], ['hasLegal', 'Legal'], ['hasAudit', 'Audit']] as const).map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={(t as any)[k]} onChange={(x) => setT({ ...t, [k]: x.target.checked })} /> {l} represented</label>)}</fieldset>
          <div className="sm:col-span-2"><Field id="t-t" label="Topics covered"><textarea id="t-t" className="input" rows={2} value={t.topics} onChange={(x) => setT({ ...t, topics: x.target.value })} /></Field></div>
          <Field id="t-r" label="Trainers"><input id="t-r" className="input" value={t.trainers} onChange={(x) => setT({ ...t, trainers: x.target.value })} /></Field>
          <div className="sm:col-span-2"><button className="btn-primary" disabled={a.busy} onClick={() => a.run(() => api.post(`/engagements/${e.id}/complete-simple`, t))}>Complete engagement</button></div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
          <Field id="p-d" label="Ceremony date"><input id="p-d" type="date" className="input" value={p.ceremonyDate} onChange={(x) => setP({ ...p, ceremonyDate: x.target.value })} /></Field>
          <Field id="p-n" label="Pledges signed"><input id="p-n" type="number" min={1} className="input" value={p.signedCount} onChange={(x) => setP({ ...p, signedCount: Number(x.target.value) })} /></Field>
          <Field id="p-c" label="Commissioner of Oaths"><input id="p-c" className="input" value={p.commissionerOfOaths} onChange={(x) => setP({ ...p, commissionerOfOaths: x.target.value })} /></Field>
          <Field id="p-p" label="Copies printed"><input id="p-p" type="number" min={1} className="input" value={p.copiesPrinted} onChange={(x) => setP({ ...p, copiesPrinted: Number(x.target.value) })} /></Field>
          <div className="sm:col-span-2"><button className="btn-primary" disabled={a.busy || !p.commissionerOfOaths.trim()} onClick={() => a.run(() => api.post(`/engagements/${e.id}/complete-simple`, p))}>Complete engagement</button></div>
        </div>
      )}
      <Err msg={a.error} />
    </Section>
  );
}

export function MatrixPanel({ e, onChange, canEdit, isClient }: P & { isClient?: boolean }) {
  const a = useAction(onChange);
  const [resp, setResp] = useState<Record<string, string>>(() => Object.fromEntries(e.findings.map((f: any) => [f.id, f.client_response || ''])));
  const [sig, setSig] = useState('');
  if (!e.findings?.length || !['IMReview', 'ReportDraft', 'ReportReview', 'Committee', 'Commission', 'Completed', 'Monitoring', 'Closed'].includes(e.status)) return null;
  const commentable = e.status === 'IMReview' && ['ClientReview', 'Draft'].includes(e.im_status) && (isClient || canEdit);
  return (
    <Section title="Implementation Matrix" hint={`Status: ${e.im_status}${e.im_client_signatory ? ` · signed for the institution by ${e.im_client_signatory}` : ''}`}>
      <div className="overflow-x-auto"><table className="w-full text-sm border border-line"><caption className="sr-only">Implementation Matrix</caption>
        <thead className="bg-parchment text-xs"><tr>{['No', 'Issue', 'Finding', 'Recommendation', 'Responsibility', 'Time frame', 'Rating', 'Implementation', ...(commentable || isClient ? ['Institution comment'] : [])].map((h) => <th scope="col" key={h} className="text-left px-2 py-2 border border-line">{h}</th>)}</tr></thead>
        <tbody>{e.findings.map((f: any) => (
          <tr key={f.id} className="align-top">
            <td className="px-2 py-2 border border-line">{f.seq}</td><td className="px-2 py-2 border border-line">{f.issue}</td>
            <td className="px-2 py-2 border border-line"><ul className="list-disc pl-4">{(f.finding_points || []).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></td>
            <td className="px-2 py-2 border border-line">{f.recommendation}</td><td className="px-2 py-2 border border-line">{f.responsibility}</td><td className="px-2 py-2 border border-line">{f.time_frame}</td>
            <td className="px-2 py-2 border border-line">{RATING_LABELS[f.compliance_rating] || f.compliance_rating}</td><td className="px-2 py-2 border border-line">{IMPL_LABELS[f.implementation_status] || f.implementation_status}</td>
            {(commentable || isClient) && <td className="px-2 py-2 border border-line">{commentable ? (
              <><label className="sr-only" htmlFor={`cr-${f.id}`}>Comment on finding {f.seq}</label>
                <textarea id={`cr-${f.id}`} className="input text-xs" rows={2} value={resp[f.id] || ''} onChange={(x) => setResp({ ...resp, [f.id]: x.target.value })} onBlur={() => api.put(`/engagements/${e.id}/findings/${f.id}/client-response`, { response: resp[f.id] || '' }).catch(() => {})} /></>) : f.client_response}</td>}
          </tr>))}</tbody></table></div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button className="btn-outline text-xs" onClick={async () => { const b = await api.blob(`/engagements/${e.id}/matrix.csv`); downloadBlob(b, `Implementation_Matrix_${e.reference.replace(/\//g, '-')}.csv`); }}>Download CSV</button>
        {e.status === 'IMReview' && ['ClientReview', 'Draft', 'Adopted'].includes(e.im_status) && (canEdit || isClient) && (
          <>
            <input aria-label="Name of institution signatory" className="input !w-64" placeholder="Institution signatory (name and title)" value={sig} onChange={(x) => setSig(x.target.value)} />
            <button className="btn-primary text-xs" disabled={a.busy || !sig.trim()} onClick={() => a.run(() => api.post(`/engagements/${e.id}/im/sign`, { signatory: sig }))}>Record institution sign-off</button>
          </>)}
      </div>
      <Err msg={a.error} />
    </Section>
  );
}

export function ReportPanel({ e, onChange, canEdit }: P) {
  const a = useAction(onChange);
  const [level, setLevel] = useState(e.compliance_level || '');
  const [conclusion, setConclusion] = useState(e.conclusion || '');
  if (e.status !== 'ReportDraft' || !canEdit) return null;
  return (
    <Section title="Report" hint="The Team Leader submits the report within 5 working days of the signed matrix. The rating drives the monitoring plan.">
      <div className="grid gap-3 max-w-2xl">
        <Field id="r-l" label="Overall compliance level"><select id="r-l" className="input" value={level} onChange={(x) => setLevel(x.target.value)}><option value="">Select…</option><option>Red</option><option>Amber</option><option>Green</option></select></Field>
        <Field id="r-c" label="Conclusion"><textarea id="r-c" className="input" rows={5} value={conclusion} onChange={(x) => setConclusion(x.target.value)} /></Field>
        <div><button className="btn-primary" disabled={a.busy || !level || !conclusion.trim()} onClick={() => a.run(() => api.post(`/engagements/${e.id}/report/submit`, { complianceLevel: level, conclusion }))}>Submit report for review</button></div>
        <Err msg={a.error} />
      </div>
    </Section>
  );
}

export function MonitoringPanel({ e, onChange, canEdit, role }: P & { role: string }) {
  const a = useAction(onChange);
  const [summary, setSummary] = useState('');
  const [date, setDate] = useState(today());
  const [upd, setUpd] = useState<Record<string, string>>({});
  const [measure, setMeasure] = useState('LimitedDevolutionFunds');
  const [regulator, setRegulator] = useState('');
  if (!['Completed', 'Monitoring', 'Closed'].includes(e.status) || !e.sop.hasMonitoring) return null;
  const staff = ['MANAGER_COMPLIANCE', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'SUPER_ADMIN'].includes(role);
  const approver = ['GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'SUPER_ADMIN'].includes(role);
  return (
    <Section title="Monitoring and re-checks" hint={`Due ${fmtDate(e.monitoring_due_at)}. Red → Amber → Green: each visit re-rates the institution from the status of every recommendation. A certificate is issued only at Green.`}>
      {e.visits.length > 0 && (
        <table className="w-full text-sm mb-4"><caption className="sr-only">Monitoring visits</caption>
          <thead><tr className="text-xs text-slate text-left"><th scope="col">Date</th><th scope="col">Implemented</th><th scope="col">Level</th><th scope="col">Summary</th></tr></thead>
          <tbody className="divide-y divide-line">{e.visits.map((v: any) => <tr key={v.id}><td className="py-1.5">{fmtDate(v.visit_date)}</td><td>{v.implemented_count}/{v.total_count}</td><td><RagBadge status={v.overall_level} /></td><td>{v.summary}</td></tr>)}</tbody></table>)}
      {staff && e.status !== 'Closed' && (
        <>
          <div className="flex flex-wrap gap-2 mb-3"><button className="btn-outline text-xs" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/engagements/${e.id}/monitoring/notice`); return api.get(`/engagements/${e.id}`); })}>Send monitoring notice to the institution</button></div>
          <h3 className="text-sm font-medium mb-1">Record a monitoring visit</h3>
          <div className="grid gap-2 mb-2">{e.findings.filter((f: any) => f.compliance_rating !== 'Compliant').map((f: any) => (
            <div key={f.id} className="flex items-center gap-2 text-sm"><span className="flex-1">{f.seq}. {f.issue}</span>
              <select aria-label={`Implementation status for finding ${f.seq}`} className="input !w-44 !py-1 text-xs" value={upd[f.id] ?? f.implementation_status} onChange={(x) => setUpd({ ...upd, [f.id]: x.target.value })}>{Object.entries(IMPL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>))}</div>
          <div className="grid sm:grid-cols-3 gap-2"><Field id="v-d" label="Visit date"><input id="v-d" type="date" className="input" value={date} onChange={(x) => setDate(x.target.value)} /></Field>
            <div className="sm:col-span-2"><Field id="v-s" label="Summary"><input id="v-s" className="input" value={summary} onChange={(x) => setSummary(x.target.value)} /></Field></div></div>
          <button className="btn-primary mt-2" disabled={a.busy} onClick={() => a.run(async () => { const r = await api.post(`/engagements/${e.id}/monitoring/visit`, { visitDate: date, summary, updates: Object.entries(upd).map(([findingId, status]) => ({ findingId, status })) }); setUpd({}); return r.engagement; })}>Record visit and re-rate</button>
        </>)}
      {approver && e.compliance_level === 'Green' && !e.certificate && <div className="mt-4"><button className="btn-primary" disabled={a.busy} onClick={() => a.run(async () => (await api.post(`/engagements/${e.id}/certificate`)).engagement)}>Issue compliance certificate</button></div>}
      {e.certificate && <p className="text-sm mt-4">Certificate <strong>{e.certificate.certificate_no}</strong> issued {fmtDate(e.certificate.issued_at)}, valid to {fmtDate(e.certificate.valid_until)}.</p>}
      {approver && e.compliance_level && e.compliance_level !== 'Green' && (
        <div className="mt-4 border-t border-line pt-3"><h3 className="text-sm font-medium mb-1">Propose a regulator measure (non-compliant institutions)</h3>
          <div className="flex flex-wrap gap-2"><select aria-label="Measure" className="input !w-64" value={measure} onChange={(x) => setMeasure(x.target.value)}>
            <option value="LimitedDevolutionFunds">Limit devolution funds</option><option value="SuspendGovtContracts">Suspend government contracts</option><option value="SuspendTaxHolidays">Suspend tax holidays</option><option value="StockExchangeDelisting">Stock exchange delisting</option><option value="Other">Other</option></select>
            <input aria-label="Regulator" className="input !w-56" placeholder="Regulator (e.g. Treasury, ZIMRA)" value={regulator} onChange={(x) => setRegulator(x.target.value)} />
            <button className="btn-outline" disabled={a.busy} onClick={() => a.run(async () => { await api.post(`/engagements/${e.id}/regulator-notices`, { measure, regulator }); return api.get(`/engagements/${e.id}`); })}>Record</button></div>
          {e.regulatorNotices?.length > 0 && <ul className="text-sm mt-2 list-disc pl-5">{e.regulatorNotices.map((r: any) => <li key={r.id}>{r.measure}{r.regulator ? ` — ${r.regulator}` : ''} ({r.status})</li>)}</ul>}
        </div>)}
      <Err msg={a.error} />
    </Section>
  );
}
