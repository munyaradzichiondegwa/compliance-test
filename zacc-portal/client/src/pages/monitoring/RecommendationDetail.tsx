import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, LoadError, Card, StatusBadge } from '../../components/common/UI';

export default function RecommendationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [responseText, setResponseText] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoadError(false);
    api.get(`/recommendations/${id}`).then((r) => { setRec(r); setLoading(false); }).catch(() => { setLoadError(true); setLoading(false); });
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return <LoadingSpinner />;
  if (loadError || !rec) return <LoadError message="This recommendation couldn't be found." />;

  const canRespond = ['Assigned', 'Created', 'Incomplete'].includes(rec.status) && user?.role === 'INSTITUTION_FOCAL_PERSON';
  const canVerify = rec.status === 'ResponseSubmitted' && ['MONITORING_OFFICER', 'SUPER_ADMIN'].includes(user?.role || '');

  const submitResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api.upload(`/recommendations/${id}/evidence`, fd);
      }
      await api.put(`/recommendations/${id}/respond`, { responseText });
      load();
    } finally {
      setBusy(false);
    }
  };

  const verify = async (decision: 'verify' | 'reject') => {
    setBusy(true);
    try {
      await api.put(`/recommendations/${id}/verify`, { decision, notes: verifyNotes });
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow={rec.institution_name} title={rec.description} actions={<StatusBadge status={rec.status} />} />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate">Category</dt><dd>{rec.category}</dd></div>
            <div className="flex justify-between"><dt className="text-slate">Priority</dt><dd>{rec.priority}</dd></div>
            <div className="flex justify-between"><dt className="text-slate">Due date</dt><dd className="font-mono">{rec.due_date}</dd></div>
            <div className="flex justify-between"><dt className="text-slate">Owner</dt><dd>{rec.owner_name}</dd></div>
          </dl>

          {rec.response_text && (
            <div className="mt-4 pt-4 border-t border-line">
              <div className="text-xs uppercase tracking-wide text-slate mb-1">Institution Response</div>
              <p className="text-sm text-ink">{rec.response_text}</p>
            </div>
          )}
          {rec.verification_notes && (
            <div className="mt-4 pt-4 border-t border-line">
              <div className="text-xs uppercase tracking-wide text-slate mb-1">Verification Notes</div>
              <p className="text-sm text-ink">{rec.verification_notes}</p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {canRespond && (
            <Card>
              <div className="text-xs uppercase tracking-wide text-slate mb-3">Submit Your Response</div>
              <form onSubmit={submitResponse} className="space-y-3">
                <textarea className="input" placeholder="Describe the corrective action taken…" required value={responseText} onChange={(e) => setResponseText(e.target.value)} />
                <label className="btn-outline text-xs cursor-pointer inline-flex w-full justify-center">
                  <Upload size={13} /> {file ? file.name : 'Attach Evidence (optional)'}
                  <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Submitting…' : 'Submit Response'}</button>
              </form>
            </Card>
          )}

          {canVerify && (
            <Card className="border-brass/40 bg-brass/5">
              <div className="text-xs uppercase tracking-wide text-brass-dark mb-3 font-semibold">Verify Evidence</div>
              <textarea className="input mb-3" placeholder="Verification notes…" value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => verify('verify')} disabled={busy} className="btn-primary flex-1"><CheckCircle2 size={15} /> Verify & Close</button>
                <button onClick={() => verify('reject')} disabled={busy || !verifyNotes} className="btn-outline flex-1"><XCircle size={15} /> Insufficient</button>
              </div>
            </Card>
          )}

          {!canRespond && !canVerify && (
            <Card>
              <div className="text-sm text-slate text-center py-4">
                {rec.status === 'Closed' || rec.status === 'Verified' ? 'This recommendation has been closed.' : 'Awaiting action from the responsible party.'}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
