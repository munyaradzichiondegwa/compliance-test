import React, { useState } from 'react';
import { Search as SearchIcon, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, EmptyState } from '../../components/common/UI';

const ENTITY_LABELS: Record<string, string> = {
  systems_review_finding: 'Systems Review Finding',
  assessment: 'Compliance Assessment',
  recommendation: 'Recommendation',
  corruption_risk: 'Corruption Risk',
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.get(`/ai/search?q=${encodeURIComponent(query)}`);
      setResults(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="AI-05 · Section 10.6" title="Search" description="Plain-English search across findings, assessments, recommendations and the risk register." />

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <SearchIcon size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-light" />
          <input
            className="input pl-11 py-3 text-base"
            placeholder="e.g. segregation of duties in procurement…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </form>

      {loading ? (
        <LoadingSpinner label="Searching…" />
      ) : searched && results.length === 0 ? (
        <EmptyState title="No matches" description="Try different or broader terms." />
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles size={13} className="text-gold" />
                <span className="text-xs uppercase tracking-wide text-slate">{ENTITY_LABELS[r.entityType] || r.entityType}</span>
                <span className="text-[10px] font-mono text-slate-light ml-auto">relevance {r.score}</span>
              </div>
              <div className="font-medium text-ink text-sm mb-1">{r.title}</div>
              <div className="text-sm text-slate">{r.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
