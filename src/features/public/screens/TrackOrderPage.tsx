import React, { useCallback, useEffect, useState } from 'react';
import { Search, Package, Truck, CheckCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSearchParams } from '../../../lib/navigation';

interface TrackingStep {
  label: string;
  date: string;
  completed: boolean;
}

interface ShipmentItem {
  id: string;
  name?: string;
  sku?: string | null;
  quantity?: number;
}

interface TrackingShipment {
  id: string;
  status: string;
  item_count?: number;
  warehouse_name?: string | null;
  warehouse_city?: string | null;
  courier_provider?: string | null;
  tracking_id?: string | null;
  pickup_requested_at?: string | null;
  picked_up_at?: string | null;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
  delivery_failure_reason?: string | null;
  shipment_metadata?: Record<string, unknown> | null;
  items?: ShipmentItem[];
}

interface TrackingResult {
  id: string;
  order_code?: string | null;
  status: string;
  courier_provider?: string | null;
  tracking_id?: string | null;
  delivery_failure_reason?: string | null;
  shipments?: TrackingShipment[];
  steps: TrackingStep[];
}

export const TrackOrderPage = () => {
  const [searchParams] = useSearchParams();
  const urlOrder = (searchParams.get('order') || searchParams.get('search') || '').toUpperCase();
  const urlShipment = searchParams.get('shipment') || '';
  const [orderId, setOrderId] = useState('');
  const [tracking, setTracking] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState('');
  const [focusedShipmentId, setFocusedShipmentId] = useState('');

  const getPathaoEventSummary = (shipment: TrackingShipment) => {
    const metadata =
      shipment?.shipment_metadata && typeof shipment.shipment_metadata === 'object'
        ? shipment.shipment_metadata
        : {};

    const lastEvent = typeof metadata.pathaoLastEvent === 'string' ? metadata.pathaoLastEvent : null;
    const lastStatusSlug = typeof metadata.pathaoLastStatusSlug === 'string' ? metadata.pathaoLastStatusSlug : null;

    if (!lastEvent && !lastStatusSlug) return null;

    return {
      event: lastEvent ? lastEvent.replaceAll('_', ' ').replaceAll('.', ' ') : null,
      status: lastStatusSlug ? lastStatusSlug.replaceAll('_', ' ') : null,
    };
  };

  const runTrack = useCallback(async (code: string) => {
    const targetValue = code.trim();
    if (!targetValue) return;
    setTracking(true);
    setResult(null);
    setError('');

    try {
      const response = await fetch(`/api/orders/track/${encodeURIComponent(targetValue)}`);
      const data: {
        id: string | number;
        status: string;
        courier_provider?: string | null;
        tracking_id?: string | null;
        delivery_failure_reason?: string | null;
        shipments?: TrackingShipment[];
        steps: TrackingStep[];
        error?: string;
      } = await response.json();

      if (!response.ok) throw new Error(data.error || 'Order not found');

      setResult({
        id: `ASB-${data.id}`,
        order_code: (data as any).order_code ?? null,
        status: data.status,
        courier_provider: data.courier_provider ?? null,
        tracking_id: data.tracking_id ?? null,
        delivery_failure_reason: data.delivery_failure_reason ?? null,
        shipments: Array.isArray(data.shipments) ? data.shipments : [],
        steps: data.steps,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to track this order right now.');
    } finally {
      setTracking(false);
    }
  }, []);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    await runTrack(orderId);
  };

  useEffect(() => {
    if (!urlOrder) return;
    setOrderId(urlOrder);
    void runTrack(urlOrder);
  }, [runTrack, urlOrder]);

  useEffect(() => {
    if (urlShipment) {
      setFocusedShipmentId(urlShipment);
    }
  }, [urlShipment]);

  useEffect(() => {
    if (!result || !focusedShipmentId) return;

    const matched = result.shipments?.find((shipment) => shipment.id === focusedShipmentId);
    if (!matched || typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      document.getElementById(`customer-track-shipment-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [result, focusedShipmentId]);

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-20">
      <div className="space-y-4 text-center">
        <h1 className="font-display text-4xl font-bold">Track Your Order</h1>
        <p className="text-gray-500">Enter your order ID to see the latest packing, pickup, transit, and delivery milestones.</p>
      </div>

      <div className="rounded-3xl border border-black/5 bg-white p-8 shadow-xl">
        <form onSubmit={handleTrack} className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              required
              value={orderId}
              onChange={(e) => setOrderId(e.target.value.toUpperCase())}
              placeholder="Order ID (for example: ORD-AB12CD34)"
              className="w-full rounded-2xl border-none bg-bg-light py-4 pl-12 pr-4 transition-all focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            disabled={tracking}
            className="btn-primary flex items-center justify-center space-x-2 px-10 py-4 disabled:opacity-50"
          >
            {tracking ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Search size={20} />
                <span>Track Now</span>
              </>
            )}
          </button>
        </form>
        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8 rounded-3xl border border-black/5 bg-white p-8 shadow-sm"
        >
          <div className="flex flex-col justify-between gap-4 border-b border-gray-100 pb-6 md:flex-row md:items-center">
            <div>
              <p className="text-sm text-gray-500">Order ID</p>
              <p className="text-xl font-bold">{result.order_code || result.id}</p>
              {result.courier_provider || result.tracking_id ? (
                <div className="mt-3 space-y-1 text-sm text-gray-500">
                  {result.courier_provider ? <p>Courier: <span className="font-semibold text-gray-900">{result.courier_provider}</span></p> : null}
                  {result.tracking_id ? <p>Tracking ID: <span className="font-semibold text-gray-900">{result.tracking_id}</span></p> : null}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Current Status</p>
              <div className="flex items-center space-x-2 text-primary">
                <Truck size={20} />
                <span className="text-xl font-bold capitalize">{result.status.replaceAll('_', ' ')}</span>
              </div>
            </div>
          </div>

          {result.delivery_failure_reason ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Delivery note: {result.delivery_failure_reason}
            </div>
          ) : null}

          {Array.isArray(result.shipments) && result.shipments.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-black/5 bg-gray-50 p-5">
              <p className="text-sm font-bold">Shipment Breakdown</p>
              {result.shipments.map((shipment) => {
                const pathaoEventSummary = getPathaoEventSummary(shipment);

                return (
                <div
                  id={`customer-track-shipment-${shipment.id}`}
                  key={shipment.id}
                  className={`rounded-2xl border border-gray-100 bg-white p-4 ${
                    shipment.id === focusedShipmentId ? 'ring-2 ring-indigo-200 border-indigo-300 bg-indigo-50/40' : ''
                  }`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">Shipment #{String(shipment.id).slice(0, 8)}</p>
                      <p className="text-xs text-gray-500">
                        {shipment.warehouse_name || 'Seller pickup point'}
                        {shipment.warehouse_city ? ` / ${shipment.warehouse_city}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold capitalize text-primary">{shipment.status.replaceAll('_', ' ')}</p>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {shipment.courier_provider ? `Courier: ${shipment.courier_provider}` : 'Courier pending'}
                    {shipment.tracking_id ? ` / Tracking: ${shipment.tracking_id}` : ''}
                  </div>
                  {pathaoEventSummary ? (
                    <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      <span className="font-semibold">Courier event:</span>{' '}
                      {pathaoEventSummary.event || 'event pending'}
                      {pathaoEventSummary.status ? ` • ${pathaoEventSummary.status}` : ''}
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-2 text-xs text-gray-500 md:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      Items: <span className="font-semibold text-gray-900">{shipment.item_count || shipment.items?.length || 0}</span>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      Pickup requested: <span className="font-semibold text-gray-900">{shipment.pickup_requested_at ? new Date(shipment.pickup_requested_at).toLocaleString() : 'Pending'}</span>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      Picked up: <span className="font-semibold text-gray-900">{shipment.picked_up_at ? new Date(shipment.picked_up_at).toLocaleString() : 'Pending'}</span>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      Out for delivery: <span className="font-semibold text-gray-900">{shipment.out_for_delivery_at ? new Date(shipment.out_for_delivery_at).toLocaleString() : 'Pending'}</span>
                    </div>
                  </div>
                  {shipment.items?.length ? (
                    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-xs text-gray-600">
                      <p className="font-semibold text-gray-800">Products in this shipment</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {shipment.items.map((item) => (
                          <span key={item.id} className="rounded-full bg-white px-3 py-1 shadow-sm">
                            {item.sku ? `${item.sku} • ` : ''}
                            {item.name || 'Item'}
                            {item.quantity ? ` x${item.quantity}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {shipment.delivery_failure_reason ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Exception note: {shipment.delivery_failure_reason}
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>
          ) : null}

          <div className="relative space-y-8">
            <div className="absolute bottom-2 left-[15px] top-2 w-0.5 bg-gray-100" />
            {result.steps.map((step, i) => (
              <div key={i} className="relative flex items-start space-x-6">
                <div className={`z-10 flex h-8 w-8 items-center justify-center rounded-full ${step.completed ? 'bg-primary text-white' : 'border-2 border-gray-100 bg-white text-gray-300'}`}>
                  {step.completed ? <CheckCircle size={18} /> : <Clock size={18} />}
                </div>
                <div>
                  <p className={`font-bold ${step.completed ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                  <p className="text-sm text-gray-500">{step.date}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};
