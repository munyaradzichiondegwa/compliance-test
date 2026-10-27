import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';

export function useInstitutions() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api.get('/institutions?limit=200').then((r) => setList(r.results || [])).catch(() => {}); }, []);
  return list;
}
export function useLoad<T = any>(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = () => { if (!path) return; setLoading(true); setError(''); api.get(path).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(reload, [path, ...deps]);
  return { data, error, loading, reload };
}
export const Flag = ({ children }: { children: React.ReactNode }) => <span className="badge-red mr-1">{children}</span>;
export const FLAG_LABELS: Record<string, string> = {
  AcquittalOverdue: 'Acquittal overdue', LegacyDebtHigh: 'Legacy debt > 40%', Overspent: 'Overspent', AcquittedWithVariance: 'Acquitted with variance',
  ReportedAheadOfVerified: 'Reported ahead of verified', SpendAheadOfProgress: 'Spend ahead of progress', PastEndDate: 'Past end date',
};
export const usd = (n: any) => (n == null ? '—' : `USD ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
export function DataTable({ caption, heads, children }: { caption: string; heads: string[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">{caption}</caption>
      <thead className="bg-parchment text-xs uppercase tracking-wide text-slate"><tr>{heads.map((h) => <th scope="col" key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{children}</tbody></table></div>
  );
}
