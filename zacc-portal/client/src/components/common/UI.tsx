import React from 'react';
import { Link } from 'react-router-dom';

export function RagBadge({ status }: { status: 'Red' | 'Amber' | 'Green' | string | null }) {
  if (!status) return <span className="badge-slate">Not yet assessed</span>;
  const cls = status === 'Green' ? 'badge-green' : status === 'Amber' ? 'badge-amber' : 'badge-red';
  const label = status === 'Green' ? 'Compliant' : status === 'Amber' ? 'Partially Compliant' : 'Non-Compliant';
  return (
    <span className={cls}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Draft: 'badge-slate',
  Submitted: 'badge-amber',
  UnderReview: 'badge-amber',
  Returned: 'badge-red',
  Approved: 'badge-green',
  Closed: 'badge-slate',
  Created: 'badge-slate',
  Assigned: 'badge-amber',
  ResponseSubmitted: 'badge-amber',
  Verified: 'badge-green',
  Incomplete: 'badge-red',
  Active: 'badge-green',
  Inactive: 'badge-slate',
  InProgress: 'badge-amber',
  UnderApproval: 'badge-amber',
  Received: 'badge-slate',
  Referred: 'badge-amber',
  Insufficient: 'badge-red',
  Open: 'badge-slate',
  Mitigated: 'badge-green',
  Accepted: 'badge-amber',
  Transferred: 'badge-amber',
  Avoided: 'badge-green',
  Complete: 'badge-green',
  Overdue: 'badge-red',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={STATUS_STYLES[status] || 'badge-slate'}>{status.replace(/([A-Z])/g, ' $1').trim()}</span>;
}

export function RiskBadge({ category }: { category: 'Low' | 'Medium' | 'High' | 'Critical' }) {
  const styles: Record<string, string> = { Low: 'badge-green', Medium: 'badge-amber', High: 'badge-red', Critical: 'bg-status-critical/10 text-status-critical badge' };
  return <span className={styles[category] || 'badge-slate'}>{category}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-display font-semibold text-ink">{title}</h1>
        {description && <p className="text-sm text-slate mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function LoadingSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate text-sm">
      <span className="w-5 h-5 border-2 border-line border-t-brass rounded-full animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 border border-dashed border-line rounded-lg bg-paper/50">
      <h3 className="font-display text-lg text-ink mb-1">{title}</h3>
      {description && <p className="text-sm text-slate max-w-sm mb-4">{description}</p>}
      {action}
    </div>
  );
}

export function LoadError({ message = "We couldn't load this — it may not exist, or you may not have access." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <h3 className="font-display text-lg text-ink mb-1">Something went wrong</h3>
      <p className="text-sm text-slate max-w-sm mb-4">{message}</p>
      <Link to="/app/dashboard" className="btn-outline">Back to Dashboard</Link>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto shadow-raised`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-paper">
          <h3 className="font-display font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-slate hover:text-ink text-xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function KpiCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'red' | 'amber' | 'green' }) {
  const toneColor = tone === 'red' ? 'text-status-red' : tone === 'amber' ? 'text-status-amber' : tone === 'green' ? 'text-status-green' : 'text-ink';
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-slate font-medium">{label}</div>
      <div className={`text-3xl font-display font-semibold mt-1.5 ${toneColor}`}>{value}</div>
      {sub && <div className="text-xs text-slate mt-1">{sub}</div>}
    </Card>
  );
}
