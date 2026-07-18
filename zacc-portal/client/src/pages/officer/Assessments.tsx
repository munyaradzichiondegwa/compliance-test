import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, StatusBadge, RagBadge, Modal } from '../../components/common/UI';

export default function Assessments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  const isOfficer = user?.role === 'COMPLIANCE_OFFICER';

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (isOfficer) params.set('mine', 'true');
    api.get(`/assessments?${params.toString()}`).then((r) => {
      setAssessments(r);
      setLoading(false);
    });
  };

  useEffect(load, [statusFilter]);

  return (
    <div>
      <PageHeader
        eyebrow="Section 10.1"
        title={isOfficer ? 'My Assessments' : 'Compliance Assessments'}
        description="Weighted 5-section digital checklist producing an instant composite score and RAG status."
        actions={
          isOfficer && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={15} /> New Assessment
            </button>
          )
        }
      />

      <div className="flex gap-2 mb-5">
        {['', 'Draft', 'Submitted', 'UnderReview', 'Returned', 'Approved', 'Closed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? 'bg-navy text-white border-navy' : 'border-line text-slate hover:border-navy/40'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : assessments.length === 0 ? (
        <EmptyState title="No assessments found" description={isOfficer ? 'Start a new assessment to get going.' : 'No assessments match this filter yet.'} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-xs uppercase tracking-wide text-slate">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Institution</th>
                <th className="text-left px-4 py-3 font-medium">Officer</th>
                <th className="text-left px-4 py-3 font-medium">Score</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {assessments.map((a) => (
                <tr key={a.id} className="hover:bg-parchment/60 cursor-pointer" onClick={() => navigate(`/app/assessments/${a.id}`)}>
                  <td className="px-4 py-3">
                    <span className="text-navy font-medium">{a.institution_name}</span>
                    <div className="text-xs text-slate">{a.institution_province}</div>
                  </td>
                  <td className="px-4 py-3 text-slate">{a.officer_name}</td>
                  <td className="px-4 py-3">
                    {a.composite_score !== null ? (
                      <span className="font-mono mr-2">{a.composite_score.toFixed(1)}</span>
                    ) : (
                      <span className="text-slate-light text-xs">—</span>
                    )}
                    <RagBadge status={a.rag_status} />
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate font-mono">{new Date(a.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewAssessmentModal open={showNew} onClose={() => setShowNew(false)} onCreated={(id) => navigate(`/app/assessments/${id}`)} />
    </div>
  );
}

function NewAssessmentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institutionId, setInstitutionId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) api.get('/institutions?limit=200').then((r) => setInstitutions(r.results));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/assessments', { institutionId });
      onCreated(res.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Start New Assessment">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Institution</label>
          <select className="input" required value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
            <option value="">Select institution…</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <button type="submit" disabled={busy || !institutionId} className="btn-primary w-full">{busy ? 'Creating…' : 'Start Assessment'}</button>
      </form>
    </Modal>
  );
}
