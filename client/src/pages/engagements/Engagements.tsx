import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, StatusBadge, RagBadge, Modal } from '../../components/common/UI';
import { STATUS_LABELS, STATUS_ORDER, SCOPE_LABELS, ORIGIN_LABELS, useEngagementMeta, fmtDate, isOverdue } from './common';

const CREATOR_ROLES = ['COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'PROVINCIAL_HEAD', 'MANAGER_COMPLIANCE', 'SUPER_ADMIN'];
const DECIDER_ROLES = ['COMPLIANCE_OFFICER', 'PROVINCIAL_HEAD', 'MANAGER_COMPLIANCE', 'GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'PREVENTION_COMMITTEE', 'COMMISSION_CHAIR', 'SUPER_ADMIN'];

export default function Engagements() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const meta = useEngagementMeta();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [sopType, setSopType] = useState('');
  const [awaitingMe, setAwaitingMe] = useState(false);
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const canCreate = !!user && CREATOR_ROLES.includes(user.role);
  const canDecide = !!user && DECIDER_ROLES.includes(user.role);
  const isClient = user?.role === 'INSTITUTION_FOCAL_PERSON' || user?.role === 'INTEGRITY_COMMITTEE_CHAIR';

  const load = () => {
    setLoading(true); setError('');
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (sopType) q.set('sopType', sopType);
    if (awaitingMe) q.set('awaitingMe', 'true');
    if (mine) q.set('mine', 'true');
    if (overdue) q.set('overdue', 'true');
    api.get(`/engagements?${q}`).then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [status, sopType, awaitingMe, mine, overdue]);
  const sopLabel = (t: string) => meta?.sops.find((s) => s.type === t)?.label || t;

  return (
    <div>
      <PageHeader
        eyebrow="Compliance, Systems and Processes Review"
        title={isClient ? 'ZACC exercises at your institution' : 'Compliance Work'}
        description={isClient ? 'Exercises notified to your institution, the draft Implementation Matrix for your comments, and monitoring notices.' : 'Every SOP in one place: compliance assessments, systems reviews, audit/project/programme monitoring, Integrity Committee training and pledge signing — from preliminary assessment to monitoring.'}
        actions={canCreate && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} aria-hidden /> New engagement</button>}
      />
      {!isClient && (
        <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Filter by status">
          {['', ...STATUS_ORDER].map((s) => (
            <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={`text-xs px-3 py-1.5 rounded-full border ${status === s ? 'bg-charcoal text-white border-charcoal' : 'border-line text-slate'}`}>{s ? STATUS_LABELS[s] : 'All'}</button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 mb-5 text-xs text-slate">
        {!isClient && (
          <label className="flex items-center gap-1.5">Type
            <select className="input !w-auto !py-1 text-xs" value={sopType} onChange={(e) => setSopType(e.target.value)}>
              <option value="">All</option>{meta?.sops.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}
            </select></label>
        )}
        {canDecide && <label className="flex items-center gap-1.5"><input type="checkbox" checked={awaitingMe} onChange={(e) => setAwaitingMe(e.target.checked)} /> Awaiting my decision</label>}
        {!isClient && <label className="flex items-center gap-1.5"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My engagements</label>}
        {!isClient && <label className="flex items-center gap-1.5"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Overdue steps</label>}
      </div>
      {error && <div role="alert" className="text-sm text-status-red mb-3">{error}</div>}
      {loading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="Nothing here yet" description="No engagements match this filter." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Engagements</caption>
            <thead className="bg-parchment text-xs uppercase tracking-wide text-slate"><tr>
              {['Reference', 'Institution', 'Type', 'Dates', 'Stage', 'Level'].map((h) => <th key={h} scope="col" className="text-left px-4 py-3 font-medium">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-parchment/60">
                  <td className="px-4 py-3 font-medium whitespace-nowrap"><button className="text-left underline-offset-2 hover:underline focus-visible:underline" onClick={() => navigate(`/app/engagements/${r.id}`)}>{r.reference}</button></td>
                  <td className="px-4 py-3">{r.institution_name}<div className="text-xs text-slate max-w-xs truncate">{r.title}</div></td>
                  <td className="px-4 py-3 text-xs">{sopLabel(r.sop_type)}{r.scope_kind ? <div className="text-slate">{SCOPE_LABELS[r.scope_kind]}</div> : null}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">{fmtDate(r.start_date)}{r.end_date ? ` → ${fmtDate(r.end_date)}` : ''}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} />
                    {r.current_step && <div className={`text-xs mt-1 ${isOverdue(r.step_due_at) ? 'text-status-red font-medium' : 'text-slate'}`}>at {r.current_step}{r.step_due_at ? ` · due ${fmtDate(r.step_due_at)}` : ''}{r.escalated ? ' · escalated' : ''}</div>}</td>
                  <td className="px-4 py-3">{r.compliance_level ? <RagBadge status={r.compliance_level} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewEngagementModal open={open} onClose={() => setOpen(false)} onCreated={(id) => navigate(`/app/engagements/${id}`)} />
    </div>
  );
}

function NewEngagementModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const meta = useEngagementMeta();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [f, setF] = useState({ sopType: 'ComplianceAssessment', institutionId: '', title: '', scopeKind: 'SpotCheck', originSource: 'RoutineProgramme', originDetail: '', locationType: 'HQ', allegations: '', rationale: '', startDate: '', endDate: '', days: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) api.get('/institutions?limit=200').then((r) => setInstitutions(r.results)).catch(() => {}); }, [open]);
  const sop = meta?.sops.find((s) => s.type === f.sopType);

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      const body: any = { ...f, days: f.days ? Number(f.days) : undefined, allegations: f.allegations.split('\n').map((s) => s.trim()).filter(Boolean) };
      if (f.sopType !== 'ComplianceAssessment') delete body.scopeKind;
      const c = await api.post('/engagements', body);
      onCreated(c.id);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New engagement" wide>
      <div className="grid gap-3">
        <div><label className="label" htmlFor="ne-sop">Type of exercise (SOP)</label>
          <select id="ne-sop" className="input" value={f.sopType} onChange={(e) => setF({ ...f, sopType: e.target.value })}>{meta?.sops.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}</select>
          {sop && <p className="text-xs text-slate mt-1">{sop.sopRef} · minimum {sop.minWorkingDays} working day(s) · outputs: {sop.outputs.join('; ')}</p>}</div>
        <div><label className="label" htmlFor="ne-inst">Institution</label>
          <select id="ne-inst" className="input" value={f.institutionId} onChange={(e) => setF({ ...f, institutionId: e.target.value })}><option value="">Select…</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        <div><label className="label" htmlFor="ne-title">Title</label><input id="ne-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Rapid compliance spot check on procurement" /></div>
        <div className="grid grid-cols-2 gap-3">
          {f.sopType === 'ComplianceAssessment' && <div><label className="label" htmlFor="ne-scope">Kind of check</label>
            <select id="ne-scope" className="input" value={f.scopeKind} onChange={(e) => setF({ ...f, scopeKind: e.target.value })}>{Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}
          <div><label className="label" htmlFor="ne-loc">Location</label>
            <select id="ne-loc" className="input" value={f.locationType} onChange={(e) => setF({ ...f, locationType: e.target.value })}><option value="HQ">Head Office exercise</option><option value="Provincial">Provincial exercise (Provincial Head reviews)</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="ne-origin">What prompted it</label>
            <select id="ne-origin" className="input" value={f.originSource} onChange={(e) => setF({ ...f, originSource: e.target.value })}>{(meta?.origins || []).map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o] || o}</option>)}</select></div>
          <div><label className="label" htmlFor="ne-od">Detail (optional)</label><input id="ne-od" className="input" value={f.originDetail} onChange={(e) => setF({ ...f, originDetail: e.target.value })} placeholder="e.g. following media reports on …" /></div>
        </div>
        <div><label className="label" htmlFor="ne-all">Allegations (one per line; leave empty for a routine or rationale-based exercise)</label><textarea id="ne-all" className="input" rows={3} value={f.allegations} onChange={(e) => setF({ ...f, allegations: e.target.value })} /></div>
        {!f.allegations.trim() && <div><label className="label" htmlFor="ne-rat">Rationale / justification</label><textarea id="ne-rat" className="input" rows={2} value={f.rationale} onChange={(e) => setF({ ...f, rationale: e.target.value })} /></div>}
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label" htmlFor="ne-s">Start</label><input id="ne-s" className="input" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></div>
          <div><label className="label" htmlFor="ne-e">End</label><input id="ne-e" className="input" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></div>
          <div><label className="label" htmlFor="ne-d">Days</label><input id="ne-d" className="input" type="number" min={1} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></div>
        </div>
        {error && <p role="alert" className="text-sm text-status-red">{error}</p>}
        <div className="flex justify-end gap-2"><button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !f.institutionId || !f.title} onClick={submit}>Create and start preliminary assessment</button></div>
        <p className="text-xs text-slate">You become the Focal Person; the Manager allocates the Team Leader and team. The preliminary assessment (2 working days) comes first, then the concept note.</p>
      </div>
    </Modal>
  );
}
