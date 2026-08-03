import React, { useEffect, useMemo, useState } from 'react';
import { Search, Download, Loader2, Clock3, Truck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatPrice } from '../../../lib/utils';
import { useUser } from '../../../features/shared/state/UserContext';
import { Link } from '../../../lib/navigation';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '../../../components/seller/SellerPageHeader';

export const SellerOrdersPage = () => {
  const { token } = useUser();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'processing' | 'packed' | 'ready_to_ship' | 'in_transit' | 'delivered' | 'returned' | 'failed_delivery'>('all');

  useEffect(() => {
    if (!token) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    fetch('/api/seller/orders', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load orders');
        }
        return data;
      })
      .then((data) => {
        if (isMounted) {
          setOrders(Array.isArray(data) ? data : []);
          setError('');
        }
      })
      .catch((err) => {
        if (isMounted) {
          setOrders([]);
          setError(err instanceof Error ? err.message : 'Failed to load orders');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.get('search');
    if (nextSearch) {
      setSearch(nextSearch);
    }
  }, []);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'shipped':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyBadge = (order: any) => {
    const ageHours = getOrderAgeHours(order);
    if (ageHours >= 48) return { label: 'Critical', className: 'bg-rose-100 text-rose-700' };
    if (ageHours >= 24) return { label: 'Aging', className: 'bg-amber-100 text-amber-700' };
    return { label: 'Fresh', className: 'bg-emerald-100 text-emerald-700' };
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      const response = await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update order');
      }
      setOrders((current) => current.map((o) => (o.id === id ? { ...o, status } : o)));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order');
    }
  };

  const orderMetrics = useMemo(() => {
    const stateCounts = orders.reduce<Record<string, number>>((acc, order) => {
      const state = getOperationalOrderState(order);
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, {});

    return {
      total: orders.length,
      newOrders: stateCounts.new || 0,
      processingOrders: stateCounts.processing || 0,
      packed: stateCounts.packed || 0,
      readyToShip: stateCounts.ready_to_ship || 0,
      inTransit: stateCounts.in_transit || 0,
      deliveredOrders: stateCounts.delivered || 0,
      returned: stateCounts.returned || 0,
      failedDelivery: stateCounts.failed_delivery || 0,
    };
  }, [orders]);

  const filteredOrders = orders.filter((order) => {
    const term = search.trim().toLowerCase();
    const operationalState = getOperationalOrderState(order);
    const matchesTab = activeTab === 'all' ? true : operationalState === activeTab;

    if (!matchesTab) return false;
    if (!term) return true;
    const shipmentSummary = Array.isArray(order.shipments)
      ? order.shipments
          .flatMap((shipment: any) => [
            shipment.warehouse_name,
            shipment.courier_provider,
            shipment.tracking_id,
            shipment.status,
          ])
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      : '';
    const itemSummary = Array.isArray(order.items)
      ? order.items
          .flatMap((item: any) => [item.name, item.sku, item.variant_summary])
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      : '';

    return (
      `#${String(order.order_code || order.id)}`.toLowerCase().includes(term) ||
      String(order.status || '').toLowerCase().includes(term) ||
      String(order.courier_provider || '').toLowerCase().includes(term) ||
      String(order.tracking_id || '').toLowerCase().includes(term) ||
      shipmentSummary.includes(term) ||
      itemSummary.includes(term)
    );
  });

  const orderTabs = [
    { id: 'all', label: 'All orders', count: orderMetrics.total },
    { id: 'new', label: 'New', count: orderMetrics.newOrders },
    { id: 'processing', label: 'Processing', count: orderMetrics.processingOrders },
    { id: 'packed', label: 'Packed', count: orderMetrics.packed },
    { id: 'ready_to_ship', label: 'Ready to Ship', count: orderMetrics.readyToShip },
    { id: 'in_transit', label: 'In Transit', count: orderMetrics.inTransit },
    { id: 'delivered', label: 'Delivered', count: orderMetrics.deliveredOrders },
    { id: 'returned', label: 'Returned', count: orderMetrics.returned },
    { id: 'failed_delivery', label: 'Failed Delivery', count: orderMetrics.failedDelivery },
  ] as const;

  const handleExport = () => {
    const rows = filteredOrders.map((order) => ({
      order_id: String(order.order_code || order.id),
      date: new Date(order.created_at).toISOString(),
      total: order.total,
      status: order.status,
      shipment_count: Array.isArray(order.shipments) ? order.shipments.length : 0,
      courier: Array.isArray(order.shipments)
        ? order.shipments.map((shipment: any) => shipment.courier_provider || 'pending').join(' | ')
        : order.courier_provider || '',
      tracking: Array.isArray(order.shipments)
        ? order.shipments.map((shipment: any) => shipment.tracking_id || 'pending').join(' | ')
        : order.tracking_id || '',
      warehouses: Array.isArray(order.shipments)
        ? order.shipments.map((shipment: any) => shipment.warehouse_name || 'Pickup point').join(' | ')
        : '',
      items: Array.isArray(order.items)
        ? order.items.map((item: any) => (item.sku ? `${item.sku} ${item.name || ''}` : item.name || '')).join(' | ')
        : '',
    }));

    const headers = ['order_id', 'date', 'total', 'status', 'shipment_count', 'courier', 'tracking', 'warehouses', 'items'];
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String((row as any)[header] ?? '').replaceAll('"', '""')}"`)
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `seller-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <SellerPageHeader
        eyebrow="Order workspace"
        title="Seller Orders"
        description="Review new demand, move shipments forward, and keep courier pressure visible from one workspace."
        actions={
          <>
            <button
              onClick={handleExport}
              className="inline-flex h-11 items-center justify-center space-x-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-primary/20 hover:text-primary"
            >
              <Download size={18} />
              <span>Export CSV</span>
            </button>
            <Link
              to="/seller/courier"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open courier
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SellerStatCard label="New" value={orderMetrics.newOrders} tone="warning" />
        <SellerStatCard label="Processing" value={orderMetrics.processingOrders} />
        <SellerStatCard label="Ready to Ship" value={orderMetrics.readyToShip} />
        <SellerStatCard label="Delivered" value={orderMetrics.deliveredOrders} tone="success" />
      </div>

      <div className="sticky top-[5.5rem] z-10 space-y-4 rounded-[1.75rem] border border-black/5 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
        <div className="dashboard-chip-scroll -mx-1 flex gap-2 overflow-x-auto px-1">
          {orderTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-primary/20 hover:text-primary'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  activeTab === tab.id ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search order, status, courier, tracking, warehouse, or item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
            {filteredOrders.length} of {orders.length} orders visible
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-sm">
        <div className="space-y-3 p-4 md:hidden">
          {filteredOrders.length === 0 ? (
            <SellerEmptyState message="No orders found for this filter yet." />
          ) : (
            filteredOrders.map((order) => (
              <div key={order.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">#{order.order_code || order.id}</p>
                    <p className="mt-1 text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{formatPrice(order.total)}</p>
                    <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getUrgencyBadge(order).className}`}>
                      {getUrgencyBadge(order).label}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Shipment Summary
                  </p>
                  {Array.isArray(order.shipments) && order.shipments.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-gray-500">
                        {order.shipments.length} shipment{order.shipments.length > 1 ? 's' : ''}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {order.shipments.slice(0, 3).map((shipment: any) => (
                          <span
                            key={shipment.id}
                            className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600"
                          >
                            {shipment.warehouse_name || 'Pickup point'} /{' '}
                            {shipment.courier_provider || 'courier pending'}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {order.shipments
                          .slice(0, 2)
                          .map((shipment: any) => shipment.tracking_id || 'tracking pending')
                          .join(' / ')}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-400">No shipment summary yet</p>
                  )}
                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {order.items.slice(0, 2).map((item: any) => (
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

                <div className="space-y-3">
                  <select
                    value={order.status}
                    onChange={(e) => updateStatus(order.id, e.target.value)}
                    className={`w-full cursor-pointer rounded-xl border-none px-3 py-2 text-xs font-bold uppercase tracking-wider focus:ring-2 focus:ring-primary/20 ${getStatusStyle(order.status)}`}
                  >
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <a
                    href={`/seller/courier?search=${encodeURIComponent(
                      Array.isArray(order.shipments) && order.shipments.length > 0
                        ? order.shipments[0]?.tracking_id ||
                            order.shipments[0]?.id ||
                            String(order.order_code || order.id)
                        : String(order.order_code || order.id),
                    )}`}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-gray-50"
                  >
                    Open courier
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4">Order ID</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Shipment Summary</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Route</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex justify-center">
                      <div className="w-full max-w-md">
                        <SellerEmptyState message="No orders found for this filter yet." />
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="group transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-gray-900">#{order.order_code || order.id}</p>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getUrgencyBadge(order).className}`}>
                          {getUrgencyBadge(order).label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm font-bold text-primary">{formatPrice(order.total)}</td>
                    <td className="px-6 py-4">
                      {Array.isArray(order.shipments) && order.shipments.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">
                            {order.shipments.length} shipment{order.shipments.length > 1 ? 's' : ''}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {order.shipments.slice(0, 3).map((shipment: any) => (
                              <span
                                key={shipment.id}
                                className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600"
                              >
                                {shipment.warehouse_name || 'Pickup point'} /{' '}
                                {shipment.courier_provider || 'courier pending'}
                              </span>
                            ))}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {order.shipments
                              .slice(0, 2)
                              .map((shipment: any) => shipment.tracking_id || 'tracking pending')
                              .join(' / ')}
                          </div>
                          {Array.isArray(order.items) && order.items.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {order.items.slice(0, 2).map((item: any) => (
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
                      ) : (
                        <span className="text-xs text-gray-400">No shipment summary yet</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {Array.isArray(order.shipments) && order.shipments.length > 0 ? (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {order.shipments.slice(0, 2).map((shipment: any) => (
                            <span
                              key={shipment.id}
                              className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600"
                            >
                              {shipment.warehouse_name || 'Pickup point'} /{' '}
                              {String(shipment.status).replaceAll('_', ' ')}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <select
                        value={order.status}
                        onChange={(e) => updateStatus(order.id, e.target.value)}
                        className={`cursor-pointer rounded-full border-none px-2 py-1 text-[10px] font-bold uppercase tracking-wider focus:ring-2 focus:ring-primary/20 ${getStatusStyle(order.status)}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={`/seller/courier?search=${encodeURIComponent(
                          Array.isArray(order.shipments) && order.shipments.length > 0
                            ? order.shipments[0]?.tracking_id ||
                                order.shipments[0]?.id ||
                                String(order.order_code || order.id)
                            : String(order.order_code || order.id),
                        )}`}
                        className="inline-flex rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-gray-50"
                      >
                        Open courier
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
  const getShipmentStatuses = (order: any) =>
    Array.isArray(order.shipments)
      ? order.shipments.map((shipment: any) => String(shipment?.status || '').toLowerCase())
      : [];

  const getOrderAgeHours = (order: any) => {
    const createdAt = new Date(order.created_at).getTime();
    if (Number.isNaN(createdAt)) return 0;
    return Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60));
  };

  const getOperationalOrderState = (order: any) => {
    const normalizedStatus = String(order.status || '').toLowerCase();
    const shipmentStatuses = getShipmentStatuses(order);

    if (normalizedStatus === 'delivered') return 'delivered';
    if (normalizedStatus === 'returned') return 'returned';
    if (normalizedStatus === 'cancelled' || shipmentStatuses.some((status: string) => ['failed', 'failed_delivery', 'delivery_failed'].includes(status))) {
      return 'failed_delivery';
    }
    if (shipmentStatuses.some((status: string) => ['shipped', 'in_transit', 'out_for_delivery'].includes(status))) {
      return 'in_transit';
    }
    if (shipmentStatuses.some((status: string) => ['ready_for_pickup', 'pickup_requested', 'ready_to_ship'].includes(status))) {
      return 'ready_to_ship';
    }
    if (shipmentStatuses.some((status: string) => ['packed', 'package_ready'].includes(status))) {
      return 'packed';
    }
    if (normalizedStatus === 'processing') return 'processing';
    return 'new';
  };
