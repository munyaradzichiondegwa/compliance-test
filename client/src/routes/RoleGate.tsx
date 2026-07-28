import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import type { Role } from '../types';

export default function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 px-6">
        <ShieldAlert size={32} className="text-status-amber mb-3" />
        <h2 className="font-display text-lg text-ink mb-1">Access restricted</h2>
        <p className="text-sm text-slate max-w-sm">This area isn't available for your role. If you believe this is a mistake, contact your Super Administrator.</p>
      </div>
    );
  }
  return <>{children}</>;
}
