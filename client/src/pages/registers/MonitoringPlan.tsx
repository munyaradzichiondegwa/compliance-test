import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, LoadingSpinner, EmptyState, LoadError } from '../../components/common/UI';
import { useLoad, DataTable } from './shared';

const TYPE_LABELS: Record<string, string> = { MonitoringVisit: 'Monitoring visit', RedFollowUp: 'Red follow-up', CertificateExpiry: 'Certificate expiry', ICDeliverable: 'IC deliverable', FundAcquittal: 'Fund acquittal' };

export default function MonitoringPlan() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const nav = useNavigate();
  const { data, loading, error } = useLoad<any>(`/monitoring/plan?year=${year}&quarter=${quarter}`);
  return (
    <div>
      <PageHeader eyebrow="Quarterly monitoring plan" title={`Monitoring plan — ${year} Q${quarter}`} description="Generated from the engagements, certificates, Integrity Committee deliverables and fund acquittals that fall due in the quarter, including anything overdue." />
      <div className="flex gap-3 mb-4 items-end">
        <label className="text-xs text-slate">Year<input className="input !w-24 block" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
        <label className="text-xs text-slate">Quarter<select className="input !w-24 block" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}</select></label>
        <button className="btn-outline text-xs" onClick={() => window.print()}>Print plan</button>
      </div>
      {loading ? <LoadingSpinner /> : error || !data ? <LoadError message={error} /> : data.items.length === 0 ? <EmptyState title="Nothing due" description="No monitoring activities fall due in this quarter." /> : (
        <DataTable caption="Planned monitoring activities" heads={['Due', 'Type', 'Institution', 'Activity', 'Note']}>
          {data.items.map((i: any, k: number) => (
            <tr key={k} className="align-top"><td className={`px-4 py-3 whitespace-nowrap ${i.overdue ? 'text-status-red font-medium' : ''}`}>{String(i.due).slice(0, 10)}{i.overdue ? ' (overdue)' : ''}</td>
              <td className="px-4 py-3">{TYPE_LABELS[i.type] || i.type}</td><td className="px-4 py-3">{i.institution}<div className="text-xs text-slate">{i.province}</div></td>
              <td className="px-4 py-3">{i.engagementId ? <button className="underline-offset-2 hover:underline text-left" onClick={() => nav(`/app/engagements/${i.engagementId}`)}>{i.label}</button> : i.label}</td><td className="px-4 py-3 text-xs text-slate">{i.note}</td></tr>))}
        </DataTable>)}
    </div>
  );
}
