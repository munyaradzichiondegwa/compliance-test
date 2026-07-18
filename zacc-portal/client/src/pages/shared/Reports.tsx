import React, { useEffect, useState } from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { api, downloadBlob } from '../../api/client';
import { PageHeader, LoadingSpinner, Card } from '../../components/common/UI';

export default function Reports() {
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [selectedInst, setSelectedInst] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    Promise.all([api.get('/reports/catalogue'), api.get('/institutions?limit=200')]).then(([c, i]) => {
      setCatalogue(c);
      setInstitutions(i.results);
      setLoading(false);
    });
  }, []);

  const download = async (code: string) => {
    setBusy(code);
    try {
      if (code === 'SCORECARD') {
        if (!selectedInst) {
          alert('Select an institution first.');
          return;
        }
        const blob = await api.blob(`/reports/scorecard/${selectedInst}`);
        downloadBlob(blob, 'Institutional_Scorecard.pdf');
      } else if (code === 'RECOMMENDATION_REGISTER') {
        const blob = await api.blob('/recommendations/register/export.csv');
        downloadBlob(blob, 'Recommendation_Register.csv');
      } else if (code === 'RISK_REGISTER') {
        const blob = await api.blob('/risk-register/export.csv');
        downloadBlob(blob, 'Corruption_Risk_Register.csv');
      } else if (code === 'AUDIT_LOG') {
        const blob = await api.blob('/audit-logs/export.csv');
        downloadBlob(blob, 'Audit_Log_Export.csv');
      }
    } catch {
      alert('You may not have permission to generate this report.');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader eyebrow="Section 17" title="Reports" description="Generate and download the standard reporting catalogue on demand." />

      <div className="mb-6 max-w-sm">
        <label className="label">Institution (for the Scorecard report)</label>
        <select className="input" value={selectedInst} onChange={(e) => setSelectedInst(e.target.value)}>
          <option value="">Select institution…</option>
          {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {catalogue.map((r) => (
          <Card key={r.code} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {r.format === 'PDF' ? <FileText size={20} className="text-navy" /> : <FileSpreadsheet size={20} className="text-brass" />}
              <div>
                <div className="font-medium text-sm text-ink">{r.name}</div>
                <div className="text-xs text-slate">{r.format} · on demand</div>
              </div>
            </div>
            <button className="btn-outline text-xs px-3" onClick={() => download(r.code)} disabled={busy === r.code}>
              <Download size={13} /> {busy === r.code ? '…' : 'Get'}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
