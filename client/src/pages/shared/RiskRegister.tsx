import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, Card, RiskBadge, Modal, StatusBadge } from '../../components/common/UI';

function bandColor(category: string) {
  if (category === 'Critical') return '#7A2020';
  if (category === 'High') return '#B3402F';
  if (category === 'Medium') return '#C2680B';
  return '#2F7A4D';
}
function bandFor(score: number) {
  if (score >= 20) return 'Critical';
  if (score >= 13) return 'High';
  if (score >= 6) return 'Medium';
  return 'Low';
}

export default function RiskRegister() {
  const [risks, setRisks] = useState<any[]>([]);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/risk-register'), api.get('/risk-register/heatmap')]).then(([r, h]) => {
      setRisks(r);
      setHeatmap(h);
      setLoading(false);
    });
  };

  useEffect(load, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        eyebrow="Section 10.5"
        title="Corruption Risk Register"
        description="Likelihood × Impact scoring on a 1–25 scale across all institutions and sectors."
        actions={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={15} /> New Risk
          </button>
        }
      />

      <Card className="mb-6">
        <div className="text-xs uppercase tracking-wide text-slate mb-4">Risk Heat Map</div>
        <div className="flex gap-6 items-start overflow-x-auto">
          <div className="grid grid-cols-5 gap-1 shrink-0" style={{ gridTemplateRows: 'repeat(5, 1fr)' }}>
            {[5, 4, 3, 2, 1].map((impact) =>
              [1, 2, 3, 4, 5].map((likelihood) => {
                const cell = heatmap.find((c) => c.likelihood === likelihood && c.impact === impact);
                return (
                  <div
                    key={`${likelihood}-${impact}`}
                    className="w-14 h-14 rounded flex flex-col items-center justify-center text-white text-xs font-mono relative group"
                    style={{ background: bandColor(bandFor(likelihood * impact)) }}
                    title={`Likelihood ${likelihood} × Impact ${impact} = ${likelihood * impact}`}
                  >
                    <span className="font-semibold">{likelihood * impact}</span>
                    {cell && cell.count > 0 && <span className="absolute -top-1.5 -right-1.5 bg-ink text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{cell.count}</span>}
                  </div>
                );
              })
            )}
          </div>
          <div className="text-xs text-slate space-y-1.5 pt-1">
            <div>Y-axis (top→bottom): Impact 5→1</div>
            <div>X-axis (left→right): Likelihood 1→5</div>
            <div className="flex items-center gap-1.5 pt-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#2F7A4D' }} /> Low (1–5)</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#C2680B' }} /> Medium (6–12)</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#B3402F' }} /> High (13–19)</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#7A2020' }} /> Critical (20–25)</div>
          </div>
        </div>
      </Card>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-parchment text-xs uppercase tracking-wide text-slate">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Risk</th>
              <th className="text-left px-4 py-3 font-medium">Institution</th>
              <th className="text-left px-4 py-3 font-medium">Category</th>
              <th className="text-left px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Treatment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {risks.map((r) => (
              <tr key={r.id} className="hover:bg-parchment/60 cursor-pointer" onClick={() => setSelectedRisk(r)}>
                <td className="px-4 py-3 text-ink font-medium">{r.name}</td>
                <td className="px-4 py-3 text-slate">{r.institution_name || '—'}</td>
                <td className="px-4 py-3 text-slate">{r.category}</td>
                <td className="px-4 py-3">
                  <span className="font-mono mr-2">{r.inherent_score}</span>
                  <RiskBadge category={r.category_band} />
                </td>
                <td className="px-4 py-3"><StatusBadge status={r.treatment_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewRiskModal open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
      {selectedRisk && <RiskDetailModal risk={selectedRisk} onClose={() => setSelectedRisk(null)} onUpdated={load} />}
    </div>
  );
}

function NewRiskModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [form, setForm] = useState({ institutionId: '', name: '', description: '', category: 'Procurement', likelihood: 3, impact: 3 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) api.get('/institutions?limit=200').then((r) => setInstitutions(r.results));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/risk-register', form);
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Register New Risk">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Risk name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label">Institution</label>
          <select className="input" value={form.institutionId} onChange={(e) => setForm({ ...form, institutionId: e.target.value })}>
            <option value="">Sector-wide / not institution-specific</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {['Procurement', 'Finance', 'HR', 'Governance', 'IT', 'Controls'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Likelihood (1–5)</label>
            <input type="range" min={1} max={5} className="w-full" value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: parseInt(e.target.value) })} />
            <div className="text-center font-mono text-sm">{form.likelihood}</div>
          </div>
          <div>
            <label className="label">Impact (1–5)</label>
            <input type="range" min={1} max={5} className="w-full" value={form.impact} onChange={(e) => setForm({ ...form, impact: parseInt(e.target.value) })} />
            <div className="text-center font-mono text-sm">{form.impact}</div>
          </div>
        </div>
        <div className="text-center text-sm text-slate">
          Inherent score: <span className="font-mono font-semibold text-ink">{form.likelihood * form.impact}</span> ({bandFor(form.likelihood * form.impact)})
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Add to Register'}</button>
      </form>
    </Modal>
  );
}

function RiskDetailModal({ risk, onClose, onUpdated }: { risk: any; onClose: () => void; onUpdated: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [mitigation, setMitigation] = useState({ description: '', effectiveness: 'Medium' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/risk-register/${risk.id}`).then(setDetail);
  }, [risk.id]);

  const addMitigation = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/risk-register/${risk.id}/mitigations`, mitigation);
      const updated = await api.get(`/risk-register/${risk.id}`);
      setDetail(updated);
      onUpdated();
      setMitigation({ description: '', effectiveness: 'Medium' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={risk.name} wide>
      <div className="mb-4">
        <p className="text-sm text-slate mb-3">{risk.description || 'No description provided.'}</p>
        <div className="flex items-center gap-4 text-sm">
          <span>Inherent score: <strong className="font-mono">{risk.inherent_score}</strong></span>
          <RiskBadge category={risk.category_band} />
          <StatusBadge status={risk.treatment_status} />
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <div className="text-xs uppercase tracking-wide text-slate mb-2">Mitigations & Residual Risk</div>
        {detail?.mitigations?.length > 0 ? (
          <div className="space-y-2 mb-4">
            {detail.mitigations.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-sm border border-line rounded px-3 py-2">
                <div>
                  <div className="text-ink">{m.description}</div>
                  <div className="text-xs text-slate">Effectiveness: {m.effectiveness}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate">Residual</div>
                  <div className="font-mono font-semibold">{m.residual_score}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate mb-4">No mitigations recorded yet.</div>
        )}

        <form onSubmit={addMitigation} className="space-y-2 bg-parchment/60 rounded p-3">
          <input className="input" placeholder="Describe the mitigation control…" required value={mitigation.description} onChange={(e) => setMitigation({ ...mitigation, description: e.target.value })} />
          <div className="flex gap-2">
            <select className="input" value={mitigation.effectiveness} onChange={(e) => setMitigation({ ...mitigation, effectiveness: e.target.value })}>
              {['Low', 'Medium', 'High'].map((e) => <option key={e}>{e}</option>)}
            </select>
            <button type="submit" disabled={busy} className="btn-primary shrink-0">{busy ? 'Saving…' : 'Add Mitigation'}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
