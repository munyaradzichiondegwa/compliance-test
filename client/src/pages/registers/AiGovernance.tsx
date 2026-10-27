import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, Modal, KpiCard, LoadError } from '../../components/common/UI';
import { useLoad, DataTable } from './shared';

const FEATURE: Record<string, string> = { assessment_narrative: 'Assessment narrative', review_summary: 'Systems review summary', duplicate_detection: 'Duplicate detection', trend_prediction: 'Risk trend prediction', risk_score: 'Risk score' };
const REVIEWERS = ['COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MANAGER_COMPLIANCE', 'GM_PREVENTION', 'PROVINCIAL_HEAD', 'SUPER_ADMIN'];
const OVERSIGHT = ['GM_PREVENTION', 'MANAGER_COMPLIANCE', 'AUDITOR', 'SUPER_ADMIN'];
export default function AiGovernance() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'log' | 'bias'>('log');
  const [action, setAction] = useState('');
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<any>(null);
  const list = useLoad<any[]>(`/ai-governance/decisions${action ? `?action=${action}` : ''}`, [tick]);
  const bias = useLoad<any>(user && OVERSIGHT.includes(user.role) ? '/ai-governance/bias' : null);
  return (
    <div>
      <PageHeader eyebrow="AI governance" title="AI decisions and human oversight" description="Every AI output is logged with its inputs and explanation. A named officer must accept, modify or override it; the reason for any change is recorded and monitored for bias." />
      <div role="tablist" aria-label="AI governance views" className="flex gap-2 mb-4">
        {([['log', 'Decision log'], ['bias', 'Bias and override monitoring']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`px-3 py-1.5 text-sm rounded-full border ${tab === k ? 'bg-charcoal text-white border-charcoal' : 'border-line text-slate'}`} onClick={() => setTab(k)}>{l}</button>))}
      </div>
      {tab === 'log' && (
        <>
          <label className="text-xs text-slate block mb-3">Human action <select className="input !w-auto !py-1 text-xs" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All</option>{['Pending', 'Accepted', 'Modified', 'Overridden'].map((a) => <option key={a}>{a}</option>)}</select></label>
          {list.loading ? <LoadingSpinner /> : list.error ? <LoadError message={list.error} /> : !list.data?.length ? <EmptyState title="No AI outputs logged" /> : (
            <DataTable caption="AI decision log" heads={['When', 'Feature', 'Institution', 'Model', 'Human action', '']}>
              {list.data.map((d) => <tr key={d.id}><td className="px-4 py-3 whitespace-nowrap">{String(d.generated_at).slice(0, 16).replace('T', ' ')}</td><td className="px-4 py-3">{FEATURE[d.feature] || d.feature}</td><td className="px-4 py-3">{d.institution_name || '—'}</td><td className="px-4 py-3 text-xs">{d.model_version}</td>
                <td className="px-4 py-3"><span className={d.human_action === 'Pending' ? 'badge-amber' : d.human_action === 'Accepted' ? 'badge-green' : 'badge-slate'}>{d.human_action}</span>{d.human_name ? <div className="text-xs text-slate">{d.human_name}</div> : null}</td>
                <td className="px-4 py-3"><button className="btn-outline text-xs" onClick={() => setSel(d)}>{d.human_action === 'Pending' && user && REVIEWERS.includes(user.role) ? 'Review' : 'View'}</button></td></tr>)}
            </DataTable>)}
        </>)}
      {tab === 'bias' && (!user || !OVERSIGHT.includes(user.role) ? <p className="text-sm text-slate">Bias monitoring is available to the General Manager, Manager, Auditor and administrators.</p> : bias.loading ? <LoadingSpinner /> : !bias.data ? <LoadError message={bias.error} /> : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><KpiCard label="Outputs analysed" value={bias.data.sampleSize} /><KpiCard label="Adverse-outcome rate" value={`${bias.data.overallAdverseRate}%`} /></div>
          <DataTable caption="Override rate by feature" heads={['Feature', 'Total', 'Pending', 'Accepted', 'Modified', 'Overridden', 'Override rate', 'Alert']}>
            {bias.data.features.map((f: any) => <tr key={f.feature}><td className="px-4 py-3">{FEATURE[f.feature] || f.feature}</td><td className="px-4 py-3">{f.total}</td><td className="px-4 py-3">{f.pending}</td><td className="px-4 py-3">{f.accepted}</td><td className="px-4 py-3">{f.modified}</td><td className="px-4 py-3">{f.overridden}</td><td className="px-4 py-3">{f.overrideRate == null ? '—' : `${f.overrideRate}%`}</td><td className="px-4 py-3 text-status-red text-xs">{f.alert || ''}</td></tr>)}
          </DataTable>
          {([['By province', bias.data.byProvince], ['By institution type', bias.data.byInstitutionType]] as const).map(([t, rows]) => (
            <div key={t}><h2 className="font-display font-semibold mb-2">Adverse outcomes {t.toLowerCase()}</h2>
              <DataTable caption={`Adverse AI outcomes ${t.toLowerCase()}`} heads={['Group', 'Outputs', 'Adverse rate', 'Ratio to overall', 'Alert']}>
                {rows.map((r: any) => <tr key={r.group}><td className="px-4 py-3">{r.group}</td><td className="px-4 py-3">{r.n}</td><td className="px-4 py-3">{r.adverseRate}%</td><td className="px-4 py-3">{r.ratioToOverall ?? '—'}</td><td className="px-4 py-3 text-status-red text-xs">{r.alert || ''}</td></tr>)}</DataTable></div>))}
          <ul className="list-disc pl-5 text-sm text-slate">{bias.data.controls.map((c: string) => <li key={c}>{c}</li>)}</ul>
        </div>))}
      {sel && <ReviewModal d={sel} canReview={!!user && REVIEWERS.includes(user.role)} onClose={() => setSel(null)} onDone={() => { setSel(null); setTick(tick + 1); }} />}
    </div>
  );
}
function ReviewModal({ d, canReview, onClose, onDone }: { d: any; canReview: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [text, setText] = useState(d.output_text || '');
  const [err, setErr] = useState('');
  const send = async (action: string) => { setErr(''); try { await api.post(`/ai-governance/decisions/${d.id}/review`, { action, reason, finalText: action === 'Modified' ? text : undefined }); onDone(); } catch (e: any) { setErr(e.message); } };
  const x = d.explanation || {};
  return (
    <Modal open onClose={onClose} title={FEATURE[d.feature] || d.feature} wide>
      <div className="grid gap-3 text-sm">
        <div><h3 className="font-medium">How this output was produced</h3>
          <p>{x.method}</p>
          {x.limitations && <p className="text-slate mt-1"><strong>Limitations:</strong> {x.limitations}</p>}
          {x.factors && Object.keys(x.factors).length > 0 && <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 mt-2">{Object.entries(x.factors).map(([k, v]) => <React.Fragment key={k}><dt className="text-slate">{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></React.Fragment>)}</dl>}
          {x.confidence != null && <p className="mt-1">Confidence: {String(x.confidence)}</p>}
          <p className="text-xs text-slate mt-1">Model: {d.model_version} · Input: {d.input_summary || '—'}</p></div>
        <div><h3 className="font-medium">Output</h3>
          {d.human_action === 'Pending' && canReview ? <><label className="sr-only" htmlFor="ai-out">AI output (editable if you modify it)</label><textarea id="ai-out" className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} /></> : <p className="whitespace-pre-wrap bg-parchment p-2 rounded">{d.final_text || d.output_text}</p>}</div>
        {d.human_action !== 'Pending' && <p>Reviewed: <strong>{d.human_action}</strong>{d.human_name ? ` by ${d.human_name}` : ''}{d.human_reason ? ` — ${d.human_reason}` : ''}</p>}
        {d.human_action === 'Pending' && canReview && (
          <>
            <div><label className="label" htmlFor="ai-r">Reason (required to modify or override)</label><input id="ai-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div className="flex gap-2"><button className="btn-primary" onClick={() => send('Accepted')}>Accept</button><button className="btn-outline" disabled={reason.trim().length < 5} onClick={() => send('Modified')}>Save my edits</button><button className="btn-outline text-status-red" disabled={reason.trim().length < 5} onClick={() => send('Overridden')}>Override (discard)</button></div>
          </>)}
        {err && <p role="alert" className="text-status-red">{err}</p>}
      </div>
    </Modal>
  );
}
