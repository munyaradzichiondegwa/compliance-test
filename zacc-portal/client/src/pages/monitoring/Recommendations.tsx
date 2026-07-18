import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api, downloadBlob } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, StatusBadge } from '../../components/common/UI';

export default function Recommendations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const isFocalPerson = user?.role === 'INSTITUTION_FOCAL_PERSON';

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (overdueOnly) params.set('overdue', 'true');
    if (isFocalPerson) params.set('mine', 'true');
    api.get(`/recommendations?${params.toString()}`).then((r) => {
      setRecs(r);
      setLoading(false);
    });
  };
  useEffect(load, [statusFilter, overdueOnly]);

  const exportCsv = async () => {
    const blob = await api.blob('/recommendations/register/export.csv');
    downloadBlob(blob, 'Recommendation_Register.csv');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Section 10.1 · 9.2"
        title={isFocalPerson ? 'My Recommendations' : 'Recommendation Tracker'}
        description="Created → Assigned → Response Submitted → Verified/Closed, with 30/60/90-day escalation."
        actions={
          !isFocalPerson && (
            <button className="btn-outline" onClick={exportCsv}>
              <Download size={15} /> Export CSV
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {['', 'Created', 'Assigned', 'ResponseSubmitted', 'Verified', 'Closed', 'Incomplete'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? 'bg-navy text-white border-navy' : 'border-line text-slate hover:border-navy/40'}`}>
            {s || 'All'}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-slate ml-2">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
        </label>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : recs.length === 0 ? (
        <EmptyState title="Nothing here" description="No recommendations match this filter." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-xs uppercase tracking-wide text-slate">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">Institution</th>
                <th className="text-left px-4 py-3 font-medium">Priority</th>
                <th className="text-left px-4 py-3 font-medium">Due</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recs.map((r) => (
                <tr key={r.id} className={`hover:bg-parchment/60 cursor-pointer ${r.daysOverdue > 0 ? 'bg-status-red-bg/30' : ''}`} onClick={() => navigate(`/app/recommendations/${r.id}`)}>
                  <td className="px-4 py-3 max-w-xs truncate">{r.description}</td>
                  <td className="px-4 py-3 text-slate">{r.institution_name}</td>
                  <td className="px-4 py-3">
                    <span className={r.priority === 'High' || r.priority === 'Critical' ? 'badge-red' : r.priority === 'Medium' ? 'badge-amber' : 'badge-green'}>{r.priority}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.due_date}
                    {r.daysOverdue > 0 && <span className="text-status-red ml-1">({r.daysOverdue}d overdue)</span>}
                  </td>
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
