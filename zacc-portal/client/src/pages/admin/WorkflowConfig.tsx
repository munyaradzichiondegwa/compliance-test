import React, { useEffect, useState } from 'react';
import { Save, PlayCircle } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, Card } from '../../components/common/UI';
import { ROLE_LABELS, Role } from '../../types';

export default function WorkflowConfig() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState('');
  const [runningScheduler, setRunningScheduler] = useState(false);
  const [schedulerResult, setSchedulerResult] = useState<any>(null);

  const load = () => api.get('/workflow-configs').then((c) => { setConfigs(c); setLoading(false); });
  useEffect(() => { load(); }, []);

  const updateField = (workflowType: string, field: string, value: any) => {
    setConfigs((cs) => cs.map((c) => (c.workflow_type === workflowType ? { ...c, [field]: value } : c)));
  };

  const save = async (config: any) => {
    setSavingType(config.workflow_type);
    try {
      await api.put(`/workflow-configs/${config.workflow_type}`, {
        slaDays: config.sla_days,
        escalateToRole: config.escalate_to_role,
        reminderIntervals: config.reminder_intervals,
      });
    } finally {
      setSavingType('');
    }
  };

  const runScheduler = async () => {
    setRunningScheduler(true);
    try {
      const res = await api.post('/admin/run-scheduler');
      setSchedulerResult(res);
    } finally {
      setRunningScheduler(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        eyebrow="Section 10.3 · WFE"
        title="Workflow Configuration"
        description="Edit SLA thresholds and escalation targets without any code change. Runs automatically on an hourly sweep."
        actions={
          <button className="btn-outline" onClick={runScheduler} disabled={runningScheduler}>
            <PlayCircle size={15} /> {runningScheduler ? 'Running…' : 'Run SLA Sweep Now'}
          </button>
        }
      />

      {schedulerResult && (
        <Card className="mb-6 bg-status-green-bg/40 border-status-green/30">
          <div className="text-sm text-status-green font-medium mb-1">Sweep complete at {new Date(schedulerResult.runAt).toLocaleTimeString()}</div>
          <div className="text-xs text-slate">
            Assessments escalated: {schedulerResult.assessments.escalated} · Recommendations reminded: {schedulerResult.recommendations.reminded} ·
            Recommendations escalated: {schedulerResult.recommendations.escalated} · Pledge reminders: {schedulerResult.pledges.reminded}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {configs.map((c) => (
          <Card key={c.workflow_type}>
            <div className="font-display font-semibold text-navy mb-3">{c.workflow_type.replace(/([A-Z])/g, ' $1').trim()}</div>
            <div className="space-y-3">
              <div>
                <label className="label">SLA (working days)</label>
                <input type="number" className="input" value={c.sla_days} onChange={(e) => updateField(c.workflow_type, 'sla_days', parseInt(e.target.value))} />
              </div>
              <div>
                <label className="label">Escalate To</label>
                <select className="input" value={c.escalate_to_role} onChange={(e) => updateField(c.workflow_type, 'escalate_to_role', e.target.value)}>
                  {Object.keys(ROLE_LABELS).map((r) => <option key={r} value={r}>{ROLE_LABELS[r as Role]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Reminder Intervals (days, comma-separated)</label>
                <input
                  className="input"
                  value={c.reminder_intervals.join(', ')}
                  onChange={(e) => updateField(c.workflow_type, 'reminder_intervals', e.target.value.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n)))}
                />
              </div>
              <button onClick={() => save(c)} disabled={savingType === c.workflow_type} className="btn-primary w-full text-sm">
                <Save size={13} /> {savingType === c.workflow_type ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
