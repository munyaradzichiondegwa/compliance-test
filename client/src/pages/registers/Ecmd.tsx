import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, LoadingSpinner, EmptyState, RagBadge, KpiCard, LoadError } from '../../components/common/UI';
import { useLoad, DataTable } from './shared';

export default function Ecmd() {
  const nav = useNavigate();
  const { data, loading, error } = useLoad<any>('/monitoring/ecmd');
  if (loading) return <LoadingSpinner />;
  if (error || !data) return <LoadError message={error} />;
  const level = (l: string) => <RagBadge status={l} />;
  return (
    <div>
      <PageHeader eyebrow="Electronic Compliance Monitoring Dashboard" title="ECMD" description="Latest rating of every institution that has completed a compliance assessment or systems review, with its Red → Amber → Green history from monitoring re-checks." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Institutions tracked" value={data.summary.total} /><KpiCard label="Green" value={data.summary.Green} tone="green" /><KpiCard label="Amber" value={data.summary.Amber} tone="amber" /><KpiCard label="Red" value={data.summary.Red} tone="red" />
      </div>
      {data.rows.length === 0 ? <EmptyState title="No completed engagements yet" description="Institutions appear here once an assessment or review is completed." /> : (
        <DataTable caption="Institution compliance ratings" heads={['Institution', 'Province', 'Level', 'Implemented', 'History', 'Next monitoring', 'Certificate']}>
          {data.rows.map((r: any) => (
            <tr key={r.institutionId} className="hover:bg-parchment/60">
              <td className="px-4 py-3"><button className="underline-offset-2 hover:underline text-left font-medium" onClick={() => nav(`/app/engagements/${r.engagementId}`)}>{r.institution}</button><div className="text-xs text-slate">{r.reference}</div></td>
              <td className="px-4 py-3">{r.province}</td><td className="px-4 py-3">{level(r.level)}</td><td className="px-4 py-3">{r.implemented}/{r.total}</td>
              <td className="px-4 py-3"><ol className="flex gap-1 flex-wrap" aria-label="Rating history">{r.history.map((h: any, i: number) => <li key={i} title={h.date} className="text-xs">{i > 0 && <span aria-hidden>→ </span>}{h.level}</li>)}</ol></td>
              <td className="px-4 py-3 whitespace-nowrap">{r.monitoringDue || '—'}</td>
              <td className="px-4 py-3 text-xs">{r.certificate ? `${r.certificate.certificate_no} · to ${String(r.certificate.valid_until).slice(0, 10)}` : r.openMeasures ? `${r.openMeasures} regulator measure(s)` : '—'}</td>
            </tr>))}
        </DataTable>)}
    </div>
  );
}
