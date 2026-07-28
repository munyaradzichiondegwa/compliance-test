import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Send, Eye } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, LoadError, Card, StatusBadge } from '../../components/common/UI';

export default function WhistleblowerCaseDetail() {
  const { id } = useParams();
  const [report, setReport] = useState<any>(null);
  const [accessLog, setAccessLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusNote, setStatusNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoadError(false);
    try {
      const [r, log] = await Promise.all([api.get(`/whistleblower/${id}`), api.get(`/whistleblower/${id}/access-log`)]);
      setReport(r);
      setAccessLog(log);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return <LoadingSpinner />;
  if (loadError || !report) return <LoadError message="This report couldn't be found or you may not have access." />;

  const updateStatus = async (status: string) => {
    setBusy(true);
    try {
      await api.put(`/whistleblower/${id}/status`, { status, note: statusNote });
      setStatusNote('');
      load();
    } finally {
      setBusy(false);
    }
  };

  const refer = async () => {
    setBusy(true);
    try {
      await api.post(`/whistleblower/${id}/refer`);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow={report.category} title={`Report ${report.trackingCode}`} actions={<StatusBadge status={report.status} />} />

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <Card className="border-status-green/30 bg-status-green-bg/40">
            <div className="flex items-center gap-2 text-xs text-status-green mb-3 font-medium">
              <Lock size={13} /> Decrypted for authorised viewing — this action was just logged
            </div>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{report.narrative}</p>
            {report.institutionName && <div className="text-xs text-slate mt-3 pt-3 border-t border-status-green/20">Institution: {report.institutionName}</div>}
            {report.institutionFreetext && <div className="text-xs text-slate mt-3 pt-3 border-t border-status-green/20">Location described: {report.institutionFreetext}</div>}
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-wide text-slate mb-3">Update Status</div>
            <textarea className="input mb-3" placeholder="Case note…" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => updateStatus('UnderReview')} disabled={busy} className="btn-outline text-xs">Mark Under Review</button>
              <button onClick={() => updateStatus('Insufficient')} disabled={busy} className="btn-outline text-xs">Mark Insufficient</button>
              <button onClick={() => updateStatus('Closed')} disabled={busy} className="btn-outline text-xs">Close Case</button>
              <button onClick={refer} disabled={busy || !!report.referralEcmsCaseId} className="btn-gold text-xs ml-auto">
                <Send size={13} /> {report.referralEcmsCaseId ? `Referred (${report.referralEcmsCaseId})` : 'Refer to Investigations'}
              </button>
            </div>
          </Card>

          {report.updates?.length > 0 && (
            <Card>
              <div className="text-xs uppercase tracking-wide text-slate mb-3">Case Timeline</div>
              <div className="space-y-3">
                {report.updates.map((u: any) => (
                  <div key={u.id} className="flex gap-3 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold mt-1.5 shrink-0" />
                    <div>
                      <div className="font-medium text-ink">{u.status}</div>
                      {u.note && <div className="text-xs text-slate">{u.note}</div>}
                      <div className="text-[10px] text-slate-light font-mono">{new Date(u.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3 flex items-center gap-1.5"><Eye size={13} /> Access Log</div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {accessLog.map((a: any) => (
              <div key={a.id} className="text-xs border-b border-line last:border-0 pb-2 last:pb-0">
                <div className="text-ink">{a.action}</div>
                <div className="text-slate">{a.user_name} ({a.user_role})</div>
                <div className="text-slate-light font-mono">{new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
