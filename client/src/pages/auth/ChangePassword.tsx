import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SealMark } from '../../components/layout/AppLayout';

export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = next.length >= 10 && /[a-z]/.test(next) && /[A-Z]/.test(next) && /\d/.test(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== again) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      await changePassword(cur, next);
      navigate('/app/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center p-4">
      <main className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8"><SealMark size={34} /><div className="text-parchment font-display font-semibold">ZACC Compliance Portal</div></div>
        <div className="card p-7 shadow-raised">
          <div className="flex items-center gap-2 mb-1"><KeyRound size={18} className="text-gold" aria-hidden /><h1 className="font-display text-xl font-semibold text-ink">Choose a new password</h1></div>
          <p className="text-sm text-slate mb-5">{user?.name}, you are using a temporary password. Set your own before continuing.</p>
          <form onSubmit={submit} className="space-y-4">
            <div><label className="label" htmlFor="cp-cur">Temporary password</label><input id="cp-cur" className="input" type="password" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
            <div><label className="label" htmlFor="cp-new">New password</label><input id="cp-new" className="input" type="password" required autoComplete="new-password" aria-describedby="cp-rules" value={next} onChange={(e) => setNext(e.target.value)} />
              <p id="cp-rules" className={`text-xs mt-1 ${valid || !next ? 'text-slate' : 'text-status-red'}`}>At least 10 characters with upper-case, lower-case and a digit.</p></div>
            <div><label className="label" htmlFor="cp-again">Repeat new password</label><input id="cp-again" className="input" type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></div>
            {error && <div role="alert" className="text-sm text-status-red bg-status-red-bg rounded px-3 py-2">{error}</div>}
            <button type="submit" disabled={busy || !valid} className="btn-primary w-full">{busy ? 'Saving…' : 'Save and continue'}</button>
          </form>
          <button onClick={() => logout().then(() => navigate('/login'))} className="mt-4 text-xs text-slate hover:text-ink">Sign out</button>
        </div>
      </main>
    </div>
  );
}
