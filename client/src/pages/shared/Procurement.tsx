import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, Plus } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, Modal } from '../../components/common/UI';

export default function Procurement() {
  const [records, setRecords] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/procurement${flaggedOnly ? '?flaggedOnly=true' : ''}`).then((r) => {
      setRecords(r);
      setLoading(false);
    });
  };

  useEffect(load, [flaggedOnly]);
  useEffect(() => {
    api.get('/institutions?limit=200').then((r) => setInstitutions(r.results));
  }, []);

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/procurement/egp-sync');
      alert(`PRAZ eGP sync complete: ${res.imported} records imported.`);
      load();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="PRAZ eGP Integration"
        title="Procurement Monitoring"
        description="Automated red-flag detection on every procurement award: single-sourcing, split purchases, duplicate contracts, and supplier concentration."
        actions={
          <>
            <button className="btn-outline" onClick={runSync} disabled={syncing}>
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Run eGP Sync'}
            </button>
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={15} /> Add Record
            </button>
          </>
        }
      />

      <label className="flex items-center gap-2 text-sm mb-4">
        <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
        Show flagged records only
      </label>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-xs uppercase tracking-wide text-slate">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">Institution</th>
                <th className="text-left px-4 py-3 font-medium">Supplier</th>
                <th className="text-left px-4 py-3 font-medium">Value</th>
                <th className="text-left px-4 py-3 font-medium">Method</th>
                <th className="text-left px-4 py-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {records.map((r) => (
                <tr key={r.id} className={r.red_flags.length > 0 ? 'bg-status-red-bg/40' : ''}>
                  <td className="px-4 py-3">{r.description}</td>
                  <td className="px-4 py-3 text-slate">{r.institution_name}</td>
                  <td className="px-4 py-3 text-slate">{r.supplier_name}</td>
                  <td className="px-4 py-3 font-mono">${r.value.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate">{r.method}</td>
                  <td className="px-4 py-3">
                    {r.red_flags.length > 0 ? (
                      <div className="group relative inline-block">
                        <span className="badge-red"><AlertTriangle size={11} /> {r.red_flags.length}</span>
                        <div className="hidden group-hover:block absolute z-10 left-0 top-full mt-1 w-72 bg-ink text-white text-xs rounded p-3 shadow-raised">
                          {r.red_flags.map((f: string, i: number) => <div key={i} className="mb-1 last:mb-0">• {f}</div>)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-light">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewProcurementModal open={showNew} onClose={() => setShowNew(false)} institutions={institutions} onCreated={load} />
    </div>
  );
}

function NewProcurementModal({ open, onClose, institutions, onCreated }: any) {
  const [form, setForm] = useState({ institutionId: '', description: '', value: '', method: 'OpenTender', supplierName: '', contractNumber: '', procurementDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/procurement', { ...form, value: parseFloat(form.value) });
      setResult(res.redFlags);
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { onClose(); setResult(null); }} title="Record Procurement Award">
      {result ? (
        <div>
          {result.length > 0 ? (
            <div className="bg-status-red-bg text-status-red rounded p-3 text-sm space-y-1 mb-4">
              <div className="font-medium">{result.length} red flag(s) detected:</div>
              {result.map((f, i) => <div key={i}>• {f}</div>)}
            </div>
          ) : (
            <div className="bg-status-green-bg text-status-green rounded p-3 text-sm mb-4">No red flags detected for this record.</div>
          )}
          <button className="btn-primary w-full" onClick={() => { onClose(); setResult(null); }}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <select className="input" required value={form.institutionId} onChange={(e) => setForm({ ...form, institutionId: e.target.value })}>
            <option value="">Select institution…</option>
            {institutions.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input className="input" placeholder="Description" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" placeholder="Value (USD)" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {['OpenTender', 'RestrictedTender', 'RequestForQuotations', 'SingleSource', 'Framework'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <input className="input" placeholder="Supplier name" required value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
          <input className="input" placeholder="Contract number (optional)" value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
          <input className="input" type="date" required value={form.procurementDate} onChange={(e) => setForm({ ...form, procurementDate: e.target.value })} />
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Checking…' : 'Save & Run Red-Flag Check'}</button>
        </form>
      )}
    </Modal>
  );
}
