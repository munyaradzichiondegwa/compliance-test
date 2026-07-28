import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ZimbabweMap from '../../components/common/ZimbabweMap';
import { SealMark } from '../../components/layout/AppLayout';
import { api } from '../../api/client';
import { LoadingSpinner } from '../../components/common/UI';

interface ProvinceAgg {
  province: string;
  institutionCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  avgComplianceScore: number | null;
  ragStatus: 'Red' | 'Amber' | 'Green' | null;
}

function ragColor(rag: string | null): string {
  if (rag === 'Green') return '#2F7A4D';
  if (rag === 'Amber') return '#C2680B';
  if (rag === 'Red') return '#B3402F';
  return '#D8D2C0';
}

export default function PublicDashboard() {
  const [provinces, setProvinces] = useState<ProvinceAgg[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/gis/provinces', { skipAuth: true })
      .then(setProvinces)
      .finally(() => setLoading(false));
  }, []);

  const selectedData = provinces.find((p) => p.province === selected);
  const totalInstitutions = provinces.reduce((s, p) => s + p.institutionCount, 0);
  const totalHigh = provinces.reduce((s, p) => s + p.highRiskCount, 0);

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-line bg-paper">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
          <Link to="/" className="text-slate hover:text-ink"><ArrowLeft size={18} /></Link>
          <SealMark size={26} />
          <div className="font-display font-semibold text-sm">Public Compliance Dashboard</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-10">
        <div className="eyebrow mb-2">National Overview</div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-charcoal mb-2">Institutional compliance, by province</h1>
        <p className="text-sm text-slate max-w-2xl mb-8">
          Aggregate, anonymised compliance status across all registered institutions. Individual
          assessment findings and institution-level detail are reserved for authorised ZACC staff.
        </p>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <div className="grid lg:grid-cols-[1fr_320px] gap-8">
            <div className="card p-6">
              <ZimbabweMap
                data={provinces.map((p) => ({ province: p.province, color: ragColor(p.ragStatus), sublabel: p.avgComplianceScore !== null ? Math.round(p.avgComplianceScore).toString() : undefined }))}
                onSelect={setSelected}
                selected={selected}
              />
              <div className="flex items-center gap-4 mt-4 text-xs text-slate">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#2F7A4D' }} /> Green (75+)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#C2680B' }} /> Amber (50–74)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#B3402F' }} /> Red (&lt;50)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#D8D2C0' }} /> No data</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <div className="text-xs uppercase tracking-wide text-slate">Institutions Tracked</div>
                <div className="text-3xl font-display font-semibold text-charcoal mt-1">{totalInstitutions}</div>
              </div>
              <div className="card p-5">
                <div className="text-xs uppercase tracking-wide text-slate">High-Risk Classified</div>
                <div className="text-3xl font-display font-semibold text-status-red mt-1">{totalHigh}</div>
              </div>
              {selectedData ? (
                <div className="card p-5">
                  <div className="font-display font-semibold text-ink mb-3">{selectedData.province}</div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-slate">Institutions</dt><dd className="font-mono">{selectedData.institutionCount}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate">Avg. score</dt><dd className="font-mono">{selectedData.avgComplianceScore !== null ? selectedData.avgComplianceScore.toFixed(1) : '—'}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate">High risk</dt><dd className="font-mono text-status-red">{selectedData.highRiskCount}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate">Medium risk</dt><dd className="font-mono text-status-amber">{selectedData.mediumRiskCount}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate">Low risk</dt><dd className="font-mono text-status-green">{selectedData.lowRiskCount}</dd></div>
                  </dl>
                </div>
              ) : (
                <div className="card p-5 text-sm text-slate">Select a province on the map to see its breakdown.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
