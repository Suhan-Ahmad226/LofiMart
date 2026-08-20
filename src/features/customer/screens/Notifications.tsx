import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Coins, Package, ShieldCheck, Tag, Wallet, BadgeCheck, Users, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from '@/lib/toast';
import { useUser } from '../../../features/shared/state/UserContext';
import { Link, useNavigate } from '../../../lib/navigation';
import { CenteredLoader, EmptyState } from '@/features/shared/ui/FeedbackState';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url?: string | null;
  read_at?: string | null;
  created_at: string;
};

type NotificationPreferences = {
  email_enabled: boolean;
  order_updates: boolean;
};

const iconByType: Record<string, React.ReactNode> = {
  order_update: <Package className="h-5 w-5" />,
  reward: <Coins className="h-5 w-5" />,
  security: <ShieldCheck className="h-5 w-5" />,
  marketing: <Tag className="h-5 w-5" />,
  inventory: <Package className="h-5 w-5" />,
  payout: <Wallet className="h-5 w-5" />,
  verification: <BadgeCheck className="h-5 w-5" />,
  community: <Users className="h-5 w-5" />,
  flash_sale: <Zap className="h-5 w-5" />,
  account_action: <ShieldCheck className="h-5 w-5" />,
};

export const CustomerNotificationsPage = () => {
  const { token } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [focusedNotificationId, setFocusedNotificationId] = useState('');
  const unreadCount = items.filter((item) => !item.read_at).length;

  const loadNotifications = (options?: { silent?: boolean }) => {
    if (!token) {
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    const requestUrl = `/api/notifications?ts=${Date.now()}`;
    fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to load notifications');
        }
        return res.json();
      })
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .finally(() => {
        if (!options?.silent) {
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    loadNotifications();
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadNotifications({ silent: true });
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextNotification = params.get('notification');

    if (nextNotification) {
      setFocusedNotificationId(nextNotification);
    }
  }, []);

  const markAllRead = async () => {
    if (!token) {
      return;
    }

    const response = await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      toast.error('Could not update notifications right now.');
      return;
    }

    setItems((current) => current.map((item) => ({ ...item, read_at: new Date().toISOString() })));
    toast.success('Notifications marked as read.');
  };

  const markNotificationRead = async (notificationId: string) => {
    if (!token) {
      return false;
    }

    const response = await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      toast.error('Could not update this notification right now.');
      return false;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === notificationId ? { ...item, read_at: item.read_at || new Date().toISOString() } : item,
      ),
    );
    return true;
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.read_at) {
      await markNotificationRead(item.id);
    }

    if (item.action_url) {
      navigate(item.action_url);
    }
  };

  const filteredItems = useMemo(() => items, [items]);

  useEffect(() => {
    if (!focusedNotificationId || typeof window === 'undefined') return;

    const matched = filteredItems.find((item) => item.id === focusedNotificationId);
    if (!matched) return;

    window.requestAnimationFrame(() => {
      document.getElementById(`customer-notification-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [filteredItems, focusedNotificationId]);

  if (loading) {
    return <CenteredLoader label="Loading your latest notifications..." />;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-gray-500">Order updates, reward unlocks, security alerts, and recovery nudges all live here.</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 ? (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {unreadCount} unread
            </span>
          ) : null}
          <button onClick={markAllRead} className="text-sm font-semibold text-primary hover:underline">
            Mark all as read
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        {filteredItems.length === 0 ? (
          <EmptyState
            className="rounded-none border-0 shadow-none"
            tone="soft"
            icon={<Bell className="h-8 w-8" />}
            title={items.length === 0 ? 'No notifications yet' : 'No notifications in this filter'}
            description={
              items.length === 0
                ? 'New order events, reward activity, and admin review updates will appear here.'
                : 'Try switching filters to view other notification categories.'
            }
          />
        ) : (
          <div className="max-h-[25rem] overflow-y-auto divide-y divide-gray-100 md:max-h-[31rem]">
            {filteredItems.map((item, index) => (
              <motion.div
                id={`customer-notification-${item.id}`}
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`flex gap-4 px-6 py-5 ${
                  item.id === focusedNotificationId
                    ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200'
                    : item.read_at
                      ? 'bg-white'
                      : 'bg-primary/5'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  {iconByType[item.type] ?? <Bell className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-gray-950">{item.title}</h3>
                    <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm leading-6 text-gray-600">{item.message}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {item.action_url ? (
                      <button
                        type="button"
                        onClick={() => void openNotification(item)}
                        className="text-sm font-semibold text-primary hover:text-primary-dark"
                      >
                        Open
                      </button>
                    ) : null}
                    {!item.read_at ? (
                      <button
                        type="button"
                        onClick={() => void markNotificationRead(item.id)}
                        className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Mark as read
                      </button>
                    ) : null}
                    {item.action_url ? (
                      <Link to={item.action_url} className="text-xs text-slate-400 hover:text-slate-600">
                        {item.action_url}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
