import React, { useEffect, useState } from 'react';
import { FileSignature, Upload } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, Card, Modal } from '../../components/common/UI';

export default function Pledges() {
  const { user } = useAuth();
  const [pledges, setPledges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingPledge, setSigningPledge] = useState<any>(null);
  const [bulkPledge, setBulkPledge] = useState<any>(null);

  const load = () => api.get('/pledges').then((p) => { setPledges(p); setLoading(false); });
  useEffect(() => { load(); }, []);

  if (loading) return <LoadingSpinner />;

  const isExpiringSoon = (date: string) => {
    const days = (new Date(date).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  };
  const isExpired = (date: string) => new Date(date).getTime() < Date.now();

  return (
    <div>
      <PageHeader eyebrow="Section 10.1" title="Integrity Pledges" description="Digital signing with automatic expiry reminders and bulk-upload support for large institutions." />

      <div className="grid md:grid-cols-2 gap-4">
        {pledges.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between mb-2">
              <div className="font-display font-semibold text-ink">{p.title}</div>
              {p.expiry_date && (
                <span className={isExpired(p.expiry_date) ? 'badge-red' : isExpiringSoon(p.expiry_date) ? 'badge-amber' : 'badge-slate'}>
                  {isExpired(p.expiry_date) ? 'Expired' : `Expires ${new Date(p.expiry_date).toLocaleDateString()}`}
                </span>
              )}
            </div>
            <div className="text-xs text-slate mb-3">{p.institution_name || 'Multi-institution'} · {p.signatory_count} signatories</div>
            <p className="text-sm text-slate mb-4 line-clamp-2">{p.description}</p>
            <div className="flex gap-2">
              <button className="btn-primary text-xs flex-1" onClick={() => setSigningPledge(p)}>
                <FileSignature size={13} /> Sign
              </button>
              {user?.role === 'INTEGRITY_COMMITTEE_CHAIR' && (
                <button className="btn-outline text-xs flex-1" onClick={() => setBulkPledge(p)}>
                  <Upload size={13} /> Bulk Import
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {signingPledge && <SignModal pledge={signingPledge} onClose={() => setSigningPledge(null)} onSigned={load} />}
      {bulkPledge && <BulkModal pledge={bulkPledge} onClose={() => setBulkPledge(null)} onDone={load} />}
    </div>
  );
}

function SignModal({ pledge, onClose, onSigned }: { pledge: any; onClose: () => void; onSigned: () => void }) {
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/pledges/${pledge.id}/sign`, { name, position, signatureText: signature });
      setDone(true);
      onSigned();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Sign: ${pledge.title}`}>
      {done ? (
        <div className="text-center py-4">
          <div className="text-status-green font-medium mb-3">Pledge signed successfully.</div>
          <button className="btn-primary w-full" onClick={onClose}>Close</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate bg-parchment/60 rounded p-3">{pledge.description}</p>
          <div>
            <label className="label">Full Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Position</label>
            <input className="input" required value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div>
            <label className="label">Type your full name to sign</label>
            <input className="input font-mono" required value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={name || 'Your full name'} />
          </div>
          <button type="submit" disabled={busy} className="btn-gold w-full">{busy ? 'Signing…' : 'Sign Pledge'}</button>
        </form>
      )}
    </Modal>
  );
}

function BulkModal({ pledge, onClose, onDone }: { pledge: any; onClose: () => void; onDone: () => void }) {
  const [csvText, setCsvText] = useState('Name,Position\nJohn Doe,Finance Officer\nJane Smith,Procurement Officer');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const lines = csvText.trim().split('\n').slice(1); // skip header
      const rows = lines.map((line) => {
        const [name, position] = line.split(',');
        return { name: name?.trim(), position: position?.trim() };
      }).filter((r) => r.name);
      const res = await api.post(`/pledges/${pledge.id}/bulk-upload`, { rows });
      setResult(res);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Bulk Import: ${pledge.title}`} wide>
      {result ? (
        <div className="text-center py-4">
          <div className="text-status-green font-medium mb-1">Imported {result.imported} signatories.</div>
          <div className="text-xs text-slate font-mono mb-3">Batch ID: {result.batchId}</div>
          <button className="btn-primary w-full" onClick={onClose}>Close</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="label">Paste CSV (Name,Position — one per line)</label>
          <textarea className="input font-mono text-xs min-h-[160px]" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Importing…' : 'Import Signatories'}</button>
        </form>
      )}
    </Modal>
  );
}
