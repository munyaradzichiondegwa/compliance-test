import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAction, Section, Err, Field, Lines, ListEditor, money } from './parts';
import { ORIGIN_LABELS, SCOPE_LABELS, useEngagementMeta } from './common';

type P = { e: any; onChange: (e: any) => void };
const parseDays = (v: any) => (v === '' || v == null ? '' : v);

export function PreliminaryPanel({ e, onChange }: P) {
  const [credibility, setC] = useState(e.credibility || 'Credible');
  const [notes, setN] = useState(e.prelim_notes || '');
  const a = useAction(onChange);
  return (
    <Section title="Preliminary assessment" hint="Within 2 working days: assess the credibility of the allegations or the justification, then submit to the Manager and General Manager.">
      <div className="grid gap-3 max-w-xl">
        <Field id="pa-c" label="Credibility of the allegations / information">
          <select id="pa-c" className="input" value={credibility} onChange={(x) => setC(x.target.value)}>
            <option value="Credible">Credible</option><option value="PartlyCredible">Partly credible</option><option value="NotCredible">Not credible</option><option value="NotApplicable">Not applicable (routine / invited exercise)</option>
          </select></Field>
        <Field id="pa-n" label="Assessment notes (min 10 characters)"><textarea id="pa-n" className="input" rows={4} value={notes} onChange={(x) => setN(x.target.value)} /></Field>
        <div><button className="btn-primary" disabled={a.busy || notes.trim().length < 10} onClick={() => a.run(() => api.post(`/engagements/${e.id}/preliminary`, { credibility, notes }))}>Submit preliminary assessment</button></div>
        <Err msg={a.error} />
      </div>
    </Section>
  );
}

export function ConceptEditor({ e, onChange }: P) {
  const meta = useEngagementMeta();
  const [f, setF] = useState({
    title: e.title, scopeKind: e.scope_kind || '', originSource: e.origin_source, originDetail: e.origin_detail || '', locationType: e.location_type, background: e.background || '', rationale: e.rationale || '', scopeText: e.scope_text || '',
    allegations: e.allegations as string[], objectives: e.objectives as string[], methodology: e.methodology as string[], expectedOutcomes: e.expected_outcomes as string[], startDate: e.start_date || '', endDate: e.end_date || '', days: parseDays(e.days),
  });
  const [team, setTeam] = useState<any[]>(e.team.map((t: any) => ({ userId: t.user_id || '', name: t.name, role: t.team_role })));
  const [budget, setBudget] = useState<any[]>(e.budget.map((b: any) => ({ ...b })));
  const [itin, setItin] = useState<any[]>(e.itinerary.map((r: any) => ({ ...r })));
  const [staff, setStaff] = useState<any[]>([]);
  const [fuel, setFuel] = useState('');
  const [dist, setDist] = useState<any>(null);
  const a = useAction(onChange);
  useEffect(() => {
    Promise.all(['COMPLIANCE_OFFICER', 'SYSTEMS_REVIEWER', 'MONITORING_OFFICER'].map((r) => api.get(`/users?role=${r}`).catch(() => [])))
      .then((x) => setStaff(x.flat().filter((u: any) => u.is_active)));
  }, []);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const clean = (l: string[]) => l.map((s) => s.trim()).filter(Boolean);
  const total = budget.reduce((s, b) => s + (+b.quantity || 0) * (+b.unit_cost || 0) * (+b.persons || 1) * (+b.days || 1), 0);

  const saveAll = async () => {
    await api.put(`/engagements/${e.id}`, { ...f, scopeKind: f.scopeKind || undefined, days: f.days === '' ? null : Number(f.days), allegations: clean(f.allegations), objectives: clean(f.objectives), methodology: clean(f.methodology), expectedOutcomes: clean(f.expectedOutcomes) });
    await api.put(`/engagements/${e.id}/team`, { team });
    await api.put(`/engagements/${e.id}/budget`, { lines: budget });
    return api.put(`/engagements/${e.id}/itinerary`, { rows: itin });
  };
  const checkDistance = async () => { try { if (e.inst_lat == null) throw new Error('This institution has no map location recorded'); setDist(await api.get(`/engagements/distance?lat1=-17.8292&lng1=31.0522&lat2=${e.inst_lat}&lng2=${e.inst_lng}`)); } catch (x: any) { a.setError(x.message); } };

  return (
    <>
      <Section title="Concept note" hint="Complete every part, then submit for approval. Save keeps your work without submitting."
        actions={<div className="flex gap-2"><button className="btn-outline text-xs" disabled={a.busy} onClick={() => a.run(async () => { await saveAll(); return api.post(`/engagements/${e.id}/draft-concept`); })}>Fill from SOP template</button></div>}>
        <div className="grid gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="c-t" label="Title"><input id="c-t" className="input" value={f.title} onChange={(x) => set('title', x.target.value)} /></Field>
            <Field id="c-o" label="What prompted the exercise"><select id="c-o" className="input" value={f.originSource} onChange={(x) => set('originSource', x.target.value)}>{(meta?.origins || [f.originSource]).map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o] || o}</option>)}</select></Field>
          </div>
          {e.sop_type === 'ComplianceAssessment' && <Field id="c-k" label="Kind of check"><select id="c-k" className="input" value={f.scopeKind} onChange={(x) => set('scopeKind', x.target.value)}>{Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
          <Field id="c-bg" label="Background"><textarea id="c-bg" className="input" rows={3} value={f.background} onChange={(x) => set('background', x.target.value)} /></Field>
          <ListEditor id="c-al" label="Allegations" value={f.allegations} onChange={(v) => set('allegations', v)} />
          <Field id="c-ra" label="Rationale / justification"><textarea id="c-ra" className="input" rows={2} value={f.rationale} onChange={(x) => set('rationale', x.target.value)} /></Field>
          <Field id="c-sc" label="Scope"><textarea id="c-sc" className="input" rows={2} value={f.scopeText} onChange={(x) => set('scopeText', x.target.value)} /></Field>
          <ListEditor id="c-ob" label="Objectives" value={f.objectives} onChange={(v) => set('objectives', v)} />
          <ListEditor id="c-me" label="Methodology" value={f.methodology} onChange={(v) => set('methodology', v)} />
          <ListEditor id="c-eo" label="Expected outcomes" value={f.expectedOutcomes} onChange={(v) => set('expectedOutcomes', v)} />
          <div className="grid grid-cols-3 gap-3">
            <Field id="c-s" label="Start"><input id="c-s" type="date" className="input" value={f.startDate} onChange={(x) => set('startDate', x.target.value)} /></Field>
            <Field id="c-e" label="End"><input id="c-e" type="date" className="input" value={f.endDate} onChange={(x) => set('endDate', x.target.value)} /></Field>
            <Field id="c-d" label="Days"><input id="c-d" type="number" min={1} className="input" value={f.days} onChange={(x) => set('days', x.target.value)} /></Field>
          </div>
        </div>
      </Section>

      <Section title="Team" hint={`The Manager allocates one Team Leader and the team (minimum ${e.sop.teamMin || 2}). The Focal Person is the officer coordinating with the institution.`}>
        <Lines lines={team} onChange={setTeam} blank={{ userId: '', name: '', role: 'Member' }}
          cols={[{ key: 'name', label: 'Name', width: '12rem' }, { key: 'role', label: 'Role', options: ['TeamLeader', 'FocalPerson', 'Member'] }]} />
        <div className="mt-2 flex flex-wrap gap-2 text-xs items-center"><span className="text-slate">Quick add:</span>
          {staff.map((u) => <button key={u.id} type="button" className="btn-outline !py-0.5 text-xs" onClick={() => !team.some((t) => t.userId === u.id) && setTeam([...team, { userId: u.id, name: u.name, role: team.some((t) => t.role === 'TeamLeader') ? 'Member' : 'TeamLeader' }])}>{u.name}</button>)}
        </div>
      </Section>

      <Section title="Itinerary" hint="Day by day: travel, meetings, interviews, verification, report writing. Include the distance for fuel estimates." actions={<button className="btn-outline text-xs" onClick={checkDistance}>Distance from Head Office</button>}>
        {dist && <p className="text-xs text-slate mb-2">Approx. {dist.km ?? '—'} km by road one way to {e.institution_name}.</p>}
        <Lines lines={itin} onChange={setItin} blank={{ day_no: 1, activity_date: '', location: '', activity: '', activity_type: 'Other', distance_km: '' }}
          cols={[{ key: 'day_no', label: 'Day', type: 'number', width: '4rem' }, { key: 'activity_date', label: 'Date', type: 'date', width: '8rem' }, { key: 'location', label: 'Location', width: '8rem' }, { key: 'activity', label: 'Activity', width: '14rem' },
            { key: 'activity_type', label: 'Type', options: ['Travel', 'EntranceMeeting', 'Interview', 'Verification', 'DocumentAnalysis', 'ReportWriting', 'ExitMeeting', 'Training', 'Signing', 'Other'] }, { key: 'distance_km', label: 'km', type: 'number', width: '4rem' }]} />
      </Section>

      <Section title="Budget" hint="Cost = quantity × unit cost × persons × days (USD). Expenses are met by ZACC; the institution carries no cost."
        actions={<div className="flex items-center gap-2"><input aria-label="Fuel litres" className="input !w-24 !py-1 text-xs" placeholder="Fuel (L)" value={fuel} onChange={(x) => setFuel(x.target.value)} />
          <button className="btn-outline text-xs" disabled={a.busy} onClick={() => a.run(async () => { await api.put(`/engagements/${e.id}`, { days: f.days === '' ? null : Number(f.days) }); const r = await api.post(`/engagements/${e.id}/budget-template`, { fuelLitres: Number(fuel) || 0 }); setBudget(r.budget.map((b: any) => ({ ...b }))); return r; })}>Use standard template</button></div>}>
        <Lines lines={budget} onChange={setBudget} blank={{ item: '', unit: '', quantity: 1, unit_cost: 0, persons: 1, days: 1 }}
          cols={[{ key: 'item', label: 'Item', width: '10rem' }, { key: 'unit', label: 'Unit', width: '5rem' }, { key: 'quantity', label: 'Qty', type: 'number', width: '4rem' }, { key: 'unit_cost', label: 'Unit cost', type: 'number', width: '6rem' }, { key: 'persons', label: 'Persons', type: 'number', width: '4rem' }, { key: 'days', label: 'Days', type: 'number', width: '4rem' }]} />
        <p className="text-sm font-medium mt-3">Total: {money(total)}</p>
      </Section>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button className="btn-outline" disabled={a.busy} onClick={() => a.run(saveAll)}>Save draft</button>
        <button className="btn-primary" disabled={a.busy} onClick={() => a.run(async () => { await saveAll(); return api.post(`/engagements/${e.id}/submit-concept`); })}>Save and submit for approval</button>
        <Err msg={a.error} />
      </div>
    </>
  );
}
