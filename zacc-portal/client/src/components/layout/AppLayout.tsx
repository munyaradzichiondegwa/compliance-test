import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { getNavForRole } from './navConfig';
import { ROLE_LABELS } from '../../types';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [bellOpen, setBellOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;
  const navItems = getNavForRole(user.role);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-parchment">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-navy text-parchment flex flex-col transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10 shrink-0">
          <SealMark size={28} />
          <div className="leading-tight">
            <div className="font-display font-semibold text-sm tracking-wide">ZACC Compliance</div>
            <div className="text-[10px] text-brass-light uppercase tracking-wider">Institutional Portal</div>
          </div>
          <button className="ml-auto lg:hidden text-parchment/70" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                  isActive ? 'bg-brass text-white font-medium' : 'text-parchment/75 hover:bg-white/10 hover:text-parchment'
                }`
              }
            >
              <item.icon size={17} strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10 text-xs text-parchment/60">
          <div className="font-medium text-parchment/85">{user.name}</div>
          <div>{ROLE_LABELS[user.role]}</div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 bg-ink/40 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-paper border-b border-line flex items-center gap-3 px-4 lg:px-6 shrink-0 sticky top-0 z-20">
          <button className="lg:hidden text-ink" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <div className="flex-1" />
          <div className="relative">
            <button
              className="relative p-2 rounded hover:bg-parchment text-ink"
              onClick={() => setBellOpen((o) => !o)}
              aria-label="Notifications"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-status-red text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 font-mono">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto card shadow-raised z-40">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                    <span className="font-medium text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-brass hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate">No notifications yet.</div>
                  ) : (
                    notifications.slice(0, 20).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        className={`w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-parchment/60 ${!n.is_read ? 'bg-brass/5' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-brass mt-1.5 shrink-0" />}
                          <div className={!n.is_read ? '' : 'ml-3.5'}>
                            <div className="text-sm text-ink font-medium leading-snug">{n.title}</div>
                            <div className="text-xs text-slate mt-0.5 leading-snug">{n.body}</div>
                            <div className="text-[10px] text-slate-light mt-1 font-mono">{new Date(n.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-slate hover:text-status-red px-2 py-1.5 rounded transition-colors">
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>
        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function SealMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <circle cx="32" cy="32" r="30" fill="#0F2A4A" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="#B8862E" strokeWidth="2" />
      <path d="M32 14 L44 19 V31 C44 40 38.5 46.5 32 50 C25.5 46.5 20 40 20 31 V19 Z" fill="#F7F4EC" />
      <path d="M25.5 32.5 L30 37 L39 27" fill="none" stroke="#0F2A4A" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
