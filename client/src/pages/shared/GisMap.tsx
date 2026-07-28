import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Route } from 'lucide-react';
import { api } from '../../api/client';
import ZimbabweMap from '../../components/common/ZimbabweMap';
import { PageHeader, LoadingSpinner, Card } from '../../components/common/UI';

function ragColor(rag: string | null) {
  if (rag === 'Green') return '#2F7A4D';
  if (rag === 'Amber') return '#C2680B';
  if (rag === 'Red') return '#B3402F';
  return '#D8D2C0';
}

export default function GisMap() {
  const [provinces, setProvinces] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClusters, setShowClusters] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/gis/provinces'), api.get('/gis/institutions')]).then(([p, i]) => {
      setProvinces(p);
      setInstitutions(i);
      setLoading(false);
    });
  }, []);

  const loadClusters = async () => {
    setShowClusters(true);
    const c = await api.get('/gis/clusters?k=5');
    setClusters(c);
  };

  if (loading) return <LoadingSpinner />;

  const filteredInstitutions = selected ? institutions.filter((i) => i.province === selected) : institutions;

  return (
    <div>
      <PageHeader
        eyebrow="Section 10.7"
        title="GIS Intelligence"
        description="Province-level compliance heat map, institution geotagging, and proximity clustering for site-visit route planning."
        actions={
          <button className="btn-outline" onClick={loadClusters}>
            <Route size={15} /> Plan Visit Clusters
          </button>
        }
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card>
          <ZimbabweMap
            data={provinces.map((p) => ({ province: p.province, color: ragColor(p.ragStatus), sublabel: String(p.institutionCount) }))}
            onSelect={(p) => setSelected(p === selected ? null : p)}
            selected={selected}
            size={560}
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-wide text-slate mb-3">
              {selected ? `Institutions — ${selected}` : 'All Institutions'} ({filteredInstitutions.length})
            </div>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {filteredInstitutions.map((i) => (
                <Link key={i.id} to={`/app/institutions/${i.id}`} className="flex items-center justify-between text-sm px-2 py-1.5 rounded hover:bg-parchment">
                  <span className="text-ink truncate">{i.name}</span>
                  <span className={i.risk_level === 'High' ? 'badge-red' : i.risk_level === 'Medium' ? 'badge-amber' : 'badge-green'}>{i.risk_level}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {showClusters && (
        <Card className="mt-6">
          <div className="text-xs uppercase tracking-wide text-slate mb-4">Suggested Site-Visit Clusters (nearest-neighbour route)</div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clusters.map((c) => (
              <div key={c.clusterId} className="border border-line rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display font-semibold text-charcoal">Cluster {c.clusterId + 1}</span>
                  <span className="text-xs font-mono text-slate">{c.totalRouteKm} km</span>
                </div>
                <ol className="text-xs text-slate space-y-1 list-decimal list-inside">
                  {c.suggestedRoute.map((r: any) => (
                    <li key={r.id} className="truncate">{r.name}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
