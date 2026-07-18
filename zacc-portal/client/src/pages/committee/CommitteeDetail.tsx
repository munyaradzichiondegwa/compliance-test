import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Save } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, LoadError, Card, StatusBadge } from '../../components/common/UI';

export default function CommitteeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [charter, setCharter] = useState('');
  const [savingCharter, setSavingCharter] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', position: 'Member' });
  const [newMeeting, setNewMeeting] = useState({ meetingDate: '', minutesText: '', attendeesCount: '' });
  const [newPlan, setNewPlan] = useState({ description: '', owner: '', dueDate: '' });
  const [loadError, setLoadError] = useState(false);

  const canManage = user?.role === 'INTEGRITY_COMMITTEE_CHAIR' || user?.role === 'SUPER_ADMIN';

  const load = () => {
    setLoadError(false);
    api.get(`/committees/${id}`).then((d) => { setData(d); setCharter(d.charter_text || ''); setLoading(false); }).catch(() => { setLoadError(true); setLoading(false); });
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return <LoadingSpinner />;
  if (loadError || !data) return <LoadError message="This committee couldn't be found." />;

  const saveCharter = async () => {
    setSavingCharter(true);
    try {
      await api.put(`/committees/${id}/charter`, { charterText: charter });
    } finally {
      setSavingCharter(false);
    }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post(`/committees/${id}/members`, newMember);
    setNewMember({ name: '', position: 'Member' });
    load();
  };

  const addMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post(`/committees/${id}/meetings`, { ...newMeeting, attendeesCount: parseInt(newMeeting.attendeesCount) || undefined });
    setNewMeeting({ meetingDate: '', minutesText: '', attendeesCount: '' });
    load();
  };

  const addPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post(`/committees/${id}/action-plans`, newPlan);
    setNewPlan({ description: '', owner: '', dueDate: '' });
    load();
  };

  const updatePlanStatus = async (planId: string, status: string) => {
    await api.put(`/committees/${id}/action-plans/${planId}`, { status });
    load();
  };

  return (
    <div>
      <PageHeader eyebrow="Integrity Committee" title={data.institution_name} description={`Formed ${data.formed_date ? new Date(data.formed_date).toLocaleDateString() : '—'}`} />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Charter</div>
          {canManage ? (
            <>
              <textarea className="input min-h-[120px]" value={charter} onChange={(e) => setCharter(e.target.value)} />
              <button onClick={saveCharter} disabled={savingCharter} className="btn-outline text-xs mt-2"><Save size={13} /> {savingCharter ? 'Saving…' : 'Save Charter'}</button>
            </>
          ) : (
            <p className="text-sm text-slate">{data.charter_text || 'No charter text recorded.'}</p>
          )}
        </Card>

        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Members</div>
          <div className="space-y-1.5 mb-3">
            {data.members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span>{m.name}</span>
                <span className="text-xs text-slate">{m.position}</span>
              </div>
            ))}
          </div>
          {canManage && (
            <form onSubmit={addMember} className="flex gap-2">
              <input className="input text-sm" placeholder="Member name" required value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
              <select className="input text-sm w-32" value={newMember.position} onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}>
                {['Member', 'Secretary', 'Chair'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <button type="submit" className="btn-outline text-xs shrink-0"><Plus size={13} /></button>
            </form>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Training Records</div>
          <div className="space-y-1.5">
            {data.trainings.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-1.5 last:pb-0">
                <span>{t.training_name} {t.member_name && <span className="text-xs text-slate">({t.member_name})</span>}</span>
                <span className={t.completed ? 'badge-green' : 'badge-slate'}>{t.completed ? 'Completed' : 'Pending'}</span>
              </div>
            ))}
            {data.trainings.length === 0 && <div className="text-sm text-slate">No training records yet.</div>}
          </div>
        </Card>

        <Card>
          <div className="text-xs uppercase tracking-wide text-slate mb-3">Meeting Minutes</div>
          <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
            {data.meetings.map((m: any) => (
              <div key={m.id} className="text-sm border-b border-line last:border-0 pb-2 last:pb-0">
                <div className="flex justify-between"><span className="font-medium">{new Date(m.meeting_date).toLocaleDateString()}</span><span className="text-xs text-slate">{m.attendees_count} attendees</span></div>
                <div className="text-xs text-slate">{m.minutes_text}</div>
              </div>
            ))}
          </div>
          {canManage && (
            <form onSubmit={addMeeting} className="space-y-2 bg-parchment/60 rounded p-3">
              <input className="input text-sm" type="date" required value={newMeeting.meetingDate} onChange={(e) => setNewMeeting({ ...newMeeting, meetingDate: e.target.value })} />
              <textarea className="input text-sm" placeholder="Minutes summary…" value={newMeeting.minutesText} onChange={(e) => setNewMeeting({ ...newMeeting, minutesText: e.target.value })} />
              <input className="input text-sm" type="number" placeholder="Attendees count" value={newMeeting.attendeesCount} onChange={(e) => setNewMeeting({ ...newMeeting, attendeesCount: e.target.value })} />
              <button type="submit" className="btn-outline w-full text-xs"><Plus size={13} /> Log Meeting</button>
            </form>
          )}
        </Card>
      </div>

      <Card>
        <div className="text-xs uppercase tracking-wide text-slate mb-3">Action Plans</div>
        <div className="space-y-2 mb-3">
          {data.actionPlans.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-2 last:pb-0">
              <div>
                <div>{p.description}</div>
                <div className="text-xs text-slate">{p.owner} · Due {p.due_date}</div>
              </div>
              {canManage ? (
                <select className="input text-xs w-auto" value={p.status} onChange={(e) => updatePlanStatus(p.id, e.target.value)}>
                  {['Open', 'InProgress', 'Complete', 'Overdue'].map((s) => <option key={s}>{s}</option>)}
                </select>
              ) : (
                <StatusBadge status={p.status} />
              )}
            </div>
          ))}
          {data.actionPlans.length === 0 && <div className="text-sm text-slate">No action plans yet.</div>}
        </div>
        {canManage && (
          <form onSubmit={addPlan} className="grid sm:grid-cols-[1fr_140px_140px_auto] gap-2 bg-parchment/60 rounded p-3">
            <input className="input text-sm" placeholder="Description" required value={newPlan.description} onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })} />
            <input className="input text-sm" placeholder="Owner" value={newPlan.owner} onChange={(e) => setNewPlan({ ...newPlan, owner: e.target.value })} />
            <input className="input text-sm" type="date" value={newPlan.dueDate} onChange={(e) => setNewPlan({ ...newPlan, dueDate: e.target.value })} />
            <button type="submit" className="btn-outline text-xs"><Plus size={13} /></button>
          </form>
        )}
      </Card>
    </div>
  );
}
