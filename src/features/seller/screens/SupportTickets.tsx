import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, MessageSquareWarning } from 'lucide-react';
import { Link } from '../../../lib/navigation';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '@/features/seller/components/SellerPageHeader';
import { useUser } from '../../../features/shared/state/UserContext';

type UserNotification = {
  id: string;
  title: string;
  message: string;
  read_at?: string | null;
  created_at?: string;
};

export const SellerSupportTicketsPage = () => {
  const { token } = useUser();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError('');

    Promise.all([
      fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/seller/orders', { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(async ([notificationsRes, ordersRes]) => {
        const notificationsPayload = await notificationsRes.json().catch(() => null);
        const ordersPayload = await ordersRes.json().catch(() => null);
        if (!notificationsRes.ok) throw new Error(notificationsPayload?.error || 'Failed to load notifications');
        if (!ordersRes.ok) throw new Error(ordersPayload?.error || 'Failed to load seller orders');
        if (!mounted) return;
        setNotifications(Array.isArray(notificationsPayload) ? notificationsPayload : []);
        setOrders(Array.isArray(ordersPayload) ? ordersPayload : []);
      })
      .catch((requestError: unknown) => {
        if (!mounted) return;
        setNotifications([]);
        setOrders([]);
        setError(requestError instanceof Error ? requestError.message : 'Failed to load support operations.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const unreadNotifications = useMemo(() => notifications.filter((notification) => !notification.read_at), [notifications]);
  const issueOrders = useMemo(
    () => orders.filter((order) => ['cancelled', 'returned', 'delivery_failed'].includes(String(order.status || '').toLowerCase())),
    [orders],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <SellerPageHeader
        eyebrow="Seller inbox"
        title="Support Tickets"
        description="Review customer-impacting alerts, unread notifications, and issue orders that may require support follow-up."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SellerStatCard label="Unread alerts" value={unreadNotifications.length} />
        <SellerStatCard label="Issue orders" value={issueOrders.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Bell size={18} className="text-primary" />
            <h2 className="text-lg font-bold text-slate-950">Unread notifications</h2>
          </div>
          <div className="mt-5 space-y-3">
            {unreadNotifications.length === 0 ? (
              <SellerEmptyState message="No unread seller notifications right now." />
            ) : (
              unreadNotifications.slice(0, 12).map((notification) => (
                <div key={notification.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="font-semibold text-slate-900">{notification.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{notification.message}</p>
                  <p className="mt-2 text-xs text-slate-500">{notification.created_at ? new Date(notification.created_at).toLocaleString() : 'No timestamp'}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <MessageSquareWarning size={18} className="text-amber-500" />
            <h2 className="text-lg font-bold text-slate-950">Orders needing follow-up</h2>
          </div>
          <div className="mt-5 space-y-3">
            {issueOrders.length === 0 ? (
              <SellerEmptyState message="No cancelled, returned, or failed-delivery orders need support follow-up right now." />
            ) : (
              issueOrders.slice(0, 12).map((order) => (
                <div key={order.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">#{order.order_code || order.id}</p>
                      <p className="mt-1 text-xs text-slate-500">{String(order.status || '').replaceAll('_', ' ')}</p>
                    </div>
                    <Link to={`/seller/orders?search=${encodeURIComponent(String(order.order_code || order.id))}`} className="text-sm font-semibold text-primary">
                      Open
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SellerSupportTicketsPage;
