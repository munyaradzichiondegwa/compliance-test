import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ClipboardCheck, FileSearch, ListChecks, Siren, FileSignature, Landmark, Map, ArrowRight, Lock } from 'lucide-react';
import ComplianceRing from '../../components/common/ComplianceRing';
import { SealMark } from '../../components/layout/AppLayout';
import { api } from '../../api/client';

interface ProvinceAgg {
  province: string;
  institutionCount: number;
  avgComplianceScore: number | null;
  ragStatus: string | null;
}

export default function Landing() {
  const [provinces, setProvinces] = useState<ProvinceAgg[]>([]);
  const [animScore, setAnimScore] = useState(0);

  useEffect(() => {
    api.get('/gis/provinces', { skipAuth: true }).then(setProvinces).catch(() => {});
  }, []);

  const totalInstitutions = provinces.reduce((s, p) => s + p.institutionCount, 0);
  const scored = provinces.filter((p) => p.avgComplianceScore !== null);
  const nationalAvg = scored.length ? scored.reduce((s, p) => s + (p.avgComplianceScore || 0), 0) / scored.length : null;

  useEffect(() => {
    if (nationalAvg === null) return;
    let raf: number;
    const start = performance.now();
    const animate = (t: number) => {
      const progress = Math.min(1, (t - start) / 900);
      setAnimScore(nationalAvg * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [nationalAvg]);

  return (
    <div className="min-h-screen bg-parchment text-ink">
      {/* Header */}
      <header className="border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
          <SealMark size={30} />
          <div className="leading-tight">
            <div className="font-display font-semibold text-sm">ZACC Compliance Portal</div>
            <div className="text-[10px] uppercase tracking-wider text-brass-dark">Institutional Integrity, Made Visible</div>
          </div>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link to="/public-dashboard" className="btn-ghost text-sm px-3">Public Dashboard</Link>
            <Link to="/whistleblower/report" className="btn-ghost text-sm px-3 hidden sm:inline-flex">Report a Concern</Link>
            <Link to="/login" className="btn-primary text-sm">Sign In</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 pt-14 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="eyebrow mb-4">Zimbabwe Anti-Corruption Commission</div>
          <h1 className="font-display text-4xl md:text-5xl font-semibold leading-[1.08] text-navy">
            One weighted score.<br />Five categories.<br />Zero ambiguity.
          </h1>
          <p className="mt-5 text-slate text-base leading-relaxed max-w-lg">
            Every public institution in Zimbabwe is assessed against the same five weighted
            categories — Governance, Internal Controls, Procurement, Financial Management and
            Integrity — producing one composite score and a Red, Amber or Green rating that
            supervisors, auditors and the public can all read the same way.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/whistleblower/report" className="btn-brass">
              <Siren size={16} /> Report a Concern Anonymously
            </Link>
            <Link to="/public-dashboard" className="btn-outline">
              View Public Dashboard <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-8 flex items-center gap-2 text-xs text-slate">
            <Lock size={13} /> Whistleblower reports are encrypted in your browser before they ever reach our servers.
          </div>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div className="card p-8 shadow-raised">
            <ComplianceRing compositeScore={nationalAvg !== null ? animScore : null} size={220} showLegend />
            <div className="text-center mt-4">
              <div className="text-xs uppercase tracking-wide text-slate">National Average Compliance Score</div>
              <div className="text-xs text-slate-light mt-0.5 font-mono">{totalInstitutions} institutions tracked</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — real lifecycle, not decorative numbering */}
      <section className="bg-navy text-parchment py-16">
        <div className="max-w-6xl mx-auto px-5">
          <div className="eyebrow !text-brass-light mb-2">The Assessment Lifecycle</div>
          <h2 className="font-display text-2xl md:text-3xl font-semibold mb-10 max-w-xl">
            Every assessment moves through the same five stages, visible end to end.
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              ['Draft', 'Officer completes the weighted checklist on-site'],
              ['Submitted', 'Composite score & RAG status computed instantly'],
              ['Under Review', 'Supervisor reviews within a 5-day SLA'],
              ['Approved', 'Implementation matrix auto-generated'],
              ['Closed', 'Recommendations tracked to verified closure'],
            ].map(([stage, desc], i) => (
              <div key={stage} className="relative">
                <div className="text-brass-light font-mono text-xs mb-2">{String(i + 1).padStart(2, '0')}</div>
                <div className="font-display font-semibold text-parchment mb-1">{stage}</div>
                <div className="text-xs text-parchment/60 leading-relaxed">{desc}</div>
                {i < 4 && <div className="hidden md:block absolute top-1.5 left-[calc(100%+8px)] w-[calc(100%-16px)] border-t border-dashed border-white/20" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Module grid */}
      <section className="max-w-6xl mx-auto px-5 py-16">
        <div className="eyebrow mb-2">Eight Modules, One Portal</div>
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-navy mb-10 max-w-xl">
          Built for the full prevention workflow — not just scoring.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            [ClipboardCheck, 'Compliance Assessment', 'Weighted 5-section digital checklist with instant RAG scoring.'],
            [FileSearch, 'Systems Review', 'Collaborative deep-dives with version-controlled evidence.'],
            [ListChecks, 'Recommendation Tracking', 'Implementation matrices tracked to verified closure.'],
            [ShieldCheck, 'Integrity Committees', 'Charters, training records and meeting minutes in one place.'],
            [FileSignature, 'Integrity Pledges', 'Digital signing with automatic expiry reminders.'],
            [Siren, 'Whistleblower Reporting', 'Browser-side encrypted, anonymous, case-tracked.'],
            [Landmark, 'Procurement Monitoring', 'Automated red-flag detection on every award.'],
            [Map, 'GIS Intelligence', 'Province-level heat maps and site-visit clustering.'],
          ].map(([Icon, title, desc]: any) => (
            <div key={title} className="card p-5">
              <Icon size={20} className="text-brass mb-3" strokeWidth={1.75} />
              <div className="font-display font-semibold text-ink mb-1">{title}</div>
              <div className="text-xs text-slate leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-slate">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-center gap-2">
          <span>ZACC Institutional Compliance Portal — Prevention &amp; Corporate Governance Department</span>
          <span className="hidden sm:inline">·</span>
          <Link to="/whistleblower/track" className="hover:text-brass-dark underline">Track a report</Link>
        </div>
      </footer>
    </div>
  );
}
