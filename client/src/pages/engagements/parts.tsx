import React, { useState } from 'react';
import { api } from '../../api/client';

export function useAction(onDone: (e: any) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError('');
    try { const r = await fn(); onDone(r); return r; } catch (e: any) { setError(e.message || 'Something went wrong'); } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

export function Section({ title, hint, children, actions }: { title: string; hint?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="card p-5 mb-5" aria-label={title}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div><h2 className="font-display font-semibold text-ink">{title}</h2>{hint && <p className="text-xs text-slate mt-0.5">{hint}</p>}</div>
        {actions}
      </div>
      {children}
    </section>
  );
}
export const Err = ({ msg }: { msg: string }) => (msg ? <p role="alert" className="text-sm text-status-red mt-2">{msg}</p> : null);
export const Field = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (<div><label className="label" htmlFor={id}>{label}</label>{children}</div>);

export const money = (n: number) => `USD ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Lines({ lines, onChange, cols, blank }: { lines: any[]; onChange: (l: any[]) => void; cols: { key: string; label: string; type?: string; width?: string; options?: string[] }[]; blank: any }) {
  const set = (i: number, k: string, v: any) => onChange(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-slate">{cols.map((c) => <th scope="col" key={c.key} className="text-left font-medium px-1 pb-1">{c.label}</th>)}<th><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key} className="px-1 py-0.5" style={{ minWidth: c.width }}>
                  {c.options ? (
                    <select aria-label={`${c.label} row ${i + 1}`} className="input !py-1 text-xs" value={l[c.key] ?? ''} onChange={(e) => set(i, c.key, e.target.value)}>{c.options.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : (
                    <input aria-label={`${c.label} row ${i + 1}`} className="input !py-1 text-xs" type={c.type || 'text'} min={c.type === 'number' ? 0 : undefined} step={c.type === 'number' ? 'any' : undefined} value={l[c.key] ?? ''} onChange={(e) => set(i, c.key, e.target.value)} />
                  )}
                </td>
              ))}
              <td><button type="button" className="text-xs text-status-red px-1" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn-outline !py-1 text-xs mt-2" onClick={() => onChange([...lines, { ...blank }])}>+ Add row</button>
    </div>
  );
}

export function ListEditor({ id, label, value, onChange }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field id={id} label={`${label} (one per line)`}>
      <textarea id={id} className="input" rows={Math.max(3, value.length + 1)} value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n'))} />
    </Field>
  );
}
void api;
