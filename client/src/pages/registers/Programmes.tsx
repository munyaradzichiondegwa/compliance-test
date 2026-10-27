import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, Modal, LoadError } from '../../components/common/UI';
import { useLoad, useInstitutions, DataTable, usd, Flag, FLAG_LABELS } from './shared';

const WRITE = ['SUPER_ADMIN', 'GM_PREVENTION', 'MANAGER_COMPLIANCE', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'PROVINCIAL_HEAD'];
export default function Programmes() {
  const { user } = useAuth();
  const [kind, setKind] = useState('');
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const { data, loading, error } = useLoad<any[]>(`/monitoring/programmes${kind ? `?kind=${kind}` : ''}`, [tick]);
  const canWrite = !!user && WRITE.includes(user.role);
  return (
    <div>
      <PageHeader eyebrow="Government projects and programmes" title="Projects and programmes monitoring" description="Reported progress is compared with progress verified on site. Flags show where reporting runs ahead of what the team verified, or where spending runs ahead of progress."
        actions={canWrite && <button className="btn-primary" onClick={() => setOpen(true)}>Add project / programme</button>} />
      <label className="text-xs text-slate block mb-3">Kind <select className="input !w-auto !py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All</option><option>Project</option><option>Programme</option></select></label>
      {loading ? <LoadingSpinner /> : error ? <LoadError message={error} /> : !data?.length ? <EmptyState title="None recorded" /> : (
        <DataTable caption="Projects and programmes" heads={['Name', 'Institution', 'Budget / spent', 'Reported', 'Verified', 'Flags', '']}>
          {data.map((p) => (
            <tr key={p.id} className="align-top"><td className="px-4 py-3 font-medium">{p.name}<div className="text-xs text-slate">{p.kind} · {p.status}</div></td><td className="px-4 py-3">{p.institution_name}</td>
              <td className="px-4 py-3 whitespace-nowrap">{usd(p.budget_usd)} / {usd(p.spent_usd)}</td><td className="px-4 py-3">{p.reported_progress}%</td><td className="px-4 py-3">{p.verified_progress == null ? '—' : `${p.verified_progress}%`}</td>
              <td className="px-4 py-3">{p.flags.map((f: string) => <Flag key={f}>{FLAG_LABELS[f] || f}</Flag>)}</td>
              <td className="px-4 py-3"><button className="btn-outline text-xs" onClick={() => setSel(p.id)}>Open</button></td></tr>))}
        </DataTable>)}
      <AddProgramme open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setTick(tick + 1); }} />
      {sel && <ProgrammeDetail id={sel} canWrite={canWrite} onClose={() => { setSel(null); setTick(tick + 1); }} />}
    </div>
  );
}
function AddProgramme({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const insts = useInstitutions();
  const [f, setF] = useState({ institutionId: '', name: '', kind: 'Project', source: 'NationalPriority', scope: '', budgetUsd: '', startDate: '', endDate: '', reportedProgress: '0' });
  const [err, setErr] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Add project or programme" wide>
      <div className="grid gap-3">
        <div><label className="label" htmlFor="pg-i">Implementing institution</label><select id="pg-i" className="input" value={f.institutionId} onChange={(e) => setF({ ...f, institutionId: e.target.value })}><option value="">Select…</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="pg-n">Name</label><input id="pg-n" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="pg-k">Kind</label><select id="pg-k" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option>Project</option><option>Programme</option></select></div></div>
        <div><label className="label" htmlFor="pg-s">Scope</label><textarea id="pg-s" className="input" rows={2} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></div>
        <div className="grid grid-cols-4 gap-3">{([['pg-b', 'Budget (USD)', 'budgetUsd', 'number'], ['pg-sd', 'Start', 'startDate', 'date'], ['pg-ed', 'End', 'endDate', 'date'], ['pg-rp', 'Reported %', 'reportedProgress', 'number']] as const).map(([id, l, k, t]) => <div key={id}><label className="label" htmlFor={id}>{l}</label><input id={id} type={t} className="input" value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}</div>
        {err && <p role="alert" className="text-sm text-status-red">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.institutionId || !f.name} onClick={async () => { setErr(''); try { await api.post('/monitoring/programmes', f); onSaved(); } catch (e: any) { setErr(e.message); } }}>Save</button></div>
      </div>
    </Modal>
  );
}
function ProgrammeDetail({ id, canWrite, onClose }: { id: string; canWrite: boolean; onClose: () => void }) {
  const { data, reload } = useLoad<any>(`/monitoring/programmes/${id}`);
  const [v, setV] = useState<Record<string, string>>({});
  const [r, setR] = useState({ period: '', reportedProgress: '', spentUsd: '', narrative: '' });
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); reload(); } catch (e: any) { setErr(e.message); } };
  return (
    <Modal open onClose={onClose} title={data?.name || 'Project'} wide>
      {!data ? <LoadingSpinner /> : (
        <div className="grid gap-4 text-sm">
          <p>{data.institution_name} · {data.scope || 'No scope recorded'}</p>
          <table className="w-full"><caption className="sr-only">Progress reports</caption><thead><tr className="text-xs text-slate text-left"><th scope="col">Period</th><th scope="col">Reported</th><th scope="col">Verified on site</th><th scope="col">Narrative</th></tr></thead>
            <tbody className="divide-y divide-line">{data.reports.map((x: any) => (
              <tr key={x.id} className="align-top"><td className="py-1.5">{x.period}</td><td>{x.reported_progress}%</td>
                <td>{x.verified_progress != null ? `${x.verified_progress}% by ${x.verified_by_name || '—'}` : canWrite ? <span className="flex gap-1"><input aria-label={`Verified progress for ${x.period}`} type="number" min={0} max={100} className="input !w-20 !py-0.5 text-xs" value={v[x.id] || ''} onChange={(e) => setV({ ...v, [x.id]: e.target.value })} /><button className="btn-outline text-xs" disabled={!v[x.id]} onClick={() => run(() => api.put(`/monitoring/programmes/${id}/reports/${x.id}/verify`, { verifiedProgress: Number(v[x.id]) }))}>Verify</button></span> : 'Pending'}</td><td>{x.narrative}</td></tr>))}</tbody></table>
          {data.reports.length === 0 && <p className="text-slate">No progress reports yet.</p>}
          {canWrite && (
            <div className="grid grid-cols-4 gap-2 items-end"><div><label className="label" htmlFor="rp-p">Period</label><input id="rp-p" className="input" placeholder="2026-Q3" value={r.period} onChange={(e) => setR({ ...r, period: e.target.value })} /></div>
              <div><label className="label" htmlFor="rp-r">Reported %</label><input id="rp-r" type="number" className="input" value={r.reportedProgress} onChange={(e) => setR({ ...r, reportedProgress: e.target.value })} /></div>
              <div><label className="label" htmlFor="rp-s">Spent (USD)</label><input id="rp-s" type="number" className="input" value={r.spentUsd} onChange={(e) => setR({ ...r, spentUsd: e.target.value })} /></div>
              <button className="btn-primary" disabled={!r.period || r.reportedProgress === ''} onClick={() => run(() => api.post(`/monitoring/programmes/${id}/reports`, r))}>Add report</button></div>)}
          {err && <p role="alert" className="text-status-red">{err}</p>}
        </div>)}
    </Modal>
  );
}
