import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, Plus, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, LoadError, Card, StatusBadge } from '../../components/common/UI';

const STATUS_FLOW = ['Draft', 'InProgress', 'UnderApproval', 'Approved', 'Closed'];

export default function SystemsReviewDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newFinding, setNewFinding] = useState('');
  const [findingCategory, setFindingCategory] = useState('Procurement');
  const [findingSeverity, setFindingSeverity] = useState('Medium');
  const [possibleDupes, setPossibleDupes] = useState<any[]>([]);
  const [submittingFinding, setSubmittingFinding] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [execSummary, setExecSummary] = useState('');
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoadError(false);
    api.get(`/systems-reviews/${id}`).then((d) => {
      setData(d);
      setExecSummary(d.executive_summary || '');
      setLoading(false);
    }).catch(() => { setLoadError(true); setLoading(false); });
  };
  useEffect(load, [id]);

  if (loading) return <LoadingSpinner />;
  if (loadError || !data) return <LoadError message="This systems review couldn't be found." />;

  const canApprove = ['PREVENTION_HEAD', 'SUPER_ADMIN'].includes(user?.role || '');
  const isReviewer = data.reviewers.some((r: any) => r.id === user?.id) || user?.role === 'SUPER_ADMIN';
  const currentIdx = STATUS_FLOW.indexOf(data.status);

  const advanceStatus = async () => {
    const nextStatus = STATUS_FLOW[currentIdx + 1];
    if (!nextStatus) return;
    if (nextStatus === 'Approved' && !canApprove) {
      alert('Only the Prevention Head can approve a systems review.');
      return;
    }
    setChangingStatus(true);
    try {
      await api.put(`/systems-reviews/${id}/status`, { status: nextStatus, executiveSummary: nextStatus === 'UnderApproval' ? execSummary : undefined });
      load();
    } finally {
      setChangingStatus(false);
    }
  };

  const submitFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFinding.trim()) return;
    setSubmittingFinding(true);
    try {
      const res = await api.post(`/systems-reviews/${id}/findings`, { findingText: newFinding, category: findingCategory, severity: findingSeverity });
      setPossibleDupes(res.possibleDuplicates || []);
      setNewFinding('');
      load();
    } finally {
      setSubmittingFinding(false);
    }
  };

  const uploadDocVersion = async (docId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('changeNote', 'Uploaded via Portal');
    await api.upload(`/systems-reviews/${id}/documents/${docId}/versions`, fd);
    load();
  };

  return (
    <div>
      <PageHeader eyebrow={data.institution_name} title={data.title} description={data.scope} actions={<StatusBadge status={data.status} />} />

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {STATUS_FLOW.map((s, i) => (
          <div key={s} className={`text-center py-2 rounded text-xs font-medium ${i < currentIdx ? 'bg-status-green-bg text-status-green' : i === currentIdx ? 'bg-brass text-white' : 'bg-line text-slate'}`}>
            {s}
          </div>
        ))}
      </div>

      {isReviewer && currentIdx < STATUS_FLOW.length - 1 && (
        <Card className="mb-6">
          {STATUS_FLOW[currentIdx + 1] === 'UnderApproval' && (
            <div className="mb-3">
              <label className="label">Executive Summary (required to submit for approval)</label>
              <textarea className="input" value={execSummary} onChange={(e) => setExecSummary(e.target.value)} placeholder="Summarise the review's key findings and overall conclusion…" />
            </div>
          )}
          <button
            onClick={advanceStatus}
            disabled={changingStatus || (STATUS_FLOW[currentIdx + 1] === 'UnderApproval' && !execSummary.trim())}
            className="btn-primary"
          >
            {changingStatus ? 'Updating…' : `Move to "${STATUS_FLOW[currentIdx + 1]}"`}
          </button>
        </Card>
      )}

      {data.ai_summary && (
        <Card className="mb-6 bg-navy/[0.03]">
          <div className="text-xs uppercase tracking-wide text-slate mb-2">AI Executive Brief</div>
          <p className="text-sm text-ink leading-relaxed">{data.ai_summary}</p>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Reviewers</div>
          <div className="space-y-2 mb-4">
            {data.reviewers.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.name}</span>
                <span className="text-xs text-slate">{r.role_in_review}</span>
              </div>
            ))}
          </div>

          <div className="text-xs uppercase tracking-wide text-slate mb-3 pt-3 border-t border-line">Documents</div>
          <div className="space-y-3">
            {data.documents.map((doc: any) => (
              <div key={doc.id} className="border border-line rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{doc.title}</span>
                  <span className="text-xs font-mono text-slate">v{doc.current_version_no}</span>
                </div>
                <div className="space-y-1 mb-2">
                  {doc.versions.map((v: any) => (
                    <div key={v.id} className="text-xs text-slate flex items-center justify-between">
                      <span>v{v.version_no} — {v.change_note || 'No note'}</span>
                      <span className="font-mono text-slate-light">{new Date(v.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
                {isReviewer && (
                  <label className="btn-outline text-xs cursor-pointer inline-flex">
                    <Upload size={12} /> Upload New Version
                    <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadDocVersion(doc.id, e.target.files[0])} />
                  </label>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Findings Library</div>
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {data.findings.map((f: any) => (
              <div key={f.id} className="border-b border-line last:border-0 pb-2 last:pb-0">
                <div className="text-sm text-ink">{f.finding_text}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate">{f.category}</span>
                  <span className={f.severity === 'Critical' || f.severity === 'High' ? 'badge-red' : f.severity === 'Medium' ? 'badge-amber' : 'badge-green'}>{f.severity}</span>
                  {f.duplicate_of_finding_id && <span className="badge-slate">Possible duplicate ({Math.round(f.similarity_score * 100)}%)</span>}
                </div>
              </div>
            ))}
          </div>

          {isReviewer && (
            <form onSubmit={submitFinding} className="space-y-2 bg-parchment/60 rounded p-3">
              <textarea className="input text-sm" placeholder="Describe a new finding…" value={newFinding} onChange={(e) => setNewFinding(e.target.value)} />
              <div className="flex gap-2">
                <select className="input text-sm" value={findingCategory} onChange={(e) => setFindingCategory(e.target.value)}>
                  {['Procurement', 'Finance', 'Governance', 'Integrity', 'Controls'].map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="input text-sm" value={findingSeverity} onChange={(e) => setFindingSeverity(e.target.value)}>
                  {['Low', 'Medium', 'High', 'Critical'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <button type="submit" disabled={submittingFinding} className="btn-primary w-full text-sm"><Plus size={13} /> Add Finding</button>
              {possibleDupes.length > 0 && (
                <div className="bg-status-amber-bg text-status-amber text-xs rounded p-2 flex items-start gap-1.5">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>AI detected {possibleDupes.length} similar existing finding(s) — review before treating this as new.</span>
                </div>
              )}
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
