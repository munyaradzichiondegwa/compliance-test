import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, downloadBlob } from '../../api/client';
import { PageHeader, LoadingSpinner, EmptyState } from '../../components/common/UI';

export default function AuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/audit-logs?limit=300').then((l) => { setLogs(l); setLoading(false); });
  }, []);

  const exportCsv = async () => {
    const blob = await api.blob('/audit-logs/export.csv');
    downloadBlob(blob, 'Audit_Log_Export.csv');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        eyebrow="Section 19"
        title="Audit Log"
        description="Immutable trail of every action taken across the Portal — logins, approvals, referrals, and configuration changes."
        actions={<button className="btn-outline" onClick={exportCsv}><Download size={15} /> Export CSV</button>}
      />

      {logs.length === 0 ? (
        <EmptyState title="No audit events yet" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-xs uppercase tracking-wide text-slate">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{l.user_name || <span className="text-slate-light italic">System / Anonymous</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-3 text-xs text-slate">{l.entity_type}{l.entity_id ? ` · ${l.entity_id.slice(0, 8)}…` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
