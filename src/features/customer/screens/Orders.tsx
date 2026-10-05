import React, { useState, useEffect, useMemo } from 'react';
import { Package, Clock, ChevronRight, AlertCircle, Truck, Loader2 } from 'lucide-react';
import { formatPrice } from '../../../lib/utils';
import { Link, useNavigate, useSearchParams } from '../../../lib/navigation';
import { useUser } from '../../../features/shared/state/UserContext';
import { useCart } from '../../../features/shop/state/CartContext';
import { ListCardSkeleton } from '@/features/shared/ui/DataSkeletons';
import { EmptyState } from '@/features/shared/ui/FeedbackState';
import toast from '@/lib/toast';

type CustomerOrder = { id: string | number; order_code?: string | null; created_at: string; status?: string | null; total?: number | string | null; courier_provider?: string | null; tracking_id?: string | null; shipments?: Array<{ id: string | number; warehouse_name?: string | null; status?: string | null; provider_status?: string | null }>; items?: Array<{ id: string | number; sku?: string | null }>; can_edit?: boolean; can_cancel?: boolean; customer_action_block_reason?: string | null };

export const CustomerOrdersPage = () => {
  const [searchParams] = useSearchParams();
  const urlOrder = searchParams.get('order') || '';
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedOrderId, setFocusedOrderId] = useState('');
  const [editingOrderId, setEditingOrderId] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState('');
  const { token } = useUser();
  const { replaceCart } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true); setError('');
        const response = await fetch('/api/orders/my-orders', { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Failed to fetch orders');
        const list = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : [];
        setOrders(list as CustomerOrder[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch orders'); setOrders([]);
      } finally { setLoading(false); }
    };
    if (token) void fetchOrders(); else { setOrders([]); setLoading(false); }
  }, [token]);

  const getCourierEventSummary = (shipment: CustomerOrder['shipments'][number]) => {
    const providerStatus = typeof shipment?.provider_status === 'string' ? shipment.provider_status.trim() : '';
    return providerStatus ? providerStatus.replaceAll('_', ' ').replaceAll('.', ' ') : null;
  };

  const visibleOrders = useMemo(() => !focusedOrderId ? orders : orders.filter((order) => String(order.id) === focusedOrderId || String(order.order_code || '').toLowerCase() === focusedOrderId.toLowerCase()), [orders, focusedOrderId]);

  useEffect(() => { if (urlOrder) setFocusedOrderId(urlOrder); }, [urlOrder]);

  const handleCancelOrder = async (order: CustomerOrder) => {
    if (!window.confirm(`Cancel order #${order.order_code || order.id}? This action cannot be undone.`)) return;
    try {
      setCancellingOrderId(String(order.id));
      const response = await fetch(`/api/orders/${order.id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to cancel order');
      setOrders((current) => current.map((entry) => String(entry.id) === String(order.id) ? { ...entry, ...(payload?.order || {}) } : entry));
      toast.success('Order cancelled successfully.');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to cancel order');
    } finally { setCancellingOrderId(''); }
  };

  const handleEditOrder = async (order: CustomerOrder) => {
    if (!window.confirm(`Move order #${order.order_code || order.id} back to your cart for editing?`)) return;
    try {
      setEditingOrderId(String(order.id));
      const response = await fetch(`/api/orders/${order.id}/edit`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Failed to reopen order for editing');
      if (!Array.isArray(payload?.cart_items) || payload.cart_items.length === 0) throw new Error('This order could not be restored to your cart.');
      replaceCart(payload.cart_items); toast.success('Order moved back to your cart for editing.'); navigate('/cart');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to reopen order for editing');
    } finally { setEditingOrderId(''); }
  };

  if (loading) return <ListCardSkeleton rows={5} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Orders</h1>
      {error && <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800"><div className="flex items-center gap-2"><AlertCircle size={20} /><span className="font-medium">{error}</span></div><button type="button" onClick={() => window.location.reload()} className="text-sm font-semibold underline">Retry</button></div>}
      {visibleOrders.length === 0 ? (
        <EmptyState icon={<Package className="h-8 w-8" />} title="You haven't placed any orders yet" description="Your upcoming purchases, tracking updates, and delivery history will appear here." actions={<Link to="/shop" className="btn-primary inline-block px-8">Start Shopping</Link>} />
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => (
            <div id={`customer-order-${order.id}`} key={order.id} className={`flex flex-col gap-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between md:p-6 ${String(order.id) === focusedOrderId || String(order.order_code || '').toLowerCase() === focusedOrderId.toLowerCase() ? 'border-indigo-300 bg-indigo-50/30 ring-2 ring-indigo-200' : ''}`}>
              <div className="flex items-center space-x-3 md:space-x-4"><div className="rounded-xl bg-gray-50 p-2.5 md:p-3"><Package className="text-gray-400" /></div><div><p className="font-bold">Order #{order.order_code || order.id}</p><p className="text-sm text-gray-500">Placed on {new Date(order.created_at).toLocaleDateString()}</p></div></div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between md:gap-8">
                <div className="text-left"><p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Status</p><div className="flex items-center space-x-1 text-primary"><Clock size={14} /><span className="text-sm font-bold capitalize">{String(order.status || 'unknown').replaceAll('_', ' ')}</span></div>
                  {order.courier_provider || order.tracking_id ? <div className="mt-2 flex items-center space-x-1 text-[11px] text-gray-500"><Truck size={12} /><span>{order.courier_provider || 'Courier'}{order.tracking_id ? ` / ${order.tracking_id}` : ''}</span></div> : null}
                  {Array.isArray(order.shipments) && order.shipments.length > 0 ? <div className="mt-2 space-y-1"><p className="text-[11px] text-gray-500">{order.shipments.length} shipment{order.shipments.length > 1 ? 's' : ''} in this order</p><div className="flex flex-wrap gap-1">{order.shipments.slice(0, 3).map((shipment) => <span key={shipment.id} className="dashboard-stat-chip bg-slate-100 text-slate-600">{shipment.warehouse_name || 'Pickup point'} / {String(shipment.status || 'pending').replaceAll('_', ' ')}</span>)}</div>{getCourierEventSummary(order.shipments[0]) ? <p className="text-[11px] text-rose-700">Courier update: {getCourierEventSummary(order.shipments[0])}</p> : null}</div> : null}
                  {Array.isArray(order.items) && order.items.length > 0 ? <div className="mt-2 flex flex-wrap gap-1">{order.items.slice(0, 2).map((item) => <span key={item.id} className="dashboard-stat-chip bg-slate-100 text-slate-600">{item.sku || 'SKU pending'}</span>)}</div> : null}
                  {order.can_edit || order.can_cancel ? <div className="mt-3 flex flex-wrap items-center gap-2"><span className="dashboard-stat-chip bg-emerald-50 text-emerald-700 uppercase tracking-wider">Available actions</span>{order.can_edit ? <button type="button" onClick={() => void handleEditOrder(order)} disabled={editingOrderId === String(order.id) || cancellingOrderId === String(order.id)} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{editingOrderId === String(order.id) ? <Loader2 size={14} className="animate-spin" /> : 'Edit order'}</button> : null}{order.can_cancel ? <button type="button" onClick={() => void handleCancelOrder(order)} disabled={cancellingOrderId === String(order.id) || editingOrderId === String(order.id)} className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">{cancellingOrderId === String(order.id) ? <Loader2 size={14} className="animate-spin" /> : 'Cancel order'}</button> : null}</div> : null}
                  {!order.can_edit && !order.can_cancel && order.customer_action_block_reason ? <p className="mt-3 text-[11px] text-slate-500">{order.customer_action_block_reason}</p> : null}
                </div>
                <div className="flex items-center justify-between sm:justify-start sm:gap-6"><div className="text-left"><p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Total</p><p className="font-bold">{formatPrice(Number(order.total ?? 0))}</p></div><Link to={`/account/orders/${order.id}`} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-gray-50"><span>Open order</span><ChevronRight size={16} className="text-gray-400" /></Link></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};