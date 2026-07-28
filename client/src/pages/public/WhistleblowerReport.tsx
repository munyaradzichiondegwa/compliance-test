import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, ShieldCheck, Copy, CheckCircle2 } from 'lucide-react';
import { SealMark } from '../../components/layout/AppLayout';
import { api } from '../../api/client';

const CATEGORIES = ['Procurement', 'Financial Mismanagement', 'Abuse of Office', 'Nepotism', 'Bribery/Solicitation', 'Other'];

// --- Web Crypto helpers -----------------------------------------------------
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function encryptReport(publicKeyPem: string, plaintext: string) {
  const publicKey = await crypto.subtle.importKey('spki', pemToArrayBuffer(publicKeyPem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);
  return {
    payload: bufToBase64(ciphertext),
    iv: bufToBase64(iv.buffer),
    encryptedKey: bufToBase64(wrappedKey),
  };
}
// -----------------------------------------------------------------------------

export default function WhistleblowerReport() {
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [category, setCategory] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [institutionFreetext, setInstitutionFreetext] = useState('');
  const [narrative, setNarrative] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/institutions?limit=200', { skipAuth: true }).then((res) => setInstitutions(res.results)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!category || narrative.trim().length < 20) {
      setError('Please select a category and describe the concern in at least 20 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { publicKeyPem } = await api.get('/whistleblower/public-key', { skipAuth: true });
      const encrypted = await encryptReport(publicKeyPem, narrative.trim());
      const res = await api.post(
        '/whistleblower/submit',
        { category, institutionId: institutionId || undefined, institutionFreetext: institutionFreetext || undefined, ...encrypted },
        { skipAuth: true }
      );
      setTrackingCode(res.trackingCode);
    } catch (err) {
      setError('Something went wrong submitting your report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (trackingCode) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <CheckCircle2 size={40} className="text-status-green mx-auto mb-4" />
          <h1 className="font-display text-xl font-semibold text-ink mb-2">Report received</h1>
          <p className="text-sm text-slate mb-5">
            Your report has been encrypted and delivered to the Investigations team. Save this
            tracking code now — <strong>it cannot be recovered if lost</strong>, and it's the only way to check your report's status.
          </p>
          <div className="bg-parchment border border-line rounded-lg p-4 flex items-center justify-between gap-3 mb-5">
            <span className="font-mono text-lg tracking-wider text-charcoal">{trackingCode}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(trackingCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="btn-outline text-xs px-2 py-1"
            >
              <Copy size={13} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <Link to="/whistleblower/track" className="btn-primary w-full mb-2">Check report status</Link>
          <Link to="/" className="btn-ghost w-full">Return to homepage</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-line bg-paper">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center gap-3">
          <Link to="/" className="text-slate hover:text-ink"><ArrowLeft size={18} /></Link>
          <SealMark size={26} />
          <div className="font-display font-semibold text-sm">Report a Concern</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <div className="card p-4 mb-6 flex items-start gap-3 bg-charcoal text-parchment border-none">
          <Lock size={18} className="text-gold-light shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <strong className="text-gold-light">This report is encrypted in your browser before it is sent.</strong> We
            do not collect your name, email, IP address or any identifying information. Your report can
            only be decrypted by ZACC's Investigations team.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div>
            <label className="label">Category of concern *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`text-xs px-3 py-2 rounded border transition-colors text-left ${category === c ? 'border-gold bg-gold/10 text-gold-dark font-medium' : 'border-line hover:border-gold/50'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Institution (optional)</label>
            <select className="input" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
              <option value="">Select if known, or describe below…</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Or describe the institution/location (optional)</label>
            <input className="input" value={institutionFreetext} onChange={(e) => setInstitutionFreetext(e.target.value)} placeholder="e.g. a district office, a specific project site…" />
          </div>

          <div>
            <label className="label">What would you like to report? *</label>
            <textarea
              className="input min-h-[160px] resize-y"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Please describe what you observed, when, and any details that could help an investigation. Avoid including your own name or contact details."
              required
            />
            <div className="text-xs text-slate-light mt-1 text-right font-mono">{narrative.length} characters</div>
          </div>

          {error && <div className="text-sm text-status-red bg-status-red-bg rounded px-3 py-2">{error}</div>}

          <button type="submit" disabled={submitting} className="btn-gold w-full">
            <ShieldCheck size={16} /> {submitting ? 'Encrypting & submitting…' : 'Encrypt & Submit Report'}
          </button>
        </form>
      </main>
    </div>
  );
}
