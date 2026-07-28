import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { SealMark } from '../../components/layout/AppLayout';
import { StatusBadge } from '../../components/common/UI';
import { api, ApiError } from '../../api/client';

export default function WhistleblowerTrack() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await api.get(`/whistleblower/track/${encodeURIComponent(code.trim())}`, { skipAuth: true });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'No report found for that tracking code.' : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-line bg-paper">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center gap-3">
          <Link to="/" className="text-slate hover:text-ink"><ArrowLeft size={18} /></Link>
          <SealMark size={26} />
          <div className="font-display font-semibold text-sm">Track a Report</div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-14">
        <h1 className="font-display text-2xl font-semibold text-charcoal mb-2 text-center">Check your report status</h1>
        <p className="text-sm text-slate text-center mb-8">Enter the tracking code you received when you submitted your report.</p>

        <form onSubmit={handleSearch} className="card p-6">
          <label className="label">Tracking code</label>
          <div className="flex gap-2">
            <input className="input font-mono uppercase" placeholder="WB-XXXXXXXX" value={code} onChange={(e) => setCode(e.target.value)} required />
            <button type="submit" disabled={loading} className="btn-primary shrink-0">
              <Search size={15} /> {loading ? '…' : 'Check'}
            </button>
          </div>
          {error && <div className="text-sm text-status-red bg-status-red-bg rounded px-3 py-2 mt-4">{error}</div>}
        </form>

        {result && (
          <div className="card p-6 mt-4">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-sm text-charcoal">{result.trackingCode}</span>
              <StatusBadge status={result.status} />
            </div>
            <dl className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><dt className="text-slate">Category</dt><dd>{result.category}</dd></div>
              <div className="flex justify-between"><dt className="text-slate">Submitted</dt><dd>{new Date(result.submittedAt).toLocaleDateString()}</dd></div>
              <div className="flex justify-between"><dt className="text-slate">Last updated</dt><dd>{new Date(result.lastUpdated).toLocaleDateString()}</dd></div>
            </dl>
            {result.updates?.length > 0 && (
              <div className="border-t border-line pt-4">
                <div className="text-xs uppercase tracking-wide text-slate mb-2">Timeline</div>
                <div className="space-y-3">
                  {result.updates.map((u: any, i: number) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-gold mt-1.5 shrink-0" />
                      <div>
                        <div className="font-medium text-ink">{u.status}</div>
                        {u.note && <div className="text-xs text-slate mt-0.5">{u.note}</div>}
                        <div className="text-[10px] text-slate-light font-mono mt-0.5">{new Date(u.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
