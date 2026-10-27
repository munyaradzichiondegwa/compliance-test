import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, EmptyState } from '../../components/common/UI';
import { useOnline } from '../../offline/useOnline';
import { sendOrQueue, flushQueue, listQueue, removeFromQueue, QueueItem } from '../../offline/queue';
import { today } from '../engagements/common';

const CACHE = 'zacc_field_engagements';
const readCache = (): any[] => { try { return JSON.parse(localStorage.getItem(CACHE) || '[]'); } catch { return []; } };

export default function FieldCapture() {
  const online = useOnline();
  const [list, setList] = useState<any[]>(readCache());
  const [eng, setEng] = useState('');
  const [kind, setKind] = useState<'finding' | 'interview' | 'meeting'>('finding');
  const [f, setF] = useState<any>({ issue: '', points: '', rating: 'NonCompliant', severity: 'Medium', recommendation: '', interviewee: '', position: '', minutes: '', mkind: 'Entrance', summary: '', attendees: '' });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [msg, setMsg] = useState('');
  const [geo, setGeo] = useState(true);

  const refreshQueue = () => listQueue().then(setQueue);
  useEffect(() => { refreshQueue(); }, []);
  useEffect(() => {
    if (!online) return;
    api.get('/engagements?status=Fieldwork').then((r) => { setList(r); try { localStorage.setItem(CACHE, JSON.stringify(r.map((x: any) => ({ id: x.id, reference: x.reference, title: x.title, institution_name: x.institution_name })))); } catch { /* ignore */ } }).catch(() => {});
    flushQueue().then((r) => { if (r.sent) setMsg(`${r.sent} saved record(s) uploaded.`); refreshQueue(); });
  }, [online]);

  const position = () => new Promise<string>((resolve) => {
    if (!geo || !navigator.geolocation) return resolve('');
    navigator.geolocation.getCurrentPosition((p) => resolve(` [GPS ${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}]`), () => resolve(''), { timeout: 4000, maximumAge: 60000 });
  });

  const save = async () => {
    setMsg('');
    const gps = await position();
    const label = kind === 'finding' ? `Finding: ${f.issue}` : kind === 'interview' ? `Interview: ${f.interviewee}` : `${f.mkind} meeting`;
    let r: 'sent' | 'queued';
    try {
      if (kind === 'finding') r = await sendOrQueue('POST', `/engagements/${eng}/findings/add`, { issue: f.issue, finding_points: [f.points + gps].filter(Boolean), compliance_rating: f.rating, severity: f.severity, recommendation: f.recommendation }, label);
      else if (kind === 'interview') r = await sendOrQueue('POST', `/engagements/${eng}/interviews`, { interviewee: f.interviewee, position: f.position, date: today(), minutes: f.minutes + gps }, label);
      else r = await sendOrQueue('POST', `/engagements/${eng}/meetings`, { kind: f.mkind, summary: f.summary + gps, attendees: f.attendees, heldAt: today() }, label);
    } catch (e: any) { setMsg(e.message); return; }
    setMsg(r === 'sent' ? 'Saved.' : 'You are offline — saved on this device and will upload automatically when the connection returns.');
    setF({ ...f, issue: '', points: '', recommendation: '', interviewee: '', position: '', minutes: '', summary: '', attendees: '' });
    refreshQueue();
  };
  const ready = eng && ((kind === 'finding' && f.issue.trim()) || (kind === 'interview' && f.interviewee.trim() && f.minutes.trim()) || (kind === 'meeting' && f.summary.trim()));
  const retry = async () => { const r = await flushQueue(); setMsg(`${r.sent} uploaded, ${r.failed} rejected, ${r.remaining} waiting.`); refreshQueue(); };

  return (
    <div>
      <PageHeader eyebrow="Fieldwork" title="Field capture" description="Record findings, interviews and meetings at the institution. Works without a connection: records are kept on this device and uploaded in order when you are back online." />
      <p role="status" className={`text-sm mb-4 ${online ? 'text-slate' : 'text-status-amber font-medium'}`}>{online ? 'Online' : 'Offline — records will be queued on this device'}</p>
      {list.length === 0 ? <EmptyState title="No engagements in fieldwork" description="Start fieldwork on an engagement while online; it will then appear here, also when you are offline." /> : (
        <div className="card p-5 max-w-2xl grid gap-3">
          <div><label className="label" htmlFor="fc-e">Engagement</label><select id="fc-e" className="input" value={eng} onChange={(e) => setEng(e.target.value)}><option value="">Select…</option>{list.map((x) => <option key={x.id} value={x.id}>{x.reference} — {x.institution_name}</option>)}</select></div>
          <div role="tablist" aria-label="Record type" className="flex gap-2">{(['finding', 'interview', 'meeting'] as const).map((k) => <button key={k} role="tab" aria-selected={kind === k} className={`px-3 py-1.5 text-sm rounded-full border capitalize ${kind === k ? 'bg-charcoal text-white border-charcoal' : 'border-line text-slate'}`} onClick={() => setKind(k)}>{k}</button>)}</div>
          {kind === 'finding' && <>
            <div><label className="label" htmlFor="fc-i">Issue</label><input id="fc-i" className="input" value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} /></div>
            <div><label className="label" htmlFor="fc-p">What was found</label><textarea id="fc-p" className="input" rows={3} value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="fc-r">Rating</label><select id="fc-r" className="input" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}><option value="Compliant">Compliant</option><option value="PartiallyCompliant">Partially compliant</option><option value="NonCompliant">Non-compliant</option></select></div>
              <div><label className="label" htmlFor="fc-s">Severity</label><select id="fc-s" className="input" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{['Low', 'Medium', 'High', 'Critical'].map((s) => <option key={s}>{s}</option>)}</select></div></div>
            <div><label className="label" htmlFor="fc-rec">Recommendation</label><textarea id="fc-rec" className="input" rows={2} value={f.recommendation} onChange={(e) => setF({ ...f, recommendation: e.target.value })} /></div></>}
          {kind === 'interview' && <>
            <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="fc-n">Interviewee</label><input id="fc-n" className="input" value={f.interviewee} onChange={(e) => setF({ ...f, interviewee: e.target.value })} /></div><div><label className="label" htmlFor="fc-pos">Position</label><input id="fc-pos" className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></div></div>
            <div><label className="label" htmlFor="fc-m">Minutes</label><textarea id="fc-m" className="input" rows={4} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></div></>}
          {kind === 'meeting' && <>
            <div><label className="label" htmlFor="fc-mk">Meeting</label><select id="fc-mk" className="input" value={f.mkind} onChange={(e) => setF({ ...f, mkind: e.target.value })}><option>Entrance</option><option>Exit</option></select></div>
            <div><label className="label" htmlFor="fc-at">Attendees</label><input id="fc-at" className="input" value={f.attendees} onChange={(e) => setF({ ...f, attendees: e.target.value })} /></div>
            <div><label className="label" htmlFor="fc-su">Summary</label><textarea id="fc-su" className="input" rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div></>}
          <label className="flex items-center gap-2 text-xs text-slate"><input type="checkbox" checked={geo} onChange={(e) => setGeo(e.target.checked)} /> Stamp the record with my GPS position</label>
          <div><button className="btn-primary" disabled={!ready} onClick={save}>Save record</button></div>
          {msg && <p role="status" className="text-sm">{msg}</p>}
        </div>)}
      <h2 className="font-display font-semibold mt-8 mb-2">Waiting on this device ({queue.length})</h2>
      {queue.length === 0 ? <p className="text-sm text-slate">Nothing waiting.</p> : (
        <ul className="card divide-y divide-line max-w-2xl">{queue.map((q) => (
          <li key={q.id} className="p-3 text-sm flex items-center gap-3"><span className="flex-1">{q.label}<span className="block text-xs text-slate">{q.status === 'failed' ? `Rejected by the server: ${q.error}` : `Queued ${q.createdAt.slice(0, 16).replace('T', ' ')}`}</span></span>
            {q.status === 'failed' && <button className="btn-outline text-xs" onClick={async () => { await removeFromQueue(q.id); refreshQueue(); }}>Discard</button>}</li>))}</ul>)}
      {queue.some((q) => q.status === 'queued') && online && <button className="btn-outline mt-3" onClick={retry}>Upload now</button>}
    </div>
  );
}
