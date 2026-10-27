import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Check } from 'lucide-react';
import { api, downloadBlob } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, LoadError, StatusBadge, RagBadge } from '../../components/common/UI';
import { useAction, Section, Err, Field, money } from './parts';
import { METHOD_LABELS, SCOPE_LABELS, STATUS_LABELS, ORIGIN_LABELS, fmtDate, isOverdue, useEngagementMeta } from './common';
import { PreliminaryPanel, ConceptEditor } from './ConceptPanels';
import { DocumentsPanel, FieldworkRecords, FindingsEditor, SimpleCompletion, MatrixPanel, ReportPanel, MonitoringPanel } from './FieldPanels';

const CLIENT_ROLES = ['INSTITUTION_FOCAL_PERSON', 'INTEGRITY_COMMITTEE_CHAIR'];

export default function EngagementDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const meta = useEngagementMeta();
  const [e, setE] = useState<any>(null);
  const [error, setError] = useState('');
  const isClient = !!user && CLIENT_ROLES.includes(user.role);
  const load = () => api.get(`/engagements/${id}`).then(setE).catch((x) => setError(x.message));
  useEffect(() => { setE(null); load(); }, [id]);
  const update = (next: any) => { if (next && next.id) setE(next); else load(); };

  if (error) return <LoadError message={error} />;
  if (!e) return <LoadingSpinner />;
  const canEdit = isClient ? false : !!e.canEdit;

  const download = async (kind: string, label: string) => {
    try { const b = await api.blob(`/engagements/${e.id}/docs/${kind}`); downloadBlob(b, `${label.replace(/[^A-Za-z0-9_-]+/g, '_')}_${e.reference.replace(/\//g, '-')}.${kind === 'certificate' ? 'pdf' : 'docx'}`); } catch (x: any) { setError(x.message); }
  };
  const docs = (meta?.docKinds || []).filter((d) => {
    if (isClient) return ['notification-letter', 'matrix'].includes(d.kind);
    if (d.kind === 'notification-letter') return !!e.notification_ref;
    if (d.kind === 'matrix') return e.findings?.length > 0;
    if (d.kind === 'report') return !!e.conclusion;
    if (d.kind === 'monitoring-notice') return ['Completed', 'Monitoring'].includes(e.status);
    return true;
  });

  if (isClient) return <ClientView e={e} onChange={update} docs={docs} download={download} />;

  return (
    <div>
      <Link to="/app/engagements" className="inline-flex items-center gap-1 text-sm text-slate mb-3"><ArrowLeft size={14} aria-hidden /> All engagements</Link>
      <PageHeader eyebrow={`${e.reference} · ${e.sop.label}`} title={e.title} description={`${e.institution_name}${e.province ? ` · ${e.province}` : ''}`} actions={<StatusBadge status={e.status} />} />
      <Pipeline e={e} />
      <DecisionPanel e={e} onChange={update} />
      <ActionBar e={e} onChange={update} canEdit={canEdit} role={user!.role} />

      {e.status === 'Preliminary' && !e.current_step && canEdit && <><PreliminaryPanel e={e} onChange={update} /><ConceptEditor e={e} onChange={update} /></>}
      {e.status === 'ConceptDraft' && canEdit && <ConceptEditor e={e} onChange={update} />}
      {!(['Preliminary', 'ConceptDraft'].includes(e.status) && canEdit) && <ConceptSummary e={e} />}

      <DocumentsPanel e={e} onChange={update} canEdit={canEdit} />
      <FieldworkRecords e={e} onChange={update} canEdit={canEdit} />
      <FindingsEditor e={e} onChange={update} canEdit={canEdit} />
      <SimpleCompletion e={e} onChange={update} canEdit={canEdit} />
      <MatrixPanel e={e} onChange={update} canEdit={canEdit} />
      <ReportPanel e={e} onChange={update} canEdit={canEdit} />
      {e.conclusion && <Section title="Report conclusion"><div className="flex items-center gap-2 mb-2">{e.compliance_level && <RagBadge status={e.compliance_level} />}</div><p className="text-sm whitespace-pre-wrap">{e.conclusion}</p></Section>}
      <MonitoringPanel e={e} onChange={update} canEdit={canEdit} role={user!.role} />

      <Section title="Documents" hint="Generated on ZACC letterhead from the data above.">
        <div className="flex flex-wrap gap-2">{docs.map((d) => <button key={d.kind} className="btn-outline text-xs" onClick={() => download(d.kind, d.label)}><Download size={13} aria-hidden /> {d.label}</button>)}
          {e.certificate && <button className="btn-outline text-xs" onClick={() => download('certificate', 'Compliance_Certificate')}><Download size={13} aria-hidden /> Compliance certificate (PDF)</button>}</div>
      </Section>
      <History e={e} />
    </div>
  );
}

function Pipeline({ e }: { e: any }) {
  const order = ['Preliminary', 'ConceptDraft', 'ConceptReview', 'Approved', 'Notified', 'Fieldwork', ...(e.sop.hasIM ? ['IMReview'] : []), ...(e.sop.hasReport ? ['ReportDraft', 'ReportReview', 'Committee', 'Commission'] : []), 'Completed', ...(e.sop.hasMonitoring ? ['Monitoring'] : [])];
  const idx = order.indexOf(e.status);
  return (
    <nav aria-label="Progress" className="card p-4 mb-5 overflow-x-auto">
      <ol className="flex items-center gap-1 min-w-max text-xs">
        {order.map((s, i) => (
          <li key={s} className="flex items-center gap-1" aria-current={s === e.status ? 'step' : undefined}>
            <span className={`px-2.5 py-1 rounded-full border ${i < idx ? 'bg-parchment border-line text-slate' : s === e.status ? 'bg-charcoal text-white border-charcoal font-medium' : 'border-line text-slate/70'}`}>
              {i < idx && <Check size={11} className="inline mr-1" aria-hidden />}{STATUS_LABELS[s]}</span>
            {i < order.length - 1 && <span aria-hidden className="text-line">—</span>}
          </li>))}
      </ol>
      {['Rejected', 'Cancelled'].includes(e.status) && <p className="text-sm text-status-red mt-2">This engagement is {e.status.toLowerCase()}.</p>}
    </nav>
  );
}

function DecisionPanel({ e, onChange }: { e: any; onChange: (x: any) => void }) {
  const { user } = useAuth();
  const p = e.pendingAction;
  const [comment, setComment] = useState('');
  const [method, setMethod] = useState(e.method || '');
  const [justified, setJustified] = useState(true);
  const a = useAction(onChange);
  useEffect(() => { setComment(''); }, [e.current_step, e.status]);
  if (!p) return null;
  const mine = user!.role === 'SUPER_ADMIN' || (p.step === 'TeamLeader' ? e.team.some((t: any) => t.user_id === user!.id && t.team_role === 'TeamLeader') : p.role === user!.role);
  const gmPrelim = p.flow === 'Preliminary' && p.step === 'GM' && e.sop.needsMethod;
  const decide = (decision: string) => a.run(() => api.post(`/engagements/${e.id}/decision`, { decision, comment, method: method || undefined, deploymentJustified: justified }));
  return (
    <section aria-label="Awaiting decision" className={`card p-5 mb-5 border-l-4 ${isOverdue(p.dueAt) ? 'border-l-status-red' : 'border-l-status-amber'}`}>
      <h2 className="font-display font-semibold">Awaiting: {p.label}</h2>
      <p className="text-xs text-slate mb-3">{p.flow} approval · due {fmtDate(p.dueAt)}{e.escalated ? ' · escalated' : ''}</p>
      {mine ? (
        <div className="grid gap-3 max-w-xl">
          {gmPrelim && (
            <div className="grid gap-2">
              <Field id="d-m" label="Method determined by the General Manager"><select id="d-m" className="input" value={method} onChange={(x) => setMethod(x.target.value)}><option value="">Select…</option>{Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={justified} onChange={(x) => setJustified(x.target.checked)} /> Deployment of ZACC resources is justified</label>
            </div>)}
          <Field id="d-c" label="Comment (required to return or reject)"><textarea id="d-c" className="input" rows={3} value={comment} onChange={(x) => setComment(x.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={a.busy || (gmPrelim && justified && !method)} onClick={() => decide('Approve')}>{['ExecutiveSecretary', 'CommissionChair'].includes(p.step) ? 'Approve' : 'Recommend / approve'}</button>
            <button className="btn-outline" disabled={a.busy || !comment.trim()} onClick={() => decide('Return')}>Return for correction</button>
            {['Preliminary', 'Concept'].includes(p.flow) && <button className="btn-outline text-status-red" disabled={a.busy || !comment.trim()} onClick={() => decide('Reject')}>Reject</button>}
          </div>
          <Err msg={a.error} />
        </div>
      ) : <p className="text-sm text-slate">Waiting for the {p.label}.</p>}
    </section>
  );
}

function ActionBar({ e, onChange, canEdit, role }: { e: any; onChange: (x: any) => void; canEdit: boolean; role: string }) {
  const a = useAction(onChange);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const post = (path: string) => a.run(() => api.post(`/engagements/${e.id}/${path}`));
  const canCancel = ['MANAGER_COMPLIANCE', 'GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'SUPER_ADMIN'].includes(role) && !['Completed', 'Closed', 'Cancelled', 'Monitoring', 'Rejected'].includes(e.status);
  const showNotify = e.status === 'Approved' && ['EXECUTIVE_SECRETARY', 'SUPER_ADMIN'].includes(role);
  const showStart = e.status === 'Notified' && canEdit;
  const showConclude = e.status === 'Fieldwork' && canEdit && e.sop.hasIM;
  if (!showNotify && !showStart && !showConclude && !canCancel) return null;
  return (
    <div className="card p-4 mb-5 flex flex-wrap items-center gap-3">
      {showNotify && <button className="btn-primary" disabled={a.busy} onClick={() => post('notification')}>Sign and issue notification letter to the institution</button>}
      {showStart && <button className="btn-primary" disabled={a.busy} onClick={() => post('start')}>Start fieldwork</button>}
      {showConclude && <button className="btn-primary" disabled={a.busy || e.findings.length === 0} title={e.findings.length === 0 ? 'Capture at least one finding first' : undefined} onClick={() => post('conclude')}>Conclude fieldwork and draft Implementation Matrix</button>}
      {canCancel && !cancelling && <button className="btn-outline text-xs ml-auto" onClick={() => setCancelling(true)}>Cancel engagement</button>}
      {cancelling && (<div className="flex gap-2 ml-auto items-center"><input aria-label="Reason for cancelling" className="input !w-64" placeholder="Reason" value={reason} onChange={(x) => setReason(x.target.value)} />
        <button className="btn-outline text-status-red" disabled={!reason.trim() || a.busy} onClick={() => a.run(() => api.post(`/engagements/${e.id}/cancel`, { reason }))}>Confirm</button><button className="btn-outline" onClick={() => setCancelling(false)}>Keep</button></div>)}
      <Err msg={a.error} />
    </div>
  );
}

function ConceptSummary({ e }: { e: any }) {
  const L = ({ t, items }: { t: string; items: string[] }) => (items?.length ? <div className="mb-3"><h3 className="text-xs uppercase tracking-wide text-slate mb-1">{t}</h3><ul className="list-disc pl-5 text-sm space-y-0.5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null);
  return (
    <Section title="Concept note" hint={`${ORIGIN_LABELS[e.origin_source] || e.origin_source}${e.method ? ` · method ${METHOD_LABELS[e.method]}` : ''}${e.scope_kind ? ` · ${SCOPE_LABELS[e.scope_kind]}` : ''}`}>
      {e.background && <p className="text-sm mb-3">{e.background}</p>}
      <L t="Allegations" items={e.allegations} /><L t="Objectives" items={e.objectives} /><L t="Methodology" items={e.methodology} />
      <div className="grid sm:grid-cols-2 gap-4 text-sm mt-2">
        <div><h3 className="text-xs uppercase tracking-wide text-slate mb-1">Team</h3><ul>{e.team.map((t: any) => <li key={t.id}>{t.name} <span className="text-slate text-xs">— {t.team_role}</span></li>)}{e.team.length === 0 && <li className="text-slate">Not allocated</li>}</ul></div>
        <div><h3 className="text-xs uppercase tracking-wide text-slate mb-1">Dates and budget</h3><p>{fmtDate(e.start_date)} → {fmtDate(e.end_date)}{e.days ? ` (${e.days} days)` : ''}</p><p>{money(e.budgetTotal)}</p></div>
      </div>
      {e.itinerary.length > 0 && (
        <table className="w-full text-xs mt-4"><caption className="sr-only">Itinerary</caption><thead><tr className="text-slate text-left"><th scope="col">Day</th><th scope="col">Date</th><th scope="col">Location</th><th scope="col">Activity</th></tr></thead>
          <tbody className="divide-y divide-line">{e.itinerary.map((r: any) => <tr key={r.id}><td className="py-1">{r.day_no}</td><td>{fmtDate(r.activity_date)}</td><td>{r.location}</td><td>{r.activity}</td></tr>)}</tbody></table>)}
      {e.budget.length > 0 && (
        <table className="w-full text-xs mt-4 border border-line"><caption className="sr-only">Budget</caption><thead className="bg-parchment"><tr>{['Item', 'Qty', 'Unit cost', 'Persons', 'Days', 'Total'].map((h) => <th scope="col" key={h} className="text-left p-1.5 border border-line">{h}</th>)}</tr></thead>
          <tbody>{e.budget.map((b: any) => <tr key={b.id}><td className="p-1.5 border border-line">{b.item}</td><td className="p-1.5 border border-line">{b.quantity}</td><td className="p-1.5 border border-line">{money(b.unit_cost)}</td><td className="p-1.5 border border-line">{b.persons}</td><td className="p-1.5 border border-line">{b.days}</td><td className="p-1.5 border border-line">{money(b.total)}</td></tr>)}</tbody></table>)}
    </Section>
  );
}

function History({ e }: { e: any }) {
  const rows = e.steps || [];
  if (!rows.length) return null;
  return (
    <Section title="Approval history">
      <table className="w-full text-sm"><caption className="sr-only">Approval history</caption>
        <thead><tr className="text-xs text-slate text-left"><th scope="col" className="pb-1">When</th><th scope="col">Step</th><th scope="col">Decision</th><th scope="col">By</th><th scope="col">Comment</th></tr></thead>
        <tbody className="divide-y divide-line">{rows.map((s: any) => (
          <tr key={s.id}><td className="py-1.5 whitespace-nowrap">{fmtDate(s.created_at)}</td><td>{s.flow} · {s.step}</td><td>{s.decision}{s.on_time === 0 ? ' (late)' : ''}</td><td>{s.actor_name || 'System'}</td><td>{s.comment}</td></tr>))}</tbody></table>
    </Section>
  );
}

function ClientView({ e, onChange, docs, download }: { e: any; onChange: (x: any) => void; docs: any[]; download: (k: string, l: string) => void }) {
  return (
    <div>
      <Link to="/app/engagements" className="inline-flex items-center gap-1 text-sm text-slate mb-3"><ArrowLeft size={14} aria-hidden /> All exercises</Link>
      <PageHeader eyebrow={e.reference} title={e.title} description={e.institution_name} actions={<StatusBadge status={e.status} />} />
      <Section title="About this exercise">
        <p className="text-sm mb-2">{STATUS_LABELS[e.status]}. Period: {fmtDate(e.start_date)} → {fmtDate(e.end_date)}.</p>
        {e.objectives?.length > 0 && <ul className="list-disc pl-5 text-sm">{e.objectives.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul>}
        {e.compliance_level && <p className="text-sm mt-3 flex items-center gap-2">Compliance level: <RagBadge status={e.compliance_level} /></p>}
      </Section>
      <DocumentsPanel e={e} onChange={onChange} canEdit={false} />
      <MatrixPanel e={e} onChange={onChange} canEdit={false} isClient />
      {e.certificate && <Section title="Certificate"><p className="text-sm">Compliance certificate <strong>{e.certificate.certificate_no}</strong> valid to {fmtDate(e.certificate.valid_until)}.</p></Section>}
      {docs.length > 0 && <Section title="Documents"><div className="flex gap-2">{docs.map((d) => <button key={d.kind} className="btn-outline text-xs" onClick={() => download(d.kind, d.label)}><Download size={13} aria-hidden /> {d.label}</button>)}</div></Section>}
    </div>
  );
}
