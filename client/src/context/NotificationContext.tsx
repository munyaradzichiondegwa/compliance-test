import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

interface Notification {
  id: string;
  title: string;
  body: string;
  is_read: number;
  created_at: string;
  related_entity_type?: string;
  related_entity_id?: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/notifications');
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      /* ignore transient failures */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }
    refresh();

    const socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('connect', () => socket.emit('identify', user.id));
    socket.on('notification', () => {
      refresh();
    });
    socketRef.current = socket;
    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.put(`/notifications/${id}/read`);
    } catch {
      /* ignore */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
    try {
      await api.put('/notifications/read-all');
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
