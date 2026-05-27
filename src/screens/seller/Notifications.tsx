import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, ShieldCheck, Tag, Wallet, BadgeCheck, Users, Zap, Package, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from '@/src/lib/navigation';
import { useUser } from '../../context/UserContext';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '../../components/seller/SellerPageHeader';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  action_url?: string | null;
  read_at?: string | null;
  created_at?: string;
};

const sellerNotificationIconByType: Record<string, React.ReactNode> = {
  order_update: <Package className="h-5 w-5" />,
  inventory: <Package className="h-5 w-5" />,
  payout: <Wallet className="h-5 w-5" />,
  verification: <BadgeCheck className="h-5 w-5" />,
  marketing: <Tag className="h-5 w-5" />,
  community: <Users className="h-5 w-5" />,
  flash_sale: <Zap className="h-5 w-5" />,
  courier: <Truck className="h-5 w-5" />,
  security: <ShieldCheck className="h-5 w-5" />,
  account_action: <ShieldCheck className="h-5 w-5" />,
};

function refreshDashboardBadges() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dashboard-badges:refresh'));
}

export const SellerNotificationsPage = () => {
  const { token } = useUser();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedNotificationId, setFocusedNotificationId] = useState('');

  const unreadCount = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  const loadNotifications = async (options?: { silent?: boolean }) => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const response = await fetch(`/api/notifications?ts=${Date.now()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load seller notifications');
      }

      setItems(Array.isArray(payload) ? payload : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load seller notifications.');
      setItems([]);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
      refreshDashboardBadges();
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const intervalId = window.setInterval(() => {
      void loadNotifications({ silent: true });
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextNotification = params.get('notification');
    if (nextNotification) {
      setFocusedNotificationId(nextNotification);
    }
  }, []);

  useEffect(() => {
    if (!focusedNotificationId) return;

    const matched = items.find((item) => item.id === focusedNotificationId);
    if (!matched) return;

    window.requestAnimationFrame(() => {
      document.getElementById(`seller-notification-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [focusedNotificationId, items]);

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
    refreshDashboardBadges();
    return true;
  };

  const markAllRead = async () => {
    if (!token || unreadCount === 0) {
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

    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    refreshDashboardBadges();
    toast.success('All seller notifications marked as read.');
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.read_at) {
      await markNotificationRead(item.id);
    }

    if (item.action_url) {
      navigate(item.action_url);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SellerPageHeader
        eyebrow="Seller inbox"
        title="Notifications"
        description="Track order alerts, payout checks, courier issues, storefront tasks, and seller-side action prompts from one inbox."
        actions={
          <>
            <Link
              to="/seller/settings?section=notifications"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-primary/20 hover:text-primary"
            >
              Notification Settings
            </Link>
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              disabled={unreadCount === 0}
            >
              Mark All Read
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SellerStatCard label="Unread" value={unreadCount} tone={unreadCount > 0 ? 'warning' : 'success'} />
        <SellerStatCard label="Total Alerts" value={items.length} />
        <SellerStatCard
          label="Actionable"
          value={items.filter((item) => Boolean(item.action_url)).length}
          tone="default"
        />
      </div>

      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        {items.length === 0 ? (
          <div className="p-6">
            <SellerEmptyState message="No seller notifications yet. Order updates, payout reminders, and courier alerts will appear here." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <div
                id={`seller-notification-${item.id}`}
                key={item.id}
                className={`flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between ${
                  item.id === focusedNotificationId
                    ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200'
                    : item.read_at
                      ? 'bg-white'
                      : 'bg-primary/5'
                }`}
              >
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    {sellerNotificationIconByType[item.type] ?? <Bell className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {item.created_at ? new Date(item.created_at).toLocaleString() : 'No timestamp'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {item.action_url ? (
                        <button
                          type="button"
                          onClick={() => void openNotification(item)}
                          className="text-sm font-semibold text-primary hover:text-primary-dark"
                        >
                          Open action
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
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default SellerNotificationsPage;
