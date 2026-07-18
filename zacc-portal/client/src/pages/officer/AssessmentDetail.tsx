import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Download, MapPin, Sparkles, Send, CheckCircle2, XCircle } from 'lucide-react';
import { api, downloadBlob } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, LoadError, Card, RagBadge, StatusBadge } from '../../components/common/UI';
import ComplianceRing from '../../components/common/ComplianceRing';

const SECTION_LABELS: Record<string, string> = { governance: 'Governance (20%)', controls: 'Internal Controls (25%)', procurement: 'Procurement (20%)', finance: 'Financial Management (20%)', integrity: 'Integrity (15%)' };
const RESPONSES = ['Compliant', 'PartiallyCompliant', 'NonCompliant', 'NotApplicable'];
const RESPONSE_LABELS: Record<string, string> = { Compliant: 'Compliant', PartiallyCompliant: 'Partial', NonCompliant: 'Non-Compliant', NotApplicable: 'N/A' };

export default function AssessmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<any>(null);
  const [geoStatus, setGeoStatus] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const saveTimer = useRef<any>(null);

  const load = useCallback(() => {
    setLoadError(false);
    api.get(`/assessments/${id}`).then((d) => {
      setData(d);
      setScores({ compositeScore: d.composite_score, ragStatus: d.rag_status });
      setLoading(false);
    }).catch(() => { setLoadError(true); setLoading(false); });
  }, [id]);

  useEffect(load, [load]);

  if (loading) return <LoadingSpinner />;
  if (loadError || !data) return <LoadError message="This assessment couldn't be found." />;

  const isMine = data.officer_id === user?.id;
  const canEdit = (data.status === 'Draft' || data.status === 'Returned') && (isMine || user?.role === 'SUPER_ADMIN');
  const canReview = ['Submitted', 'UnderReview'].includes(data.status) && ['PREVENTION_HEAD', 'SUPER_ADMIN'].includes(user?.role || '');

  const updateItem = (itemId: string, field: 'response' | 'comments', value: string) => {
    setData((d: any) => ({ ...d, items: d.items.map((it: any) => (it.id === itemId ? { ...it, [field]: value } : it)) }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = data.items.map((it: any) => ({ id: it.id, response: it.id === itemId && field === 'response' ? value : it.response, comments: it.id === itemId && field === 'comments' ? value : it.comments }));
      const res = await api.put(`/assessments/${id}/checklist`, { items: payload });
      setScores(res);
    }, 400);
  };

  const captureGeo = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocation not supported by this browser.');
      return;
    }
    setGeoStatus('Capturing…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await api.put(`/assessments/${id}/geotag`, { lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus(`Captured: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => setGeoStatus('Unable to capture location — you can enter it manually later.')
    );
  };

  const runAiDraft = async () => {
    setDrafting(true);
    try {
      const res = await api.post(`/assessments/${id}/ai-draft`);
      setData((d: any) => ({ ...d, findings_text: res.narrative }));
    } finally {
      setDrafting(false);
    }
  };

  const submitAssessment = async () => {
    setSubmitting(true);
    try {
      await api.put(`/assessments/${id}/submit`);
      load();
    } catch (err: any) {
      alert(err.message || 'Could not submit — check all checklist items are answered.');
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (decision: 'approve' | 'return') => {
    setReviewing(true);
    try {
      await api.put(`/assessments/${id}/review`, { decision, notes: reviewNotes });
      load();
    } finally {
      setReviewing(false);
    }
  };

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const blob = await api.blob(`/assessments/${id}/report`);
      downloadBlob(blob, `Assessment_Report_${data.institution_name.replace(/\s+/g, '_')}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  const answeredCount = data.items.filter((i: any) => i.response).length;

  return (
    <div>
      <PageHeader
        eyebrow={data.province}
        title={data.institution_name}
        description={`Assessed by ${data.officer_name} · ${new Date(data.created_at).toLocaleDateString()}`}
        actions={
          <>
            {['Approved', 'Closed'].includes(data.status) && (
              <button className="btn-outline" onClick={downloadReport} disabled={downloading}>
                <Download size={15} /> {downloading ? 'Generating…' : 'Download Report'}
              </button>
            )}
            <StatusBadge status={data.status} />
          </>
        }
      />

      <div className="grid lg:grid-cols-[240px_1fr] gap-6">
        {/* Score sidebar */}
        <div className="space-y-4">
          <Card className="flex flex-col items-center">
            <ComplianceRing compositeScore={scores?.compositeScore ?? data.composite_score} size={140} showLegend />
            <div className="mt-3"><RagBadge status={scores?.ragStatus ?? data.rag_status} /></div>
          </Card>
          {canEdit && (
            <Card>
              <div className="text-xs uppercase tracking-wide text-slate mb-2">Progress</div>
              <div className="text-sm mb-2">{answeredCount} / {data.items.length} answered</div>
              <div className="h-1.5 bg-line rounded-full overflow-hidden">
                <div className="h-full bg-brass transition-all" style={{ width: `${(answeredCount / data.items.length) * 100}%` }} />
              </div>
            </Card>
          )}
          <Card>
            <button onClick={captureGeo} className="btn-outline w-full text-xs">
              <MapPin size={13} /> Capture Site Location
            </button>
            {geoStatus && <div className="text-[11px] text-slate mt-2 font-mono">{geoStatus}</div>}
            {data.geotag_lat && <div className="text-[11px] text-slate mt-2 font-mono">Saved: {data.geotag_lat.toFixed(4)}, {data.geotag_lng.toFixed(4)}</div>}
          </Card>
        </div>

        {/* Main content */}
        <div className="space-y-6">
          {canReview && (
            <Card className="border-brass/40 bg-brass/5">
              <div className="text-xs uppercase tracking-wide text-brass-dark mb-2 font-semibold">Supervisor Review</div>
              <textarea className="input mb-3" placeholder="Review notes (required if returning)…" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => review('approve')} disabled={reviewing} className="btn-primary flex-1">
                  <CheckCircle2 size={15} /> Approve & Generate Recommendations
                </button>
                <button onClick={() => review('return')} disabled={reviewing || !reviewNotes} className="btn-outline flex-1">
                  <XCircle size={15} /> Return for Revision
                </button>
              </div>
            </Card>
          )}

          {['governance', 'controls', 'procurement', 'finance', 'integrity'].map((section) => (
            <Card key={section}>
              <div className="font-display font-semibold text-navy mb-4">{SECTION_LABELS[section]}</div>
              <div className="space-y-4">
                {data.items.filter((i: any) => i.section === section).map((item: any) => (
                  <div key={item.id} className="border-b border-line last:border-0 pb-4 last:pb-0">
                    <div className="text-sm text-ink mb-2">{item.item_text}</div>
                    {canEdit ? (
                      <>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {RESPONSES.map((r) => (
                            <button
                              key={r}
                              onClick={() => updateItem(item.id, 'response', r)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                item.response === r
                                  ? r === 'Compliant' ? 'bg-status-green text-white border-status-green' : r === 'NonCompliant' ? 'bg-status-red text-white border-status-red' : r === 'PartiallyCompliant' ? 'bg-status-amber text-white border-status-amber' : 'bg-slate text-white border-slate'
                                  : 'border-line text-slate hover:border-ink/30'
                              }`}
                            >
                              {RESPONSE_LABELS[r]}
                            </button>
                          ))}
                        </div>
                        {(item.response === 'NonCompliant' || item.response === 'PartiallyCompliant') && (
                          <input
                            className="input text-xs"
                            placeholder="Comments / evidence notes…"
                            value={item.comments || ''}
                            onChange={(e) => updateItem(item.id, 'comments', e.target.value)}
                          />
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        {item.response && (
                          <span className={item.response === 'Compliant' ? 'badge-green' : item.response === 'NonCompliant' ? 'badge-red' : item.response === 'PartiallyCompliant' ? 'badge-amber' : 'badge-slate'}>
                            {RESPONSE_LABELS[item.response]}
                          </span>
                        )}
                        {item.comments && <span className="text-xs text-slate italic">{item.comments}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}

          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="font-display font-semibold text-navy">Findings Narrative</div>
              {canEdit && (
                <button onClick={runAiDraft} disabled={drafting} className="btn-ghost text-xs">
                  <Sparkles size={13} /> {drafting ? 'Drafting…' : 'AI Auto-Draft'}
                </button>
              )}
            </div>
            {data.findings_text ? (
              <p className="text-sm text-slate leading-relaxed">{data.findings_text}</p>
            ) : (
              <p className="text-sm text-slate-light italic">No narrative yet. {canEdit && 'Use AI Auto-Draft or submit to generate one.'}</p>
            )}
          </Card>

          {data.recommendations?.length > 0 && (
            <Card>
              <div className="font-display font-semibold text-navy mb-3">Implementation Matrix</div>
              <div className="space-y-2">
                {data.recommendations.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-2 last:pb-0">
                    <span>{r.description}</span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {canEdit && (
            <button onClick={submitAssessment} disabled={submitting || answeredCount < data.items.length} className="btn-brass w-full py-3">
              <Send size={16} /> {submitting ? 'Submitting…' : answeredCount < data.items.length ? `Answer all items to submit (${answeredCount}/${data.items.length})` : 'Submit for Review'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
