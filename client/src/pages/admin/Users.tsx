import React, { useEffect, useState } from 'react';
import { Plus, ShieldOff } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, Modal } from '../../components/common/UI';
import { ROLE_LABELS, Role } from '../../types';

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = () => {
    // No role filter → full listing (admin-only per backend rule)
    api.get('/users').then((u) => { setUsers(u); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const resetMfa = async (id: string) => {
    if (!confirm('Reset MFA for this user? They will be prompted to re-enrol on next login.')) return;
    await api.post(`/users/${id}/reset-mfa`);
    load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Manage staff accounts and role assignments across the Portal."
        actions={<button className="btn-primary" onClick={() => setShowNew(true)}><Plus size={15} /> New User</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-parchment text-xs uppercase tracking-wide text-slate">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">MFA</th>
              <th className="text-left px-4 py-3 font-medium">Last Login</th>
              <th className="text-left px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate">{u.email}</td>
                <td className="px-4 py-3 text-xs">{ROLE_LABELS[u.role as Role] || u.role}</td>
                <td className="px-4 py-3">{u.mfa_enabled ? <span className="badge-green">Enabled</span> : <span className="badge-slate">Not enrolled</span>}</td>
                <td className="px-4 py-3 text-xs font-mono text-slate">{u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
                <td className="px-4 py-3">
                  {u.mfa_enabled && (
                    <button onClick={() => resetMfa(u.id)} className="text-xs text-slate hover:text-status-red flex items-center gap-1">
                      <ShieldOff size={12} /> Reset MFA
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewUserModal open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
    </div>
  );
}

function NewUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'COMPLIANCE_OFFICER' as Role });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<any>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/users', form);
      setCreated(res);
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { onClose(); setCreated(null); }} title="Create User">
      {created ? (
        <div className="text-center py-2">
          <div className="text-status-green font-medium mb-2">User created.</div>
          <div className="text-xs text-slate mb-1">Temporary password:</div>
          <div className="font-mono bg-parchment rounded px-3 py-2 mb-4">{created.temporaryPassword}</div>
          <button className="btn-primary w-full" onClick={() => { onClose(); setCreated(null); }}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input className="input" placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Creating…' : 'Create User'}</button>
        </form>
      )}
    </Modal>
  );
}
