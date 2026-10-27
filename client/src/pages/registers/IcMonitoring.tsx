import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, Modal, LoadError } from '../../components/common/UI';
import { useLoad, DataTable } from './shared';

const ITEM_LABELS: Record<string, string> = { CorruptionRiskMatrix: 'Corruption risk matrix', IntegrityActionPlan: 'Integrity action plan', IntegrityCharter: 'Integrity charter', Workplan: 'Workplan' };
export default function IcMonitoring() {
  const { user } = useAuth();
  const isClient = user?.role === 'INTEGRITY_COMMITTEE_CHAIR' || user?.role === 'INSTITUTION_FOCAL_PERSON';
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const { data, loading, error } = useLoad<any[]>('/monitoring/ic/overview', [tick]);
  return (
    <div>
      <PageHeader eyebrow="Integrity Committees" title={isClient ? 'Our Integrity Committee' : 'Integrity Committee monitoring'} description="Deliverables due 30 days after training (risk matrix, action plan, charter, workplan), quarterly reports and the annual impact assessment." />
      {loading ? <LoadingSpinner /> : error ? <LoadError message={error} /> : !data?.length ? <EmptyState title="No committees" /> : (
        <DataTable caption="Integrity Committees" heads={['Institution', 'Status', 'Deliverables', 'Overdue', 'Last report', 'Impact assessments', '']}>
          {data.map((c) => (
            <tr key={c.id}><td className="px-4 py-3">{c.institution_name}<div className="text-xs text-slate">{c.province}</div></td><td className="px-4 py-3">{c.status}</td><td className="px-4 py-3">{c.submitted_deliverables}/{c.total_deliverables} submitted</td>
              <td className={`px-4 py-3 ${c.overdue_deliverables ? 'text-status-red font-medium' : ''}`}>{c.overdue_deliverables}</td><td className="px-4 py-3">{c.last_report_period || '—'}</td><td className="px-4 py-3">{c.impact_assessments}</td>
              <td className="px-4 py-3"><button className="btn-outline text-xs" onClick={() => setSel(c.id)}>Open</button></td></tr>))}
        </DataTable>)}
      {sel && <Detail id={sel} onClose={() => { setSel(null); setTick(tick + 1); }} />}
    </div>
  );
}
function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, reload } = useLoad<any>(`/monitoring/ic/${id}/detail`);
  const [r, setR] = useState({ period: '', summary: '', actionsCompleted: '', actionsPlanned: '' });
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); reload(); } catch (e: any) { setErr(e.message); } };
  return (
    <Modal open onClose={onClose} title={data ? data.committee.institution_name : 'Integrity Committee'} wide>
      {!data ? <LoadingSpinner /> : (
        <div className="grid gap-4 text-sm">
          <section aria-label="Deliverables"><h3 className="font-medium mb-1">Deliverables</h3>
            {data.deliverables.length === 0 ? <p className="text-slate">None scheduled yet — they are created when the training return form is recorded.</p> : (
              <ul className="divide-y divide-line">{data.deliverables.map((d: any) => <li key={d.id} className="py-1.5 flex items-center gap-2"><span className="flex-1">{ITEM_LABELS[d.item] || d.item} <span className="text-xs text-slate">due {String(d.due_date).slice(0, 10)}</span></span>
                {d.status === 'Submitted' ? <span className="badge-green">Submitted</span> : <button className="btn-outline text-xs" onClick={() => run(() => api.post(`/monitoring/ic/deliverables/${d.id}/submit`))}>Mark submitted</button>}</li>)}</ul>)}</section>
          <section aria-label="Quarterly reports"><h3 className="font-medium mb-1">Quarterly reports</h3>
            <ul className="mb-2">{data.reports.map((q: any) => <li key={q.id}>{q.period} — {q.actions_completed ?? '?'}/{q.actions_planned ?? '?'} actions{q.is_annual_impact ? ' (annual impact assessment)' : ''}. {q.summary}</li>)}{data.reports.length === 0 && <li className="text-slate">None yet.</li>}</ul>
            <div className="grid grid-cols-4 gap-2 items-end">
              <div><label className="label" htmlFor="ic-p">Period</label><input id="ic-p" className="input" placeholder="2026-Q3" value={r.period} onChange={(e) => setR({ ...r, period: e.target.value })} /></div>
              <div><label className="label" htmlFor="ic-c">Completed</label><input id="ic-c" type="number" className="input" value={r.actionsCompleted} onChange={(e) => setR({ ...r, actionsCompleted: e.target.value })} /></div>
              <div><label className="label" htmlFor="ic-a">Planned</label><input id="ic-a" type="number" className="input" value={r.actionsPlanned} onChange={(e) => setR({ ...r, actionsPlanned: e.target.value })} /></div>
              <button className="btn-primary" disabled={!r.period} onClick={() => run(() => api.post('/monitoring/ic/quarterly-reports', { committeeId: id, ...r }))}>Add</button>
              <div className="col-span-4"><label className="label" htmlFor="ic-s">Summary</label><input id="ic-s" className="input" value={r.summary} onChange={(e) => setR({ ...r, summary: e.target.value })} /></div></div></section>
          <section aria-label="Training"><h3 className="font-medium mb-1">Training return forms</h3>
            <ul>{data.returnForms.map((f: any) => <li key={f.id}>{String(f.training_date).slice(0, 10)} — {f.member_count} members; HRM {f.has_hrm ? '✓' : '✗'}, Legal {f.has_legal ? '✓' : '✗'}, Audit {f.has_audit ? '✓' : '✗'}</li>)}{data.returnForms.length === 0 && <li className="text-slate">None yet.</li>}</ul></section>
          {err && <p role="alert" className="text-status-red">{err}</p>}
        </div>)}
    </Modal>
  );
}
