import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, StatusBadge, LoadError } from '../../components/common/UI';
import { useLoad, DataTable } from './shared';

const MEASURES: Record<string, string> = { LimitedDevolutionFunds: 'Limit devolution funds', SuspendGovtContracts: 'Suspend government contracts', SuspendTaxHolidays: 'Suspend tax holidays', StockExchangeDelisting: 'Stock exchange delisting', Other: 'Other' };
export default function Certificates() {
  const { user } = useAuth();
  const isClient = user?.role === 'INTEGRITY_COMMITTEE_CHAIR' || user?.role === 'INSTITUTION_FOCAL_PERSON';
  const [tick, setTick] = useState(0);
  const certs = useLoad<any[]>('/monitoring/certificates', [tick]);
  const notices = useLoad<any[]>(isClient ? null : '/monitoring/regulator-notices', [tick]);
  const canDecide = !!user && ['GM_PREVENTION', 'EXECUTIVE_SECRETARY', 'COMMISSION_CHAIR', 'SUPER_ADMIN'].includes(user.role);
  const setStatus = async (id: string, status: string) => { try { await api.put(`/monitoring/regulator-notices/${id}/status`, { status }); setTick(tick + 1); } catch { /* reload shows state */ } };
  return (
    <div>
      <PageHeader eyebrow="Compliance certification" title={isClient ? 'Our compliance certificate' : 'Certificates and regulator measures'} description="A certificate is issued only when every recommendation is implemented (Green) and is valid for 12 months. Non-compliant institutions may be referred to regulators for measures such as limiting devolution funds." />
      {certs.loading ? <LoadingSpinner /> : certs.error ? <LoadError message={certs.error} /> : !certs.data?.length ? <EmptyState title="No certificates issued" /> : (
        <DataTable caption="Compliance certificates" heads={['Certificate', 'Institution', 'Issued', 'Valid until', 'Status']}>
          {certs.data.map((c) => <tr key={c.id}><td className="px-4 py-3 font-medium">{c.certificate_no}</td><td className="px-4 py-3">{c.institution_name}</td><td className="px-4 py-3">{String(c.issued_at).slice(0, 10)}</td>
            <td className="px-4 py-3">{String(c.valid_until).slice(0, 10)}{c.expiring_soon && c.effective_status === 'Active' ? <span className="badge-amber ml-2">Expires within 60 days</span> : null}</td><td className="px-4 py-3"><StatusBadge status={c.effective_status} /></td></tr>)}
        </DataTable>)}
      {!isClient && (
        <>
          <h2 className="font-display font-semibold mt-8 mb-2">Regulator measures</h2>
          {notices.loading ? <LoadingSpinner /> : !notices.data?.length ? <p className="text-sm text-slate">None proposed.</p> : (
            <DataTable caption="Regulator measures" heads={['Institution', 'Measure', 'Regulator', 'Engagement', 'Status', '']}>
              {notices.data.map((n) => <tr key={n.id}><td className="px-4 py-3">{n.institution_name}</td><td className="px-4 py-3">{MEASURES[n.measure] || n.measure}</td><td className="px-4 py-3">{n.regulator || '—'}</td><td className="px-4 py-3">{n.reference || '—'}</td><td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                <td className="px-4 py-3">{canDecide && <select aria-label="Change status" className="input !w-auto !py-1 text-xs" value="" onChange={(e) => e.target.value && setStatus(n.id, e.target.value)}><option value="">Change…</option>{['Approved', 'Notified', 'Lifted'].map((s) => <option key={s}>{s}</option>)}</select>}</td></tr>)}
            </DataTable>)}
        </>)}
    </div>
  );
}
