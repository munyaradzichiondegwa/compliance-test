import React, { useEffect, useState } from 'react';
import { Save, Mail, MessageSquare } from 'lucide-react';
import { api } from '../../api/client';
import { PageHeader, LoadingSpinner, Card } from '../../components/common/UI';

export default function NotificationAdmin() {
  const [tab, setTab] = useState<'templates' | 'email' | 'sms'>('templates');
  const [templates, setTemplates] = useState<any[]>([]);
  const [emailOutbox, setEmailOutbox] = useState<any[]>([]);
  const [smsOutbox, setSmsOutbox] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    Promise.all([api.get('/notifications/templates'), api.get('/notifications/outbox/email'), api.get('/notifications/outbox/sms')]).then(([t, e, s]) => {
      setTemplates(t);
      setEmailOutbox(e);
      setSmsOutbox(s);
      setLoading(false);
    });
  }, []);

  const updateTemplate = (id: string, field: string, value: string) => {
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const saveTemplate = async (t: any) => {
    setSavingId(t.id);
    try {
      await api.put(`/notifications/templates/${t.id}`, { subjectTemplate: t.subject_template, bodyTemplate: t.body_template });
    } finally {
      setSavingId('');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader eyebrow="Section 10.2" title="Notifications Admin" description="Edit templates and inspect the dev mailbox (email/SMS have no live provider configured in this environment — see README)." />

      <div className="flex gap-2 mb-6">
        {[['templates', 'Templates'], ['email', 'Email Outbox'], ['sms', 'SMS Outbox']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`text-xs px-3 py-1.5 rounded-full border ${tab === k ? 'bg-charcoal text-white border-charcoal' : 'border-line text-slate'}`}>{l}</button>
        ))}
      </div>

      {tab === 'templates' && (
        <div className="space-y-4">
          {templates.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-gold-dark">{t.code}</span>
                <span className="badge-slate">{t.channel}</span>
              </div>
              {t.subject_template && (
                <input className="input text-sm mb-2" value={t.subject_template} onChange={(e) => updateTemplate(t.id, 'subject_template', e.target.value)} />
              )}
              <textarea className="input text-sm" value={t.body_template} onChange={(e) => updateTemplate(t.id, 'body_template', e.target.value)} />
              <button onClick={() => saveTemplate(t)} disabled={savingId === t.id} className="btn-outline text-xs mt-2"><Save size={12} /> {savingId === t.id ? 'Saving…' : 'Save'}</button>
            </Card>
          ))}
        </div>
      )}

      {tab === 'email' && (
        <div className="space-y-3">
          {emailOutbox.map((e) => (
            <Card key={e.id}>
              <div className="flex items-center gap-2 mb-1">
                <Mail size={13} className="text-slate" />
                <span className="text-sm font-medium">{e.to_address}</span>
                <span className="text-xs text-slate-light font-mono ml-auto">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              <div className="text-sm font-medium text-ink mb-1">{e.subject}</div>
              <div className="text-xs text-slate">{e.body}</div>
            </Card>
          ))}
          {emailOutbox.length === 0 && <div className="text-sm text-slate text-center py-8">No emails sent yet.</div>}
        </div>
      )}

      {tab === 'sms' && (
        <div className="space-y-3">
          {smsOutbox.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={13} className="text-slate" />
                <span className="text-sm font-medium font-mono">{s.to_phone}</span>
                <span className="text-xs text-slate-light font-mono ml-auto">{new Date(s.created_at).toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate">{s.body}</div>
            </Card>
          ))}
          {smsOutbox.length === 0 && <div className="text-sm text-slate text-center py-8">No SMS sent yet.</div>}
        </div>
      )}
    </div>
  );
}
