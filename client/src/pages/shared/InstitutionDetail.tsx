import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Download, MapPin, Building2 } from 'lucide-react';
import { api, downloadBlob } from '../../api/client';
import { PageHeader, LoadingSpinner, LoadError, Card, RagBadge, RiskBadge } from '../../components/common/UI';
import ComplianceRing from '../../components/common/ComplianceRing';

export default function InstitutionDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api.get(`/institutions/${id}/summary`).then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  }, [id]);

  const downloadScorecard = async () => {
    setDownloading(true);
    try {
      const blob = await api.blob(`/reports/scorecard/${id}`);
      downloadBlob(blob, `Scorecard_${data.institution.name.replace(/\s+/g, '_')}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error || !data) return <LoadError message="This institution couldn't be found." />;
  const { institution, latestAssessment, openRecommendations, closedRecommendations, openRisks, committee, assessmentHistory } = data;

  const chartData = assessmentHistory.map((a: any) => ({ date: new Date(a.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), score: a.composite_score }));

  return (
    <div>
      <PageHeader
        eyebrow={institution.type}
        title={institution.name}
        description={`${institution.sector} · ${institution.district}, ${institution.province}`}
        actions={
          <button className="btn-outline" onClick={downloadScorecard} disabled={downloading}>
            <Download size={15} /> {downloading ? 'Generating…' : 'Download Scorecard'}
          </button>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="flex flex-col items-center">
          <ComplianceRing compositeScore={latestAssessment?.composite_score ?? null} size={140} />
          <div className="mt-2"><RagBadge status={latestAssessment?.rag_status ?? null} /></div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Score History</div>
          {chartData.length < 2 ? (
            <div className="text-sm text-slate py-10 text-center">Not enough assessment history yet to chart a trend.</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E0D3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#D9A62E" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate">Registration No.</div>
          <div className="font-mono text-sm mt-1">{institution.registration_no || '—'}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate">Recommendations</div>
          <div className="text-sm mt-1">{openRecommendations} open · {closedRecommendations} closed</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate">Ownership</div>
          <div className="text-sm mt-1">{institution.ownership}</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Open Corruption Risks</div>
          {openRisks.length === 0 ? (
            <div className="text-sm text-slate py-6 text-center">No open risks recorded for this institution.</div>
          ) : (
            <div className="space-y-2">
              {openRisks.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-2 last:pb-0">
                  <div>
                    <div className="text-ink">{r.name}</div>
                    <div className="text-xs text-slate">{r.category}</div>
                  </div>
                  <RiskBadge category={r.inherent_score >= 20 ? 'Critical' : r.inherent_score >= 13 ? 'High' : r.inherent_score >= 6 ? 'Medium' : 'Low'} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Integrity Committee</div>
          {committee ? (
            <Link to={`/app/committees/${committee.id}`} className="flex items-center gap-3 text-sm hover:bg-parchment/60 -mx-2 px-2 py-2 rounded">
              <Building2 size={16} className="text-gold" />
              <div>
                <div className="text-ink font-medium">Active committee established</div>
                <div className="text-xs text-slate">Formed {committee.formed_date ? new Date(committee.formed_date).toLocaleDateString() : '—'}</div>
              </div>
            </Link>
          ) : (
            <div className="text-sm text-slate py-6 text-center">No Integrity Committee registered yet.</div>
          )}
          <div className="flex items-center gap-2 text-xs text-slate mt-4 pt-4 border-t border-line">
            <MapPin size={13} />
            {institution.latitude?.toFixed(3)}, {institution.longitude?.toFixed(3)}
          </div>
        </Card>
      </div>
    </div>
  );
}
