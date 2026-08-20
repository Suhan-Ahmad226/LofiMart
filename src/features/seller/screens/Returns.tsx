import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, ShieldAlert } from 'lucide-react';
import { Link } from '../../../lib/navigation';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '@/features/seller/components/SellerPageHeader';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';

const RETURN_STATUSES = ['returned', 'cancelled', 'delivery_failed', 'return_in_transit'];

export const SellerReturnsPage = () => {
  const { token } = useUser();
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

    fetch('/api/seller/orders', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Failed to load return orders');
        if (!mounted) return;
        setOrders(Array.isArray(payload) ? payload : []);
      })
      .catch((requestError: unknown) => {
        if (!mounted) return;
        setOrders([]);
        setError(requestError instanceof Error ? requestError.message : 'Failed to load returns.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const returnOrders = useMemo(
    () =>
      orders.filter((order) => {
        const orderStatus = String(order.status || '').toLowerCase();
        if (RETURN_STATUSES.includes(orderStatus)) return true;
        return Array.isArray(order.shipments)
          ? order.shipments.some((shipment: any) => RETURN_STATUSES.includes(String(shipment?.status || '').toLowerCase()))
          : false;
      }),
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
        eyebrow="Post-delivery exceptions"
        title="Returns"
        description="Track returned, cancelled, and failed-delivery orders that need seller attention or stock reconciliation."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SellerStatCard label="Exception orders" value={returnOrders.length} />
        <SellerStatCard label="All seller orders" value={orders.length} />
      </div>

      <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <RotateCcw size={18} className="text-rose-500" />
          <h2 className="text-lg font-bold text-slate-950">Return queue</h2>
        </div>
        <div className="mt-5 space-y-3">
          {returnOrders.length === 0 ? (
            <SellerEmptyState message="No return or failed-delivery cases are open right now." />
          ) : (
            returnOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">#{order.order_code || order.id}</p>
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">{String(order.status || 'exception')}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {Array.isArray(order.items) && order.items.length > 0 ? order.items.map((item: any) => item.name || item.sku || 'Item').join(', ') : 'Order items unavailable'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{order.created_at ? new Date(order.created_at).toLocaleString() : 'No timestamp'} â€¢ {formatPrice(Number(order.total || 0))}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ShieldAlert size={16} className="text-amber-500" />
                    <Link to={`/seller/orders?search=${encodeURIComponent(String(order.order_code || order.id))}`} className="text-sm font-semibold text-primary">
                      Open order
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default SellerReturnsPage;
