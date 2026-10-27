import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, Modal, LoadError } from '../../components/common/UI';
import { useLoad, useInstitutions, DataTable, usd } from './shared';

const WRITE = ['SUPER_ADMIN', 'GM_PREVENTION', 'MANAGER_COMPLIANCE', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'PROVINCIAL_HEAD', 'AUDITOR'];
export default function AuditFindings() {
  const { user } = useAuth();
  const [source, setSource] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [tick, setTick] = useState(0);
  const q = new URLSearchParams(); if (source) q.set('source', source); if (repeat) q.set('repeat', 'true');
  const list = useLoad<any[]>(`/monitoring/audit-findings?${q}`, [tick]);
  const summary = useLoad<any[]>('/monitoring/audit-findings/summary', [tick]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const canWrite = !!user && WRITE.includes(user.role);
  const track = async (id: string) => { setMsg(''); try { await api.post(`/monitoring/audit-findings/${id}/recommend`, {}); setTick(tick + 1); setMsg('Now tracked as a recommendation with reminders and escalation.'); } catch (e: any) { setMsg(e.message); } };
  return (
    <div>
      <PageHeader eyebrow="Auditor-General and internal audit" title="Audit findings library" description="Findings from Auditor-General (IPSAS) reports, internal audit and the media, with repeat-finding detection across years. Track a finding to push it through the recommendation reminders."
        actions={canWrite && <button className="btn-primary" onClick={() => setOpen(true)}>Add or import findings</button>} />
      {msg && <p role="status" className="text-sm mb-3">{msg}</p>}
      <h2 className="font-display font-semibold mb-2">By institution</h2>
      {summary.loading ? <LoadingSpinner /> : (summary.data?.length ? (
        <div className="mb-8"><DataTable caption="Findings by institution" heads={['Institution', 'Findings', 'Repeat', 'Amount', 'Tracked', 'Latest opinion']}>
          {summary.data.map((s: any) => <tr key={s.institution_id}><td className="px-4 py-2.5">{s.institution_name}</td><td className="px-4 py-2.5">{s.findings}</td><td className="px-4 py-2.5">{s.repeats}</td><td className="px-4 py-2.5">{usd(s.amount_usd)}</td><td className="px-4 py-2.5">{s.tracked}</td><td className="px-4 py-2.5">{s.latest_opinion || '—'}</td></tr>)}</DataTable></div>) : null)}
      <div className="flex flex-wrap gap-4 items-center mb-3 text-xs text-slate"><h2 className="font-display font-semibold text-base text-ink mr-2">All findings</h2>
        <label>Source <select className="input !w-auto !py-1 text-xs" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All</option><option value="OAG">Auditor-General</option><option value="InternalAudit">Internal audit</option><option value="Media">Media</option></select></label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeat findings only</label></div>
      {list.loading ? <LoadingSpinner /> : list.error ? <LoadError message={list.error} /> : !list.data?.length ? <EmptyState title="No findings recorded" /> : (
        <DataTable caption="Audit findings" heads={['Institution', 'Year', 'Source', 'Finding', 'IPSAS', 'Amount', '']}>
          {list.data.map((f: any) => (
            <tr key={f.id} className="align-top"><td className="px-4 py-3">{f.institution_name}</td><td className="px-4 py-3">{f.report_year}</td><td className="px-4 py-3">{f.source}</td>
              <td className="px-4 py-3 max-w-md">{f.repeat_finding ? <span className="badge-red mr-1">Repeat</span> : null}{f.finding_text}{f.opinion && <div className="text-xs text-slate">Opinion: {f.opinion}</div>}</td>
              <td className="px-4 py-3">{f.ipsas_ref || '—'}</td><td className="px-4 py-3">{usd(f.amount_usd)}</td>
              <td className="px-4 py-3">{canWrite && !f.recommendation_id ? <button className="btn-outline text-xs" onClick={() => track(f.id)}>Track</button> : f.recommendation_id ? <span className="text-xs text-slate">Tracked</span> : null}</td></tr>))}
        </DataTable>)}
      <AddFindings open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setTick(tick + 1); }} />
    </div>
  );
}

function AddFindings({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const insts = useInstitutions();
  const [f, setF] = useState({ institutionId: '', source: 'OAG', reportYear: String(new Date().getFullYear() - 1), opinion: '', text: '', ipsasRef: '', amountUsd: '' });
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      const lines = f.text.split('\n').map((s) => s.trim()).filter(Boolean);
      if (lines.length > 1) await api.post('/monitoring/audit-findings/import', { institutionId: f.institutionId, source: f.source, reportYear: f.reportYear, opinion: f.opinion || undefined, findings: lines.map((findingText) => ({ findingText })) });
      else await api.post('/monitoring/audit-findings', { institutionId: f.institutionId, source: f.source, reportYear: f.reportYear, opinion: f.opinion || undefined, findingText: lines[0], ipsasRef: f.ipsasRef || undefined, amountUsd: f.amountUsd || undefined });
      onSaved();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add or import audit findings" wide>
      <div className="grid gap-3">
        <div><label className="label" htmlFor="af-i">Institution</label><select id="af-i" className="input" value={f.institutionId} onChange={(e) => setF({ ...f, institutionId: e.target.value })}><option value="">Select…</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label" htmlFor="af-s">Source</label><select id="af-s" className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="OAG">Auditor-General</option><option value="InternalAudit">Internal audit</option><option value="Media">Media</option></select></div>
          <div><label className="label" htmlFor="af-y">Report year</label><input id="af-y" className="input" type="number" value={f.reportYear} onChange={(e) => setF({ ...f, reportYear: e.target.value })} /></div>
          <div><label className="label" htmlFor="af-o">Audit opinion</label><input id="af-o" className="input" value={f.opinion} placeholder="e.g. Qualified" onChange={(e) => setF({ ...f, opinion: e.target.value })} /></div>
        </div>
        <div><label className="label" htmlFor="af-t">Finding(s) — one per line imports several at once</label><textarea id="af-t" className="input" rows={5} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="af-p">IPSAS reference (single finding)</label><input id="af-p" className="input" value={f.ipsasRef} onChange={(e) => setF({ ...f, ipsasRef: e.target.value })} /></div>
          <div><label className="label" htmlFor="af-a">Amount (USD)</label><input id="af-a" className="input" type="number" value={f.amountUsd} onChange={(e) => setF({ ...f, amountUsd: e.target.value })} /></div></div>
        {err && <p role="alert" className="text-sm text-status-red">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.institutionId || !f.text.trim()} onClick={save}>Save</button></div>
      </div>
    </Modal>
  );
}
