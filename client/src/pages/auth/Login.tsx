import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { SealMark } from '../../components/layout/AppLayout';
import { ApiError } from '../../api/client';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { role: 'Super Administrator', email: 'admin@zacc.gov.zw' },
  { role: 'Prevention Head', email: 'prevention.head@zacc.gov.zw' },
  { role: 'Compliance Officer', email: 'officer1@zacc.gov.zw' },
  { role: 'Systems Reviewer', email: 'reviewer1@zacc.gov.zw' },
  { role: 'Monitoring Officer', email: 'monitoring1@zacc.gov.zw' },
  { role: 'Institution Focal Person', email: 'focal.1@institution-demo.zw' },
  { role: 'Integrity Committee Chair', email: 'committee.chair.1@institution-demo.zw' },
  { role: 'Auditor', email: 'auditor@zacc.gov.zw' },
  { role: 'Investigations Officer', email: 'investigations@zacc.gov.zw' },
];
const DEMO_PASSWORD = 'ZaccDemo#2026';

type Stage = 'credentials' | 'mfa-setup' | 'mfa-challenge';

export default function Login() {
  const { login, verifyMfaSetup, verifyMfaChallenge } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [manualEntryKey, setManualEntryKey] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDemoList, setShowDemoList] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await login(email, password);
      setTempToken(result.tempToken);
      if (result.kind === 'setup') {
        setQrCodeDataUrl(result.qrCodeDataUrl);
        setManualEntryKey(result.manualEntryKey);
        setStage('mfa-setup');
      } else {
        setStage('mfa-challenge');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleMfaSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyMfaSetup(tempToken, code);
      navigate('/app/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleMfaChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyMfaChallenge(tempToken, code);
      navigate('/app/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <SealMark size={34} />
          <div className="text-parchment leading-tight">
            <div className="font-display font-semibold">ZACC Compliance Portal</div>
            <div className="text-[10px] uppercase tracking-wider text-gold-light">Secure Staff & Institution Sign-In</div>
          </div>
        </div>

        <div className="card p-7 shadow-raised">
          {stage === 'credentials' && (
            <>
              <h1 className="font-display text-xl font-semibold text-ink mb-1">Sign in</h1>
              <p className="text-sm text-slate mb-5">Use your registered ZACC or institution email.</p>
              <form onSubmit={handleCredentials} className="space-y-4">
                <div>
                  <label className="label">Email address</label>
                  <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@zacc.gov.zw" />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
                </div>
                {error && <div className="text-sm text-status-red bg-status-red-bg rounded px-3 py-2">{error}</div>}
                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy ? 'Checking…' : 'Continue'}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-line">
                <button onClick={() => setShowDemoList((s) => !s)} className="text-xs text-gold-dark hover:underline">
                  {showDemoList ? 'Hide demo accounts' : 'Use a demo account →'}
                </button>
                {showDemoList && (
                  <div className="mt-3 grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.email}
                        onClick={() => {
                          setEmail(acc.email);
                          setPassword(DEMO_PASSWORD);
                        }}
                        className="text-left text-xs px-3 py-2 rounded border border-line hover:border-gold hover:bg-gold/5 transition-colors"
                      >
                        <div className="font-medium text-ink">{acc.role}</div>
                        <div className="text-slate font-mono">{acc.email}</div>
                      </button>
                    ))}
                    <div className="text-[11px] text-slate-light mt-1">Shared demo password: <span className="font-mono">{DEMO_PASSWORD}</span></div>
                  </div>
                )}
              </div>
            </>
          )}

          {stage === 'mfa-setup' && (
            <>
              <button onClick={() => setStage('credentials')} className="text-xs text-slate hover:text-ink flex items-center gap-1 mb-3">
                <ArrowLeft size={13} /> Back
              </button>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={18} className="text-gold" />
                <h1 className="font-display text-xl font-semibold text-ink">Set up two-factor authentication</h1>
              </div>
              <p className="text-sm text-slate mb-4">
                First sign-in requires enrolling an authenticator app (Google Authenticator, Authy, etc.). Scan the QR code below.
              </p>
              {qrCodeDataUrl && (
                <div className="flex justify-center bg-white p-3 rounded border border-line mb-3">
                  <img src={qrCodeDataUrl} alt="MFA QR code" width={180} height={180} />
                </div>
              )}
              <div className="text-xs text-slate mb-4 text-center">
                Can't scan? Enter this key manually: <span className="font-mono text-ink block mt-1 break-all">{manualEntryKey}</span>
              </div>
              <form onSubmit={handleMfaSetup} className="space-y-4">
                <div>
                  <label className="label">6-digit code from your app</label>
                  <input
                    className="input text-center text-lg tracking-[0.3em] font-mono"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                  />
                </div>
                {error && <div className="text-sm text-status-red bg-status-red-bg rounded px-3 py-2">{error}</div>}
                <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full">
                  {busy ? 'Verifying…' : 'Verify & Enable'}
                </button>
              </form>
            </>
          )}

          {stage === 'mfa-challenge' && (
            <>
              <button onClick={() => setStage('credentials')} className="text-xs text-slate hover:text-ink flex items-center gap-1 mb-3">
                <ArrowLeft size={13} /> Back
              </button>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={18} className="text-gold" />
                <h1 className="font-display text-xl font-semibold text-ink">Enter your authenticator code</h1>
              </div>
              <p className="text-sm text-slate mb-4">Open your authenticator app and enter the current 6-digit code.</p>
              <form onSubmit={handleMfaChallenge} className="space-y-4">
                <input
                  className="input text-center text-lg tracking-[0.3em] font-mono"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                />
                {error && <div className="text-sm text-status-red bg-status-red-bg rounded px-3 py-2">{error}</div>}
                <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full">
                  {busy ? 'Verifying…' : 'Sign In'}
                </button>
              </form>
            </>
          )}
        </div>
        <div className="text-center mt-5">
          <Link to="/" className="text-parchment/60 hover:text-parchment text-xs">← Back to public site</Link>
        </div>
      </div>
    </div>
  );
}
