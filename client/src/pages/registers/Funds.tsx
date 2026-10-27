import React, { useState } from 'react';
import { api, downloadBlob } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, Modal, LoadError } from '../../components/common/UI';
import { useLoad, useInstitutions, DataTable, usd, Flag, FLAG_LABELS } from './shared';

const WRITE = ['SUPER_ADMIN', 'GM_PREVENTION', 'MANAGER_COMPLIANCE', 'COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER', 'PROVINCIAL_HEAD', 'AUDITOR'];
export default function Funds() {
  const { user } = useAuth();
  const [fund, setFund] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const q = new URLSearchParams(); if (fund) q.set('fund', fund); if (flagged) q.set('flagged', 'true');
  const { data, loading, error } = useLoad<any[]>(`/monitoring/funds?${q}`, [tick]);
  const canWrite = !!user && WRITE.includes(user.role);
  const acquit = async (r: any) => { try { await api.put(`/monitoring/funds/${r.id}`, { acquitted: true, amountSpent: r.amount_spent }); setTick(tick + 1); } catch { /* shown by reload */ } };
  return (
    <div>
      <PageHeader eyebrow="Devolution Funds and ZINARA" title="Fund acquittal tracker" description="Disbursements to local authorities and whether they were acquitted. Flags: acquittal overdue (60 days after quarter end), legacy debt over 40% of the disbursement, overspending, and variances on acquitted funds."
        actions={<div className="flex gap-2"><button className="btn-outline" onClick={async () => downloadBlob(await api.blob('/monitoring/funds/export.csv'), 'Fund_Acquittals.csv')}>Export CSV</button>{canWrite && <button className="btn-primary" onClick={() => setOpen(true)}>Record disbursement</button>}</div>} />
      <div className="flex gap-4 items-center mb-3 text-xs text-slate">
        <label>Fund <select className="input !w-auto !py-1 text-xs" value={fund} onChange={(e) => setFund(e.target.value)}><option value="">All</option><option>Devolution</option><option>ZINARA</option><option>Other</option></select></label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Flagged only</label></div>
      {loading ? <LoadingSpinner /> : error ? <LoadError message={error} /> : !data?.length ? <EmptyState title="No disbursements recorded" /> : (
        <DataTable caption="Fund disbursements and acquittals" heads={['Institution', 'Fund', 'Period', 'Disbursed', 'Spent', 'Legacy debt', 'Variance', 'Status', 'Flags']}>
          {data.map((r) => (
            <tr key={r.id} className="align-top"><td className="px-4 py-3">{r.institution_name}</td><td className="px-4 py-3">{r.fund}</td><td className="px-4 py-3 whitespace-nowrap">{r.fiscal_year}{r.quarter ? ` Q${r.quarter}` : ''}</td>
              <td className="px-4 py-3">{usd(r.amount_disbursed)}</td><td className="px-4 py-3">{usd(r.amount_spent)}</td><td className="px-4 py-3">{usd(r.legacy_debt_paid)} <span className="text-xs text-slate">({r.legacy_share}%)</span></td><td className="px-4 py-3">{usd(r.variance)}</td>
              <td className="px-4 py-3">{r.acquitted ? `Acquitted ${String(r.acquittal_date || '').slice(0, 10)}` : canWrite ? <button className="btn-outline text-xs" onClick={() => acquit(r)}>Mark acquitted</button> : 'Outstanding'}</td>
              <td className="px-4 py-3">{r.flags.map((f: string) => <Flag key={f}>{FLAG_LABELS[f] || f}</Flag>)}</td></tr>))}
        </DataTable>)}
      <AddFund open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setTick(tick + 1); }} />
    </div>
  );
}
function AddFund({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const insts = useInstitutions();
  const [f, setF] = useState({ institutionId: '', fund: 'Devolution', fiscalYear: String(new Date().getFullYear()), quarter: '', amountDisbursed: '', amountSpent: '', legacyDebtPaid: '' });
  const [err, setErr] = useState('');
  const save = async () => { setErr(''); try { await api.post('/monitoring/funds', f); onSaved(); } catch (e: any) { setErr(e.message); } };
  const fld = (id: string, label: string, k: keyof typeof f, type = 'text') => <div><label className="label" htmlFor={id}>{label}</label><input id={id} className="input" type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>;
  return (
    <Modal open={open} onClose={onClose} title="Record fund disbursement" wide>
      <div className="grid gap-3">
        <div><label className="label" htmlFor="fd-i">Local authority / institution</label><select id="fd-i" className="input" value={f.institutionId} onChange={(e) => setF({ ...f, institutionId: e.target.value })}><option value="">Select…</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
        <div className="grid grid-cols-3 gap-3"><div><label className="label" htmlFor="fd-f">Fund</label><select id="fd-f" className="input" value={f.fund} onChange={(e) => setF({ ...f, fund: e.target.value })}><option>Devolution</option><option>ZINARA</option><option>Other</option></select></div>
          {fld('fd-y', 'Fiscal year', 'fiscalYear', 'number')}<div><label className="label" htmlFor="fd-q">Quarter</label><select id="fd-q" className="input" value={f.quarter} onChange={(e) => setF({ ...f, quarter: e.target.value })}><option value="">Annual</option>{[1, 2, 3, 4].map((q) => <option key={q}>{q}</option>)}</select></div></div>
        <div className="grid grid-cols-3 gap-3">{fld('fd-d', 'Disbursed (USD)', 'amountDisbursed', 'number')}{fld('fd-s', 'Spent (USD)', 'amountSpent', 'number')}{fld('fd-l', 'Legacy debt paid (USD)', 'legacyDebtPaid', 'number')}</div>
        {err && <p role="alert" className="text-sm text-status-red">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.institutionId || !f.amountDisbursed} onClick={save}>Save</button></div>
      </div>
    </Modal>
  );
}
