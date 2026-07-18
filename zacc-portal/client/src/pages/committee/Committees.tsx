import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, LoadingSpinner, EmptyState } from '../../components/common/UI';

export default function Committees() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [committees, setCommittees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/committees').then((all) => {
      if (user?.role === 'INTEGRITY_COMMITTEE_CHAIR' && user.institutionId) {
        const mine = all.find((c: any) => c.institution_id === user.institutionId);
        if (mine) {
          navigate(`/app/committees/${mine.id}`, { replace: true });
          return;
        }
      }
      setCommittees(all);
      setLoading(false);
    });
  }, [user, navigate]);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader eyebrow="Section 10.1" title="Integrity Committees" description="Charters, training records, meeting minutes and action plans for every institution's committee." />
      {committees.length === 0 ? (
        <EmptyState title="No committees registered yet" />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {committees.map((c) => (
            <Link key={c.id} to={`/app/committees/${c.id}`} className="card p-5 hover:shadow-raised transition-shadow">
              <div className="font-display font-semibold text-ink mb-1">{c.institution_name}</div>
              <div className="text-xs text-slate">Formed {c.formed_date ? new Date(c.formed_date).toLocaleDateString() : '—'} · {c.status}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
