import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Loader2,
  Search,
  Truck,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useUser } from '@/src/context/UserContext';
import { formatPrice } from '@/src/lib/utils';
import toast from 'react-hot-toast';
import { TableSkeleton } from '@/src/components/ui/DataSkeletons';

type AdminOrder = {
  id: string;
  order_code?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  total: number;
  status: string;
  created_at: string;
  courier_provider?: string | null;
  tracking_id?: string | null;
  delivery_failure_reason?: string | null;
  shipments?: Array<{
    id: string;
    status: string;
    warehouse_name?: string | null;
    courier_provider?: string | null;
    tracking_id?: string | null;
    delivery_failure_reason?: string | null;
  }>;
  items?: Array<{
    id: string;
    sku?: string | null;
    name?: string | null;
    variant_summary?: string | null;
  }>;
};

const shipmentStatuses = [
  'pending',
  'processing',
  'packed',
  'ready_for_pickup',
  'pickup_requested',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'returned',
  'cancelled',
];

const activeStatuses = [
  'pending',
  'processing',
  'packed',
  'ready_for_pickup',
  'pickup_requested',
  'picked_up',
  'in_transit',
  'out_for_delivery',
];

const historyStatuses = ['delivered', 'delivery_failed', 'returned', 'cancelled'];

function getStatusTone(status: string) {
  switch (status) {
    case 'delivered':
      return 'bg-emerald-100 text-emerald-800';
    case 'out_for_delivery':
    case 'in_transit':
    case 'picked_up':
    case 'pickup_requested':
      return 'bg-indigo-100 text-indigo-800';
    case 'ready_for_pickup':
    case 'packed':
    case 'processing':
      return 'bg-amber-100 text-amber-800';
    case 'delivery_failed':
    case 'returned':
    case 'cancelled':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export const AdminOrdersPage = () => {
  const { token } = useUser();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'active' | 'exceptions' | 'history'>('all');
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [focusedOrderId, setFocusedOrderId] = useState('');
  const [activeRenderCount, setActiveRenderCount] = useState(18);
  const [historyRenderCount, setHistoryRenderCount] = useState(16);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/admin/orders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load orders');
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void fetchOrders();
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.get('search');
    if (nextSearch) {
      setSearch(nextSearch);
    }
  }, []);

  const handleStatusChange = async (order: AdminOrder, status: string) => {
    try {
      setUpdatingId(order.id);

      const response = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          courierProvider: order.courier_provider,
          trackingId: order.tracking_id,
          deliveryFailureReason:
            status === 'delivery_failed'
              ? order.delivery_failure_reason || 'Delivery exception requires manual follow-up'
              : null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update status');
      }

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status,
                delivery_failure_reason:
                  status === 'delivery_failed'
                    ? item.delivery_failure_reason || 'Delivery exception requires manual follow-up'
                    : status === 'returned'
                      ? item.delivery_failure_reason
                      : null,
              }
            : item,
        ),
      );
      toast.success(`Order moved to ${status.replaceAll('_', ' ')}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingId('');
    }
  };

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;

        return (
          String(order.id).toLowerCase().includes(term) ||
          String(order.order_code || '').toLowerCase().includes(term) ||
          String(order.customer_name || '').toLowerCase().includes(term) ||
          String(order.customer_email || '').toLowerCase().includes(term) ||
          String(order.courier_provider || '').toLowerCase().includes(term) ||
          String(order.tracking_id || '').toLowerCase().includes(term) ||
          String(order.status || '').toLowerCase().includes(term) ||
          (Array.isArray(order.items)
            ? order.items
                .flatMap((item) => [item.name, item.sku, item.variant_summary])
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(term)
            : false)
        );
      }),
    [orders, search],
  );

  const viewScopedOrders = useMemo(() => {
    switch (view) {
      case 'active':
        return filteredOrders.filter((order) => activeStatuses.includes(order.status));
      case 'exceptions':
        return filteredOrders.filter((order) =>
          ['delivery_failed', 'returned', 'cancelled'].includes(order.status),
        );
      case 'history':
        return filteredOrders.filter((order) => historyStatuses.includes(order.status));
      default:
        return filteredOrders;
    }
  }, [filteredOrders, view]);

  const activeOrders = useMemo(
    () => viewScopedOrders.filter((order) => activeStatuses.includes(order.status)),
    [viewScopedOrders],
  );

  const courierHistory = useMemo(
    () => viewScopedOrders.filter((order) => historyStatuses.includes(order.status)),
    [viewScopedOrders],
  );

  const renderedActiveOrders = useMemo(
    () => activeOrders.slice(0, activeRenderCount),
    [activeOrders, activeRenderCount],
  );

  const renderedCourierHistory = useMemo(
    () => courierHistory.slice(0, historyRenderCount),
    [courierHistory, historyRenderCount],
  );

  useEffect(() => {
    setActiveRenderCount(18);
    setHistoryRenderCount(16);
  }, [search, view]);

  useEffect(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      setFocusedOrderId('');
      return;
    }

    const firstMatch = viewScopedOrders[0];
    if (!firstMatch) {
      setFocusedOrderId('');
      return;
    }

    setFocusedOrderId(firstMatch.id);

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.getElementById(`admin-order-${firstMatch.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    }
  }, [search, viewScopedOrders]);

  const historySummary = useMemo(() => {
    const delivered = orders.filter((order) => order.status === 'delivered').length;
    const failed = orders.filter((order) => order.status === 'delivery_failed').length;
    const returned = orders.filter((order) => order.status === 'returned').length;

    return {
      total: orders.length,
      active: orders.filter((order) => activeStatuses.includes(order.status)).length,
      delivered,
      exceptionRate: orders.length > 0 ? Math.round(((failed + returned) / orders.length) * 100) : 0,
    };
  }, [orders]);

  const handleExport = () => {
    const headers = [
      'order_id',
      'customer',
      'email',
      'total',
      'status',
      'courier',
      'tracking',
      'shipment_count',
      'items',
      'created_at',
    ];
    const csv = [
      headers.join(','),
      ...viewScopedOrders.map((order) =>
        [
          order.order_code || order.id,
          order.customer_name || 'Customer',
          order.customer_email || '',
          order.total,
          order.status,
          order.courier_provider || '',
          order.tracking_id || '',
          Array.isArray(order.shipments) ? order.shipments.length : 0,
          Array.isArray(order.items)
            ? order.items
                .map((item) => (item.sku ? `${item.sku} ${item.name || ''}` : item.name || ''))
                .join(' | ')
            : '',
          order.created_at,
        ]
          .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin-orders-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <TableSkeleton rows={6} columns={8} />;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="mobile-sticky-toolbar flex flex-col gap-4 p-3 md:flex-row md:items-center md:justify-between md:p-0">
        <div>
          <h1 className="text-2xl font-bold">Order Management</h1>
          <p className="text-sm text-gray-500">
            Track courier progress, delivery exceptions, and customer impact.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search order, courier, tracking..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 md:py-2"
            />
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-gray-50 md:py-2"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="mobile-sticky-toolbar mt-3 flex flex-wrap gap-2 p-3 md:mt-0 md:p-0">
        {[
          { id: 'all', label: `All (${filteredOrders.length})` },
          {
            id: 'active',
            label: `Active (${filteredOrders.filter((order) => activeStatuses.includes(order.status)).length})`,
          },
          {
            id: 'exceptions',
            label: `Exceptions (${
              filteredOrders.filter((order) => ['delivery_failed', 'returned', 'cancelled'].includes(order.status))
                .length
            })`,
          },
          {
            id: 'history',
            label: `History (${filteredOrders.filter((order) => historyStatuses.includes(order.status)).length})`,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id as typeof view)}
            className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
              view === tab.id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Orders</p>
          <p className="mt-2 text-xl font-bold text-slate-900 md:text-2xl">{historySummary.total}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Active Courier Queue</p>
          <p className="mt-2 text-xl font-bold text-indigo-700 md:text-2xl">{historySummary.active}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Delivered</p>
          <p className="mt-2 text-xl font-bold text-emerald-700 md:text-2xl">{historySummary.delivered}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Exception Rate</p>
          <p className="mt-2 text-xl font-bold text-amber-700 md:text-2xl">{historySummary.exceptionRate}%</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4 md:px-6">
          <h3 className="font-bold text-slate-900">Active Courier Queue</h3>
          <p className="mt-1 text-sm text-gray-500">Monitor current pickup, transit, and delivery progress.</p>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {activeOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-gray-500">
              No active courier orders found.
            </div>
          ) : (
            renderedActiveOrders.map((order) => {
              const busy = updatingId === order.id;
              const focused = order.id === focusedOrderId;

              return (
                <div
                  id={`admin-order-${order.id}`}
                  key={order.id}
                  className={`space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
                    focused ? 'ring-2 ring-indigo-200' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">#{order.order_code || order.id}</p>
                      <p className="mt-1 text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</p>
                    </div>
                    <p className="text-sm font-bold text-primary">{formatPrice(order.total)}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{order.customer_name || 'Customer'}</p>
                    <p className="text-xs text-gray-500">{order.customer_email || 'No email'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusTone(
                        order.status,
                      )}`}
                    >
                      {order.status.replaceAll('_', ' ')}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                      {order.courier_provider || 'Courier pending'}
                    </span>
                  </div>

                  <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tracking</p>
                    <p className="font-mono text-xs font-semibold text-slate-700">{order.tracking_id || 'Pending'}</p>
                    {Array.isArray(order.shipments) && order.shipments.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {order.shipments.slice(0, 3).map((shipment) => (
                          <span
                            key={shipment.id}
                            className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600"
                          >
                            {shipment.warehouse_name || 'Pickup point'} /{' '}
                            {shipment.status.replaceAll('_', ' ')}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray(order.items) && order.items.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {order.items.slice(0, 2).map((item) => (
                          <span
                            key={item.id}
                            className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600"
                          >
                            {item.sku || 'SKU pending'}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {order.delivery_failure_reason ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {order.delivery_failure_reason}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <select
                      value={order.status}
                      onChange={(event) => void handleStatusChange(order, event.target.value)}
                      disabled={busy}
                      className={`w-full rounded-xl border-none px-3 py-2 text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-primary/20 ${getStatusTone(
                        order.status,
                      )}`}
                    >
                      {shipmentStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-5 gap-2">
                      <button
                        onClick={() => void handleStatusChange(order, 'out_for_delivery')}
                        disabled={busy}
                        className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-indigo-600 disabled:opacity-50"
                      >
                        <Truck size={16} className="mx-auto" />
                      </button>
                      <button
                        onClick={() => void handleStatusChange(order, 'delivered')}
                        disabled={busy}
                        className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-emerald-600 disabled:opacity-50"
                      >
                        <CheckCircle size={16} className="mx-auto" />
                      </button>
                      <button
                        onClick={() => void handleStatusChange(order, 'delivery_failed')}
                        disabled={busy}
                        className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-amber-600 disabled:opacity-50"
                      >
                        <AlertTriangle size={16} className="mx-auto" />
                      </button>
                      <button
                        onClick={() => void handleStatusChange(order, 'returned')}
                        disabled={busy}
                        className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-rose-600 disabled:opacity-50"
                      >
                        <Undo2 size={16} className="mx-auto" />
                      </button>
                      <button
                        onClick={() => void handleStatusChange(order, 'cancelled')}
                        disabled={busy}
                        className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-rose-700 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={16} className="mx-auto animate-spin" />
                        ) : (
                          <XCircle size={16} className="mx-auto" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {activeOrders.length > renderedActiveOrders.length ? (
          <div className="border-t border-slate-100 px-4 py-4 md:hidden">
            <button
              type="button"
              onClick={() => setActiveRenderCount((current) => current + 18)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Load more active orders
            </button>
          </div>
        ) : null}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4">Order</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Courier</th>
                <th className="px-6 py-4">Tracking</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Exception</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No active courier orders found.
                  </td>
                </tr>
              ) : (
                renderedActiveOrders.map((order) => {
                  const busy = updatingId === order.id;
                  const focused = order.id === focusedOrderId;

                  return (
                    <tr
                      id={`admin-order-${order.id}`}
                      key={order.id}
                      className={`text-sm transition-colors hover:bg-gray-50 ${
                        focused ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200' : ''
                      }`}
                    >
                      <td className="px-6 py-4 font-medium">#{order.order_code || order.id}</td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold">{order.customer_name || 'Customer'}</p>
                          <p className="text-xs text-gray-500">{order.customer_email || 'No email'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-primary">{formatPrice(order.total)}</td>
                      <td className="px-6 py-4">
                        {order.courier_provider ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                            {order.courier_provider}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Not assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {order.tracking_id ? (
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {order.tracking_id}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Pending</span>
                        )}
                        {Array.isArray(order.shipments) && order.shipments.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-[11px] text-slate-500">
                              {order.shipments.length} shipment{order.shipments.length > 1 ? 's' : ''}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {order.shipments.slice(0, 3).map((shipment) => (
                                <span
                                  key={shipment.id}
                                  className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600"
                                >
                                  {shipment.warehouse_name || 'Pickup point'} /{' '}
                                  {shipment.status.replaceAll('_', ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {Array.isArray(order.items) && order.items.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {order.items.slice(0, 2).map((item) => (
                              <span
                                key={item.id}
                                className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600"
                              >
                                {item.sku || 'SKU pending'}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={order.status}
                          onChange={(event) => void handleStatusChange(order, event.target.value)}
                          disabled={busy}
                          className={`rounded-full border-none px-2 py-1 text-[10px] font-bold uppercase tracking-wider focus:ring-2 focus:ring-primary/20 ${getStatusTone(
                            order.status,
                          )}`}
                        >
                          {shipmentStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        {order.delivery_failure_reason ? (
                          <div className="max-w-[180px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {order.delivery_failure_reason}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => void handleStatusChange(order, 'out_for_delivery')}
                            disabled={busy}
                            className="p-2 text-gray-400 transition-colors hover:text-indigo-600 disabled:opacity-50"
                            title="Mark out for delivery"
                          >
                            <Truck size={18} />
                          </button>
                          <button
                            onClick={() => void handleStatusChange(order, 'delivered')}
                            disabled={busy}
                            className="p-2 text-gray-400 transition-colors hover:text-emerald-600 disabled:opacity-50"
                            title="Mark delivered"
                          >
                            <CheckCircle size={18} />
                          </button>
                          <button
                            onClick={() => void handleStatusChange(order, 'delivery_failed')}
                            disabled={busy}
                            className="p-2 text-gray-400 transition-colors hover:text-amber-600 disabled:opacity-50"
                            title="Mark delivery failed"
                          >
                            <AlertTriangle size={18} />
                          </button>
                          <button
                            onClick={() => void handleStatusChange(order, 'returned')}
                            disabled={busy}
                            className="p-2 text-gray-400 transition-colors hover:text-rose-600 disabled:opacity-50"
                            title="Mark returned"
                          >
                            <Undo2 size={18} />
                          </button>
                          <button
                            onClick={() => void handleStatusChange(order, 'cancelled')}
                            disabled={busy}
                            className="p-2 text-gray-400 transition-colors hover:text-rose-700 disabled:opacity-50"
                            title="Cancel order"
                          >
                            {busy ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {activeOrders.length > renderedActiveOrders.length ? (
          <div className="hidden border-t border-slate-100 px-6 py-4 md:block">
            <button
              type="button"
              onClick={() => setActiveRenderCount((current) => current + 18)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Load more active orders
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 md:px-6">
          <div>
            <h3 className="font-bold text-slate-900">Courier History</h3>
            <p className="mt-1 text-sm text-gray-500">
              Review completed, failed, returned, and cancelled courier outcomes.
            </p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {courierHistory.length} records
          </div>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {courierHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-gray-500">
              No courier history records found.
            </div>
          ) : (
            renderedCourierHistory.map((order) => (
              <div
                id={`admin-order-${order.id}`}
                key={order.id}
                className={`space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
                  order.id === focusedOrderId ? 'ring-2 ring-indigo-200' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">#{order.order_code || order.id}</p>
                    <p className="mt-1 text-xs text-gray-500">{order.customer_name || 'Customer'}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusTone(
                      order.status,
                    )}`}
                  >
                    {order.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                  <p>{order.customer_email || 'No email'}</p>
                  <p className="mt-1 font-semibold">{order.courier_provider || 'Not assigned'}</p>
                  <p className="mt-1 font-mono">{order.tracking_id || 'Pending'}</p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {courierHistory.length > renderedCourierHistory.length ? (
          <div className="border-t border-slate-100 px-4 py-4 md:hidden">
            <button
              type="button"
              onClick={() => setHistoryRenderCount((current) => current + 16)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Load more history
            </button>
          </div>
        ) : null}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4">Order</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Courier</th>
                <th className="px-6 py-4">Tracking</th>
                <th className="px-6 py-4">Final Status</th>
                <th className="px-6 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {courierHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No courier history records found.
                  </td>
                </tr>
              ) : (
                renderedCourierHistory.map((order) => (
                  <tr
                    id={`admin-order-${order.id}`}
                    key={order.id}
                    className={`text-sm transition-colors hover:bg-gray-50 ${
                      order.id === focusedOrderId ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200' : ''
                    }`}
                  >
                    <td className="px-6 py-4 font-medium">#{order.order_code || order.id}</td>
                    <td className="px-6 py-4">
                      <p className="font-bold">{order.customer_name || 'Customer'}</p>
                      <p className="text-xs text-gray-500">{order.customer_email || 'No email'}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                      {order.courier_provider || 'Not assigned'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-semibold text-slate-700">
                        {order.tracking_id || 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusTone(
                          order.status,
                        )}`}
                      >
                        {order.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {courierHistory.length > renderedCourierHistory.length ? (
          <div className="hidden border-t border-slate-100 px-6 py-4 md:block">
            <button
              type="button"
              onClick={() => setHistoryRenderCount((current) => current + 16)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Load more history
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
