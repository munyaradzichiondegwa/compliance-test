import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { PageHeader, KpiCard, LoadingSpinner, Card, StatusBadge } from '../../components/common/UI';
import ComplianceRing from '../../components/common/ComplianceRing';

export default function Dashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [aud01, setAud01] = useState<any>(null);
  const [aud02, setAud02] = useState<any[]>([]);
  const [aud06, setAud06] = useState<any[]>([]);
  const [myWork, setMyWork] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isAuditRole = user?.role === 'AUDITOR' || user?.role === 'SUPER_ADMIN' || user?.role === 'PREVENTION_HEAD';

  useEffect(() => {
    (async () => {
      const calls: Promise<any>[] = [api.get('/dashboard/overview')];
      if (isAuditRole) {
        calls.push(api.get('/dashboard/aud-01-overdue-recommendations'), api.get('/dashboard/aud-02-high-risk-institutions'), api.get('/dashboard/aud-06-implementation-rate'));
      } else {
        calls.push(Promise.resolve(null), Promise.resolve(null), Promise.resolve(null));
      }
      if (user?.role === 'COMPLIANCE_OFFICER') calls.push(api.get('/assessments?mine=true'));
      else if (user?.role === 'SYSTEMS_REVIEWER') calls.push(api.get('/systems-reviews?mine=true'));
      else if (user?.role === 'MONITORING_OFFICER') calls.push(api.get('/recommendations?status=ResponseSubmitted'));
      else if (user?.role === 'INSTITUTION_FOCAL_PERSON') calls.push(api.get('/recommendations?mine=true'));
      else calls.push(Promise.resolve([]));

      const [ov, a01, a02, a06, work] = await Promise.all(calls);
      setOverview(ov);
      setAud01(a01);
      setAud02(a02 || []);
      setAud06(a06 || []);
      setMyWork(work || []);
      setLoading(false);
    })();
  }, [user?.role, isAuditRole]);

  if (loading || !overview) return <LoadingSpinner />;

  const ragData = ['Green', 'Amber', 'Red'].map((k) => ({
    name: k,
    value: overview.ragDistribution.find((r: any) => r.rag_status === k)?.c || 0,
    color: k === 'Green' ? '#2F7A4D' : k === 'Amber' ? '#C2680B' : '#B3402F',
  }));

  return (
    <div>
      <PageHeader eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} title={`Welcome back, ${user?.name.split(' ')[0]}`} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Active Institutions" value={overview.activeInstitutions} />
        <KpiCard label="Assessments This Year" value={overview.assessmentsThisYear} />
        <KpiCard label="Open Recommendations" value={overview.openRecommendations} tone={overview.openRecommendations > 0 ? 'amber' : 'green'} />
        <KpiCard label="Overdue Recommendations" value={overview.overdueRecommendations} tone={overview.overdueRecommendations > 0 ? 'red' : 'green'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-1 flex flex-col items-center justify-center">
          <div className="text-xs uppercase tracking-wide text-slate mb-3 self-start">National Avg. Score</div>
          <ComplianceRing compositeScore={overview.avgComplianceScore} size={150} />
        </Card>
        <Card className="lg:col-span-2">
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Latest Assessment RAG Distribution</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={ragData} dataKey="value" nameKey="name" innerRadius={35} outerRadius={65} paddingAngle={3}>
                {ragData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {isAuditRole && aud01 && (
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <div className="text-xs uppercase tracking-wide text-slate mb-3">Overdue Recommendations — Aging</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={Object.entries(aud01.buckets).map(([k, v]) => ({ bucket: k, count: v }))}>
                <XAxis dataKey="bucket" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#B3402F" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-wide text-slate mb-3">High-Risk Institutions (score &gt; 19)</div>
            {aud02.length === 0 ? (
              <div className="text-sm text-slate py-8 text-center">No institutions currently exceed the high-risk threshold.</div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {aud02.map((i: any) => (
                  <Link key={i.id} to={`/app/institutions/${i.id}`} className="flex items-center justify-between text-sm px-3 py-2 rounded hover:bg-parchment">
                    <span>{i.name}</span>
                    <span className="font-mono text-status-red font-medium">{i.maxRiskScore}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {myWork.length > 0 && (
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">
            {user?.role === 'COMPLIANCE_OFFICER' && 'My Assessments'}
            {user?.role === 'SYSTEMS_REVIEWER' && 'My Systems Reviews'}
            {user?.role === 'MONITORING_OFFICER' && 'Awaiting Verification'}
            {user?.role === 'INSTITUTION_FOCAL_PERSON' && 'My Recommendations'}
          </div>
          <div className="divide-y divide-line">
            {myWork.slice(0, 6).map((item: any) => (
              <Link
                key={item.id}
                to={
                  user?.role === 'SYSTEMS_REVIEWER' ? `/app/systems-reviews/${item.id}` : user?.role === 'MONITORING_OFFICER' || user?.role === 'INSTITUTION_FOCAL_PERSON' ? `/app/recommendations/${item.id}` : `/app/assessments/${item.id}`
                }
                className="flex items-center justify-between py-2.5 text-sm hover:bg-parchment/50 -mx-2 px-2 rounded"
              >
                <span className="text-ink">{item.institution_name || item.title || item.description}</span>
                <StatusBadge status={item.status} />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
