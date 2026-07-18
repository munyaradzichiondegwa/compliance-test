import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../api/client';
import { PageHeader, Card } from '../../components/common/UI';
import { ROLE_LABELS } from '../../types';
import { ShieldCheck, Bell } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ email: true, sms: true, in_app: true });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    api.get('/notifications/preferences').then(setPrefs);
  }, []);

  const togglePref = async (channel: string) => {
    const next = !prefs[channel];
    setPrefs((p) => ({ ...p, [channel]: next }));
    await api.put('/notifications/preferences', { channel, enabled: next });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', pwForm);
      setPwMsg('Password updated successfully.');
      setPwForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPwMsg(err instanceof ApiError ? err.message : 'Failed to update password.');
    } finally {
      setPwBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account, security, and notification preferences." />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Account</div>
          <dl className="space-y-2 text-sm mb-4">
            <div className="flex justify-between"><dt className="text-slate">Name</dt><dd>{user.name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate">Email</dt><dd className="font-mono text-xs">{user.email}</dd></div>
            <div className="flex justify-between"><dt className="text-slate">Role</dt><dd>{ROLE_LABELS[user.role]}</dd></div>
            <div className="flex justify-between items-center">
              <dt className="text-slate">Two-factor authentication</dt>
              <dd className="flex items-center gap-1 text-status-green"><ShieldCheck size={14} /> Enabled</dd>
            </div>
          </dl>

          <form onSubmit={changePassword} className="border-t border-line pt-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-slate">Change Password</div>
            <input className="input" type="password" placeholder="Current password" required value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
            <input className="input" type="password" placeholder="New password (min. 8 characters)" required minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} />
            {pwMsg && <div className={`text-xs rounded px-3 py-2 ${pwMsg.includes('success') ? 'bg-status-green-bg text-status-green' : 'bg-status-red-bg text-status-red'}`}>{pwMsg}</div>}
            <button type="submit" disabled={pwBusy} className="btn-outline w-full">{pwBusy ? 'Updating…' : 'Update Password'}</button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={15} className="text-brass" />
            <div className="text-xs uppercase tracking-wide text-slate">Notification Preferences</div>
          </div>
          <div className="space-y-3">
            {[
              ['in_app', 'In-App Notifications', 'Bell icon alerts within the Portal'],
              ['email', 'Email Notifications', 'Sent to your registered email address'],
              ['sms', 'SMS Notifications', 'Critical alerts only (escalations, red flags)'],
            ].map(([key, label, desc]) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                <div>
                  <div className="text-sm text-ink">{label}</div>
                  <div className="text-xs text-slate">{desc}</div>
                </div>
                <button
                  onClick={() => togglePref(key)}
                  className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${prefs[key] ? 'bg-brass' : 'bg-line'}`}
                  aria-label={`Toggle ${label}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow ${prefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
