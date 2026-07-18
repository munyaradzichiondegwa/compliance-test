import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, EmptyState, StatusBadge, Modal } from '../../components/common/UI';

export default function SystemsReviews() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/systems-reviews').then((r) => {
      setReviews(r);
      setLoading(false);
    });
  };
  useEffect(load, []);

  return (
    <div>
      <PageHeader
        eyebrow="Section 10.1"
        title="Systems Reviews"
        description="Collaborative deep-dive reviews with version-controlled evidence and a shared findings library."
        actions={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={15} /> New Review
          </button>
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : reviews.length === 0 ? (
        <EmptyState title="No systems reviews yet" />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {reviews.map((r) => (
            <div key={r.id} className="card p-5 cursor-pointer hover:shadow-raised transition-shadow" onClick={() => navigate(`/app/systems-reviews/${r.id}`)}>
              <div className="flex items-start justify-between mb-2">
                <div className="font-display font-semibold text-ink">{r.title}</div>
                <StatusBadge status={r.status} />
              </div>
              <div className="text-xs text-slate mb-3">{r.institution_name} · Lead: {r.lead_reviewer_name}</div>
              {r.ai_summary && <p className="text-xs text-slate leading-relaxed line-clamp-3">{r.ai_summary}</p>}
            </div>
          ))}
        </div>
      )}

      <NewReviewModal open={showNew} onClose={() => setShowNew(false)} onCreated={(id) => navigate(`/app/systems-reviews/${id}`)} />
    </div>
  );
}

function NewReviewModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [reviewers, setReviewers] = useState<any[]>([]);
  const [form, setForm] = useState({ institutionId: '', title: '', scope: '', reviewerIds: [] as string[] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      api.get('/institutions?limit=200').then((r) => setInstitutions(r.results));
      api.get('/users?role=SYSTEMS_REVIEWER').then(setReviewers);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/systems-reviews', form);
      onCreated(res.id);
    } finally {
      setBusy(false);
    }
  };

  const toggleReviewer = (id: string) => {
    setForm((f) => ({ ...f, reviewerIds: f.reviewerIds.includes(id) ? f.reviewerIds.filter((r) => r !== id) : [...f.reviewerIds, id] }));
  };

  return (
    <Modal open={open} onClose={onClose} title="Start New Systems Review">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Title</label>
          <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="label">Institution</label>
          <select className="input" required value={form.institutionId} onChange={(e) => setForm({ ...form, institutionId: e.target.value })}>
            <option value="">Select…</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Scope</label>
          <textarea className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
        </div>
        {reviewers.length > 0 && (
          <div>
            <label className="label">Co-Reviewers</label>
            <div className="flex flex-wrap gap-1.5">
              {reviewers.map((r) => (
                <button type="button" key={r.id} onClick={() => toggleReviewer(r.id)} className={`text-xs px-2.5 py-1 rounded-full border ${form.reviewerIds.includes(r.id) ? 'bg-navy text-white border-navy' : 'border-line text-slate'}`}>
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Creating…' : 'Create Review'}</button>
      </form>
    </Modal>
  );
}
