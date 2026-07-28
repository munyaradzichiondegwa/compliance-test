import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState, Modal } from '../../components/common/UI';
import { PROVINCES } from '../../types';

export default function Institutions() {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [province, setProvince] = useState('');
  const [risk, setRisk] = useState('');
  const [showNew, setShowNew] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '200' });
    if (search) params.set('search', search);
    if (province) params.set('province', province);
    if (risk) params.set('risk', risk);
    api.get(`/institutions?${params.toString()}`).then((res) => setInstitutions(res.results)).finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, province, risk]);

  return (
    <div>
      <PageHeader
        eyebrow="Institutional Registry"
        title="Institutions"
        description="Risk-based registry of all ministries, local authorities, state-owned enterprises and regulated private entities."
        actions={
          user?.role === 'SUPER_ADMIN' && (
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={15} /> New Institution
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-light" />
          <input className="input pl-9" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">All provinces</option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select className="input w-auto" value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="">All risk levels</option>
          <option value="High">High risk</option>
          <option value="Medium">Medium risk</option>
          <option value="Low">Low risk</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : institutions.length === 0 ? (
        <EmptyState title="No institutions match" description="Try adjusting your filters." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-parchment text-xs uppercase tracking-wide text-slate">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Institution</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Province</th>
                <th className="text-left px-4 py-3 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {institutions.map((inst) => (
                <tr key={inst.id} className="hover:bg-parchment/60">
                  <td className="px-4 py-3">
                    <Link to={`/app/institutions/${inst.id}`} className="text-charcoal font-medium hover:underline">{inst.name}</Link>
                    <div className="text-xs text-slate">{inst.sector}</div>
                  </td>
                  <td className="px-4 py-3 text-slate">{inst.type}</td>
                  <td className="px-4 py-3 text-slate">{inst.province}</td>
                  <td className="px-4 py-3">
                    <span className={inst.risk_level === 'High' ? 'badge-red' : inst.risk_level === 'Medium' ? 'badge-amber' : 'badge-green'}>{inst.risk_level}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewInstitutionModal open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
    </div>
  );
}

function NewInstitutionModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', type: 'Ministry', sector: '', ownership: 'Public', province: 'Harare', district: '', riskLevel: 'Medium' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/institutions', form);
      onCreated();
      onClose();
      setForm({ name: '', type: 'Ministry', sector: '', ownership: 'Public', province: 'Harare', district: '', riskLevel: 'Medium' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Register New Institution">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {['Ministry', 'Local Authority', 'State-Owned Enterprise', 'Private Entity', 'Parastatal'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ownership</label>
            <select className="input" value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })}>
              {['Public', 'Private', 'Parastatal'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Sector</label>
          <input className="input" required value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Province</label>
            <select className="input" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}>
              {PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">District</label>
            <input className="input" required value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Initial Risk Classification</label>
          <select className="input" value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })}>
            {['Low', 'Medium', 'High'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full mt-2">{busy ? 'Creating…' : 'Register Institution'}</button>
      </form>
    </Modal>
  );
}
