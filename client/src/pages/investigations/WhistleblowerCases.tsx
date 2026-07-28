import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, EmptyState, StatusBadge } from '../../components/common/UI';

export default function WhistleblowerCases() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    api.get('/whistleblower').then((r) => { setReports(r); setLoading(false); });
  }, []);

  if (loading) return <LoadingSpinner />;
  const filtered = statusFilter ? reports.filter((r) => r.status === statusFilter) : reports;

  return (
    <div>
      <PageHeader
        eyebrow="Section 10.1 · 20.3 Restricted"
        title="Whistleblower Cases"
        description="Every report is browser-encrypted end to end. Opening a report here decrypts it and is logged to that report's access trail."
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {['', 'Received', 'UnderReview', 'Referred', 'Closed', 'Insufficient'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? 'bg-charcoal text-white border-charcoal' : 'border-line text-slate hover:border-charcoal/40'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No reports match" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-xs uppercase tracking-wide text-slate">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Tracking Code</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Institution</th>
                <th className="text-left px-4 py-3 font-medium">Received</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-parchment/60 cursor-pointer" onClick={() => navigate(`/app/whistleblower-cases/${r.id}`)}>
                  <td className="px-4 py-3 font-mono text-xs">{r.tracking_code}</td>
                  <td className="px-4 py-3">{r.category}</td>
                  <td className="px-4 py-3 text-slate">{r.institution_name || '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
