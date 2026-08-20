import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Download, Filter, Loader2, MapPin, Search, Truck, Undo2, XCircle } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';
import NotificationContainer, { useNotification } from '@/features/shared/animations/NotificationContainer';

interface SellerShipment {
  id: string;
  order_id: string;
  warehouse_id?: string | null;
  order_created_at?: string;
  shipping_address?: string | Record<string, unknown> | null;
  total: number;
  item_count?: number;
  warehouse_name?: string | null;
  warehouse_city?: string | null;
  payment_method: string;
  status: string;
  courier_provider?: string | null;
  tracking_id?: string | null;
  shipment_metadata?: Record<string, unknown> | null;
}

interface CourierPartner {
  code: string;
  name: string;
  mode: 'manual' | 'api';
  supportsCod: boolean;
  supportsTrackingSync: boolean;
  supportsPickupBooking: boolean;
  setupStatus?: 'manual_ready' | 'api_ready' | 'missing_config';
  setupMessage?: string;
  brandColor?: string;
  shortLabel?: string;
}

interface SellerPathaoReadiness {
  updatedAt: string;
  envReady: boolean;
  warehouseBlockers: Array<{
    id: string;
    name: string;
    blockers: string[];
  }>;
  bookingCandidates: Array<{
    id: string;
    order_id: string;
    warehouse_id: string | null;
    warehouse_name: string | null;
    courier_provider: string | null;
    tracking_id: string | null;
    status: string;
    blockers: string[];
  }>;
}

const managedStatuses = [
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
const exceptionStatuses = ['delivery_failed', 'returned', 'cancelled'];
const sellerCourierViews = ['all', 'active', 'exceptions', 'history'] as const;
type SellerCourierView = (typeof sellerCourierViews)[number];

export const SellerCourierManagement = () => {
  const { token, user } = useUser();
  const [shipments, setShipments] = useState<SellerShipment[]>([]);
  const [courierPartners, setCourierPartners] = useState<CourierPartner[]>([]);
  const [pathaoReadiness, setPathaoReadiness] = useState<SellerPathaoReadiness | null>(null);
  const [loadingPathaoReadiness, setLoadingPathaoReadiness] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiReady, setApiReady] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Record<string, string>>({});
  const [updatingShipmentId, setUpdatingShipmentId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<SellerCourierView>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');
  const [focusedShipmentId, setFocusedShipmentId] = useState('');
  const [showDeferredGuidance, setShowDeferredGuidance] = useState(false);
  const deferredGuidanceRef = useRef<HTMLDivElement | null>(null);
  const [activeRenderCount, setActiveRenderCount] = useState(24);
  const [historyRenderCount, setHistoryRenderCount] = useState(20);
  const { notifications, removeNotification, success, info } = useNotification();

  const loadShipments = async () => {
    if (!token) {
      setError('Please log in as a seller to manage courier bookings.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/seller/shipments', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load seller shipments');
      }

      const nextShipments = (Array.isArray(payload) ? payload : []) as SellerShipment[];
      setShipments(nextShipments);
      setApiReady(true);
    } catch (loadError) {
      setShipments([]);
      setApiReady(false);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Live courier-ready shipments could not be loaded right now. Please try again shortly.',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadPathaoReadiness = async () => {
    if (!token) return;

    try {
      setLoadingPathaoReadiness(true);
      const response = await fetch('/api/seller/logistics/pathao-readiness', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load Pathao readiness.');
      }

      setPathaoReadiness(payload as SellerPathaoReadiness);
    } catch {
      setPathaoReadiness(null);
    } finally {
      setLoadingPathaoReadiness(false);
    }
  };

  useEffect(() => {
    void loadShipments();
    void loadPathaoReadiness();
  }, [token]);

  useEffect(() => {
    fetch('/api/logistics/providers', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        setCourierPartners(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setCourierPartners([]);
      });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.get('search');
    if (nextSearch) {
      setSearchTerm(nextSearch);
    }
  }, []);

  useEffect(() => {
    if (showDeferredGuidance) return;

    const target = deferredGuidanceRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      const timeoutId = window.setTimeout(() => setShowDeferredGuidance(true), 250);
      return () => window.clearTimeout(timeoutId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowDeferredGuidance(true);
          observer.disconnect();
        }
      },
      { rootMargin: '480px 0px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [showDeferredGuidance]);

  const handleStatusUpdate = async (shipmentId: string, nextStatus: string) => {
    if (!token) return;

    setUpdatingShipmentId(shipmentId);

    try {
      const response = await fetch(`/api/shipments/${shipmentId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update shipment status');
      }

      setShipments((current) =>
        current.map((shipment) => (shipment.id === shipmentId ? { ...shipment, status: nextStatus } : shipment)),
      );

      success(`Shipment ${shipmentId.slice(0, 8)} moved to ${nextStatus.replaceAll('_', ' ')}.`, 3600);
    } catch (requestError) {
      info(
        requestError instanceof Error ? requestError.message : 'Shipment status could not be updated right now.',
        3600,
      );
    } finally {
      setUpdatingShipmentId('');
    }
  };

  const handleRequestPickup = async (shipmentId: string) => {
    const providerCode = selectedProvider[shipmentId] || courierPartners[0]?.code || 'pathao';

    if (!token) return;
    setUpdatingShipmentId(shipmentId);

    try {
      const response = await fetch('/api/seller/courier/bookings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shipmentId,
          providerCode,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to request pickup');
      }

      setShipments((current) =>
        current.map((shipment) =>
          shipment.id === shipmentId
            ? {
                ...shipment,
                status: payload?.shipment?.status || 'pickup_requested',
                courier_provider: payload?.shipment?.courier_provider || payload?.booking?.providerName || providerCode,
                tracking_id: payload?.shipment?.tracking_id || payload?.booking?.trackingId || null,
              }
            : shipment,
        ),
      );
      success(
        `${payload?.booking?.providerName || providerCode} pickup requested for shipment ${shipmentId.slice(0, 8)}. Tracking ID: ${payload?.booking?.trackingId || 'pending'}`,
        3600,
      );
    } catch (requestError) {
      info(requestError instanceof Error ? requestError.message : 'Pickup request failed right now.', 3600);
    } finally {
      setUpdatingShipmentId('');
    }
  };

  const handlePathaoSync = async (shipmentId: string) => {
    if (!token) return;
    setUpdatingShipmentId(shipmentId);

    try {
      const response = await fetch(`/api/logistics/pathao/shipments/${shipmentId}/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to sync Pathao shipment');
      }

      setShipments((current) =>
        current.map((shipment) => (shipment.id === shipmentId ? { ...shipment, ...(payload?.shipment || {}) } : shipment)),
      );
      success(`Pathao sync completed for shipment ${shipmentId.slice(0, 8)}.`, 3200);
    } catch (requestError) {
      info(requestError instanceof Error ? requestError.message : 'Pathao sync failed right now.', 3600);
    } finally {
      setUpdatingShipmentId('');
    }
  };

  const handlePathaoOrderInfo = async (consignmentId: string) => {
    if (!token) return;
    const trimmedId = String(consignmentId || '').trim();
    if (!trimmedId) {
      info('This shipment does not have a Pathao consignment or tracking ID yet.', 3200);
      return;
    }

    setUpdatingShipmentId(trimmedId);

    try {
      const response = await fetch(`/api/logistics/pathao/orders/${encodeURIComponent(trimmedId)}/info`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load Pathao order info');
      }

      const orderInfo = payload?.data || payload;
      success(
        `Pathao order ${orderInfo?.consignment_id || trimmedId}: ${String(orderInfo?.order_status || orderInfo?.order_status_slug || 'status unavailable')}.`,
        4200,
      );
    } catch (requestError) {
      info(requestError instanceof Error ? requestError.message : 'Pathao order info could not be loaded.', 3600);
    } finally {
      setUpdatingShipmentId('');
    }
  };

  const handleRedxSync = async (shipmentId: string) => {
    if (!token) return;
    setUpdatingShipmentId(shipmentId);

    try {
      const response = await fetch(`/api/logistics/redx/shipments/${shipmentId}/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to sync RedX shipment');
      }

      setShipments((current) =>
        current.map((shipment) => (shipment.id === shipmentId ? { ...shipment, ...(payload?.shipment || {}) } : shipment)),
      );
      success(`RedX sync completed for shipment ${shipmentId.slice(0, 8)}.`, 3200);
    } catch (requestError) {
      info(requestError instanceof Error ? requestError.message : 'RedX sync failed right now.', 3600);
    } finally {
      setUpdatingShipmentId('');
    }
  };

  const handleSteadfastSync = async (shipmentId: string) => {
    if (!token) return;
    setUpdatingShipmentId(shipmentId);

    try {
      const response = await fetch(`/api/logistics/steadfast/shipments/${shipmentId}/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to sync Steadfast shipment');
      }

      setShipments((current) =>
        current.map((shipment) => (shipment.id === shipmentId ? { ...shipment, ...(payload?.shipment || {}) } : shipment)),
      );
      success(`Steadfast sync completed for shipment ${shipmentId.slice(0, 8)}.`, 3200);
    } catch (requestError) {
      info(requestError instanceof Error ? requestError.message : 'Steadfast sync failed right now.', 3600);
    } finally {
      setUpdatingShipmentId('');
    }
  };

  const visibleShipments = useMemo(
    () =>
      shipments.filter((shipment) => {
        const needle = searchTerm.toLowerCase();
        const shipmentDate = shipment.order_created_at ? new Date(shipment.order_created_at) : null;
        const startDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
        const endDate = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
        const matchesProvider =
          providerFilter === 'all' ||
          String(shipment.courier_provider || 'unassigned').toLowerCase() === providerFilter.toLowerCase();
        const matchesStartDate = !startDate || !shipmentDate || shipmentDate >= startDate;
        const matchesEndDate = !endDate || !shipmentDate || shipmentDate <= endDate;

        return (
          matchesProvider &&
          matchesStartDate &&
          matchesEndDate &&
          (
            shipment.id.toLowerCase().includes(needle) ||
            shipment.status.toLowerCase().includes(needle) ||
            String(shipment.order_id || '').toLowerCase().includes(needle) ||
            String(shipment.warehouse_name || '').toLowerCase().includes(needle) ||
            String(shipment.courier_provider || '').toLowerCase().includes(needle) ||
            String(shipment.tracking_id || '').toLowerCase().includes(needle)
          )
        );
      }),
    [shipments, searchTerm, providerFilter, dateFrom, dateTo],
  );

  const viewScopedShipments = useMemo(() => {
    if (view === 'active') {
      return visibleShipments.filter((shipment) => managedStatuses.includes(shipment.status));
    }

    if (view === 'exceptions') {
      return visibleShipments.filter((shipment) => exceptionStatuses.includes(shipment.status));
    }

    if (view === 'history') {
      return visibleShipments.filter((shipment) => historyStatuses.includes(shipment.status));
    }

    return visibleShipments;
  }, [view, visibleShipments]);

  const activeShipments = useMemo(
    () => viewScopedShipments.filter((shipment) => managedStatuses.includes(shipment.status)),
    [viewScopedShipments],
  );

  const shipmentHistory = useMemo(
    () => viewScopedShipments.filter((shipment) => historyStatuses.includes(shipment.status)),
    [viewScopedShipments],
  );
  const renderedActiveShipments = useMemo(
    () => activeShipments.slice(0, activeRenderCount),
    [activeRenderCount, activeShipments],
  );
  const renderedShipmentHistory = useMemo(
    () => shipmentHistory.slice(0, historyRenderCount),
    [historyRenderCount, shipmentHistory],
  );

  useEffect(() => {
    setActiveRenderCount(24);
    setHistoryRenderCount(20);
  }, [searchTerm, providerFilter, dateFrom, dateTo, view]);

  useEffect(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) {
      setFocusedShipmentId('');
      return;
    }

    const firstMatch = viewScopedShipments[0];
    if (!firstMatch) {
      setFocusedShipmentId('');
      return;
    }

    setFocusedShipmentId(firstMatch.id);

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.getElementById(`seller-shipment-${firstMatch.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    }
  }, [searchTerm, viewScopedShipments]);

  const shipmentSummary = useMemo(() => {
    const delivered = shipments.filter((shipment) => shipment.status === 'delivered').length;
    const failed = shipments.filter((shipment) => shipment.status === 'delivery_failed').length;
    const returned = shipments.filter((shipment) => shipment.status === 'returned').length;

    return {
      total: shipments.length,
      active: shipments.filter((shipment) => managedStatuses.includes(shipment.status)).length,
      delivered,
      exceptionRate: shipments.length > 0 ? Math.round(((failed + returned) / shipments.length) * 100) : 0,
    };
  }, [shipments]);

  const providerOptions = useMemo(() => {
    const providerSet = new Set<string>();

    shipments.forEach((shipment) => {
      if (shipment.courier_provider && courierPartners.some((partner) => partner.code === String(shipment.courier_provider).toLowerCase())) {
        providerSet.add(shipment.courier_provider);
      }
    });

    return Array.from(providerSet).sort((left, right) => left.localeCompare(right));
  }, [shipments]);

  const parseAddress = (rawAddress?: string | Record<string, unknown> | null) => {
    if (!rawAddress) {
      return { city: 'Unknown', fullName: 'Customer' };
    }

    try {
      if (typeof rawAddress === 'string') {
        return JSON.parse(rawAddress) as { city?: string; fullName?: string };
      }

      return rawAddress as { city?: string; fullName?: string };
    } catch {
      return { city: 'Unknown', fullName: 'Customer' };
    }
  };

  const getPathaoEventSummary = (shipment: SellerShipment) => {
    const metadata =
      shipment.shipment_metadata && typeof shipment.shipment_metadata === 'object'
        ? (shipment.shipment_metadata as Record<string, unknown>)
        : {};

    const lastEvent = typeof metadata.pathaoLastEvent === 'string' ? metadata.pathaoLastEvent : null;
    const lastStatusSlug = typeof metadata.pathaoLastStatusSlug === 'string' ? metadata.pathaoLastStatusSlug : null;

    if (!lastEvent && !lastStatusSlug) return null;

    return {
      event: lastEvent ? lastEvent.replaceAll('_', ' ').replaceAll('.', ' ') : null,
      status: lastStatusSlug ? lastStatusSlug.replaceAll('_', ' ') : null,
    };
  };

  const handleExport = () => {
    const rows = viewScopedShipments.map((shipment) => {
      const address = parseAddress(shipment.shipping_address);
      return {
        shipment_id: shipment.id,
        order_id: shipment.order_id,
        status: shipment.status,
        courier_provider: shipment.courier_provider || '',
        tracking_id: shipment.tracking_id || '',
        warehouse_name: shipment.warehouse_name || '',
        warehouse_city: shipment.warehouse_city || '',
        destination_city: address.city || '',
        customer_name: address.fullName || '',
        payment_method: shipment.payment_method || '',
        item_count: shipment.item_count || 0,
        total: shipment.total,
        created_at: shipment.order_created_at || '',
      };
    });

    if (rows.length === 0) {
      info('No shipments matched the current courier filters.', 2600);
      return;
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = String(row[header as keyof (typeof rows)[number]] ?? '');
            return `"${value.replaceAll('"', '""')}"`;
          })
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `seller-courier-${view}-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    success(`Exported ${rows.length} courier shipment records.`, 2600);
  };

  const getProviderByCode = (code?: string | null) =>
    courierPartners.find((partner) => partner.code === String(code || '').toLowerCase()) || null;

  const getProviderBookingHint = (providerCode?: string | null) => {
    const normalizedCode = String(providerCode || '').toLowerCase();
    if (normalizedCode === 'steadfast') {
      return 'Book the parcel from the Steadfast merchant panel first, then save and follow the shipment from this queue.';
    }

    if (normalizedCode === 'paperfly') {
      return 'Use the Paperfly merchant workflow, then keep the tracking ID and milestone updates synced here.';
    }

    if (normalizedCode === 'pathao') {
      return 'Pathao can auto-book when API config and pickup mapping are complete. Otherwise use the manual merchant flow.';
    }

    if (normalizedCode === 'redx') {
      return 'RedX can auto-book when credentials are configured. Manual tracking still works as a safe fallback.';
    }

    return 'Use the courier merchant workflow, save the tracking ID, and keep shipment milestones updated here.';
  };

  const renderProviderSyncAction = (shipment: SellerShipment, busy: boolean) => {
    const isPathaoShipment = String(shipment.courier_provider || '').toLowerCase().includes('pathao');
    const isRedxShipment = String(shipment.courier_provider || '').toLowerCase().includes('redx');
    const isSteadfastShipment = String(shipment.courier_provider || '').toLowerCase().includes('steadfast');

    if (!isPathaoShipment && !courierPartners.some((partner) => partner.code === String(shipment.courier_provider).toLowerCase())) {
      return null;
    }

    if (isPathaoShipment) {
      return (
        <>
          <button
            onClick={() => void handlePathaoSync(shipment.id)}
            disabled={busy}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            {busy ? 'Syncing...' : 'Sync Pathao'}
          </button>
          {shipment.tracking_id ? (
            <button
              onClick={() => void handlePathaoOrderInfo(shipment.tracking_id || '')}
              disabled={busy}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              {busy ? 'Loading...' : 'Order Info'}
            </button>
          ) : null}
        </>
      );
    }

    if (isRedxShipment) {
      return (
        <button
          onClick={() => void handleRedxSync(shipment.id)}
          disabled={busy}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
        >
          {busy ? 'Syncing...' : 'Sync RedX'}
        </button>
      );
    }

    if (isSteadfastShipment) {
      return (
        <button
          onClick={() => void handleSteadfastSync(shipment.id)}
          disabled={busy}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
        >
          {busy ? 'Syncing...' : 'Sync Steadfast'}
        </button>
      );
    }

    return null;
  };

  const renderAction = (shipment: SellerShipment) => {
    const busy = updatingShipmentId === shipment.id;
    const isPathaoShipment = String(shipment.courier_provider || '').toLowerCase().includes('pathao');
    const isSteadfastShipment = String(shipment.courier_provider || '').toLowerCase().includes('steadfast');

    if (shipment.status === 'pending' || shipment.status === 'processing') {
      return (
        <button
          onClick={() => void handleStatusUpdate(shipment.id, 'packed')}
          disabled={busy}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Mark Packed'}
        </button>
      );
    }

    if (shipment.status === 'packed') {
      return (
        <button
          onClick={() => void handleStatusUpdate(shipment.id, 'ready_for_pickup')}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Ready for Pickup'}
        </button>
      );
    }

    if (shipment.status === 'ready_for_pickup') {
      const selectedCode = selectedProvider[shipment.id] || courierPartners[0]?.code || 'pathao';
      const selectedPartner = getProviderByCode(selectedCode);
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={selectedCode}
              onChange={(event) =>
                setSelectedProvider((current) => ({ ...current, [shipment.id]: event.target.value }))
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-bold text-gray-600"
            >
              {courierPartners.map((partner) => (
                <option key={partner.code} value={partner.code}>
                  {partner.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => void handleRequestPickup(shipment.id)}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? 'Saving...' : selectedCode === 'pathao' ? 'Book in Pathao' : 'Request Pickup'}
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            <span className="font-bold text-slate-800">{selectedPartner?.name || 'Courier'}:</span>{' '}
            {selectedPartner?.setupMessage || getProviderBookingHint(selectedCode)}
          </div>
          {selectedCode === 'pathao' ? (
            <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
              Pathao auto-booking works best when this shipment's pickup location already has a linked store, city, zone, and area mapping.
            </div>
          ) : null}
        </div>
      );
    }

    if (shipment.status === 'pickup_requested') {
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleStatusUpdate(shipment.id, 'picked_up')}
              disabled={busy}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Mark Picked Up'}
            </button>
            {renderProviderSyncAction(shipment, busy)}
          </div>
          {isSteadfastShipment ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
              Finish the Steadfast merchant-panel update first, then continue shipment milestones from here.
            </div>
          ) : null}
        </div>
      );
    }

    if (shipment.status === 'picked_up') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void handleStatusUpdate(shipment.id, 'in_transit')}
            disabled={busy}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Start Transit'}
          </button>
          {renderProviderSyncAction(shipment, busy)}
          </div>
      );
    }

    if (shipment.status === 'in_transit') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void handleStatusUpdate(shipment.id, 'out_for_delivery')}
            disabled={busy}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Out for Delivery'}
          </button>
          {renderProviderSyncAction(shipment, busy)}
          </div>
      );
    }

    if (shipment.status === 'out_for_delivery') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void handleStatusUpdate(shipment.id, 'delivered')}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Mark Delivered'}
          </button>
          {renderProviderSyncAction(shipment, busy)}
          </div>
      );
    }

    return <div className="text-xs font-bold text-emerald-600">Handled</div>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <NotificationContainer notifications={notifications} onClose={removeNotification} />

      {user?.seller_status !== 'approved' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Courier booking is locked until admin approves your seller account. You can still complete pickup setup and logistics readiness from this page.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Courier & Shipping</h1>
          <p className="text-gray-500">Handle shipment pickup from different seller locations and warehouses.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <div className={`h-2 w-2 rounded-full ${apiReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-xs font-bold text-gray-600">
              {apiReady ? 'Shipment flow live' : 'Live shipment data unavailable'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {courierPartners.map((partner) => (
          <div
            key={partner.code}
            className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm md:p-4"
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl font-bold text-white"
              style={{ backgroundColor: partner.brandColor || '#0f172a' }}
            >
              {partner.shortLabel || partner.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold">{partner.name}</p>
              <p className="text-[10px] text-gray-400">
                {partner.setupStatus === 'api_ready'
                  ? 'API config ready'
                  : partner.setupStatus === 'missing_config'
                    ? 'Config needed for API mode'
                    : 'Manual pickup workflow'}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Shipments</p>
          <p className="mt-2 text-xl font-bold text-slate-900 md:text-2xl">{shipmentSummary.total}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Active Queue</p>
          <p className="mt-2 text-xl font-bold text-indigo-700 md:text-2xl">{shipmentSummary.active}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Delivered</p>
          <p className="mt-2 text-xl font-bold text-emerald-700 md:text-2xl">{shipmentSummary.delivered}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Exception Rate</p>
          <p className="mt-2 text-xl font-bold text-amber-700 md:text-2xl">{shipmentSummary.exceptionRate}%</p>
        </div>
      </div>

      <div ref={deferredGuidanceRef} className="space-y-6">
        {showDeferredGuidance ? (
          <>
      <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5 text-sm text-indigo-900">
        <p className="font-semibold">Recommended courier flow</p>
        <p className="mt-1">
          processing -&gt; packed -&gt; ready_for_pickup -&gt; pickup_requested -&gt; picked_up -&gt; in_transit -&gt; out_for_delivery -&gt; delivered
        </p>
      </div>

      <section className="rounded-[32px] border border-rose-100 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-rose-600">Pathao readiness</p>
            <h2 className="mt-2 text-lg font-bold text-slate-950">Seller-side booking blockers</h2>
            <p className="mt-2 text-sm text-slate-500">
              See which pickup locations or shipment details still need work before reliable Pathao auto-booking.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPathaoReadiness()}
            disabled={loadingPathaoReadiness}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Loader2 className={`h-4 w-4 ${loadingPathaoReadiness ? 'animate-spin' : 'hidden'}`} />
            <span>{loadingPathaoReadiness ? 'Refreshing...' : 'Refresh readiness'}</span>
          </button>
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">Pickup location blockers</h3>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                pathaoReadiness?.envReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {pathaoReadiness?.envReady ? 'Env ready' : 'Env check needed'}
              </span>
            </div>
            {pathaoReadiness?.warehouseBlockers.length ? (
              pathaoReadiness.warehouseBlockers.map((warehouse) => (
                <div key={warehouse.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{warehouse.name}</p>
                    <a
                      href={`/seller/pickup-locations?warehouse=${encodeURIComponent(warehouse.id)}`}
                      className="text-[11px] font-semibold text-slate-700 hover:text-primary"
                    >
                      Fix now
                    </a>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {warehouse.blockers.map((blocker) => (
                      <span
                        key={blocker}
                        className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-800"
                      >
                        {blocker}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                Pickup locations look good for Pathao mapping right now.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Shipment booking dry-run</h3>
            {pathaoReadiness?.bookingCandidates.length ? (
              pathaoReadiness.bookingCandidates.map((shipment) => (
                <div
                  key={shipment.id}
                  className={`rounded-2xl border p-4 ${
                    shipment.blockers.length ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">Shipment #{shipment.id.slice(0, 8)}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Order {shipment.order_id} • {shipment.warehouse_name || 'Warehouse pending'}
                      </p>
                    </div>
                    <a
                      href={`/seller/courier?search=${encodeURIComponent(shipment.tracking_id || shipment.id)}`}
                      className="text-[11px] font-semibold text-slate-700 hover:text-primary"
                    >
                      Open shipment
                    </a>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shipment.blockers.length ? (
                      shipment.blockers.map((blocker) => (
                        <span
                          key={blocker}
                          className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-800"
                        >
                          {blocker}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                        Ready for Pathao booking
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No active seller shipments need a Pathao dry-run check right now.
              </div>
            )}
          </div>
        </div>
      </section>

          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-28 animate-pulse rounded-3xl border border-indigo-100 bg-indigo-50/60" />
            <div className="h-64 animate-pulse rounded-[32px] border border-rose-100 bg-white shadow-sm" />
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-sm">
        <div className="mobile-sticky-toolbar flex flex-col gap-4 border-b border-gray-50 bg-gray-50/50 p-4 md:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="font-bold">Live Shipment Queue</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {sellerCourierViews.map((option) => (
                <button
                  key={option}
                  onClick={() => setView(option)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize transition ${
                    view === option
                      ? 'bg-slate-900 text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:text-indigo-700'
                  }`}
                >
                  {option === 'all'
                    ? 'All'
                    : option === 'active'
                      ? 'Active'
                      : option === 'exceptions'
                        ? 'Exceptions'
                        : 'History'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search shipment, tracking, warehouse..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-9 pr-4 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-64 sm:py-2"
              />
            </div>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs font-semibold text-gray-600 outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-auto sm:py-2"
            >
              <option value="all">All couriers</option>
              <option value="unassigned">Unassigned</option>
              {providerOptions.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs font-semibold text-gray-600 outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-auto sm:py-2"
              aria-label="Filter shipments from date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs font-semibold text-gray-600 outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-auto sm:py-2"
              aria-label="Filter shipments to date"
            />
            <button
              onClick={() => info('Search by shipment ID, tracking ID, status, warehouse, courier, or date range.', 2600)}
              className="rounded-xl border border-gray-200 bg-white p-3 text-gray-400 hover:text-indigo-600 sm:p-2"
            >
              <Filter className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setSearchTerm('');
                setProviderFilter('all');
                setDateFrom('');
                setDateTo('');
                setView('all');
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs font-bold text-gray-600 transition hover:border-indigo-200 hover:text-indigo-700 sm:py-2"
            >
              Clear
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs font-bold text-gray-600 transition hover:border-indigo-200 hover:text-indigo-700 sm:py-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-50 text-[10px] uppercase tracking-widest text-gray-400">
                <th className="px-6 py-4 font-bold">Shipment</th>
                <th className="px-6 py-4 font-bold">Pickup & Destination</th>
                <th className="px-6 py-4 font-bold">Payment</th>
                <th className="px-6 py-4 font-bold">Current Stage</th>
                <th className="px-6 py-4 font-bold">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {renderedActiveShipments.length > 0 ? (
                renderedActiveShipments.map((shipment) => {
                  const address = parseAddress(shipment.shipping_address);
                  const pathaoEventSummary = getPathaoEventSummary(shipment);
                  const focused = shipment.id === focusedShipmentId;
                  return (
                    <tr
                      id={`seller-shipment-${shipment.id}`}
                      key={shipment.id}
                      className={`transition-colors hover:bg-gray-50/50 ${
                        focused ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200' : ''
                      }`}
                    >
                      <td className="px-6 py-6">
                        <p className="mb-1 text-sm font-bold">Shipment #{String(shipment.id).slice(0, 8)}</p>
                        <p className="text-xs text-gray-400">Order #{String(shipment.order_id).slice(0, 10)}</p>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {shipment.order_created_at ? new Date(shipment.order_created_at).toLocaleDateString() : 'Recently created'}
                        </p>
                      </td>
                      <td className="px-6 py-6">
                        <div className="mb-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pickup</p>
                          <p className="text-sm font-bold text-gray-900">{shipment.warehouse_name || 'Seller pickup point'}</p>
                          <p className="text-xs text-gray-500">{shipment.warehouse_city || 'Warehouse city pending'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-indigo-600" />
                          <p className="text-sm font-bold">{address.city || 'Unknown'}</p>
                        </div>
                        <p className="max-w-[180px] truncate text-xs text-gray-500">{address.fullName || 'Customer'}</p>
                      </td>
                      <td className="px-6 py-6">
                        <p className="mb-1 text-sm font-bold">{formatPrice(shipment.total)}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            shipment.payment_method === 'cod'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {shipment.payment_method?.toUpperCase() || 'N/A'}
                        </span>
                        <p className="mt-2 text-[10px] text-gray-500">{shipment.item_count || 0} item(s)</p>
                      </td>
                      <td className="px-6 py-6">
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                          <Truck className="h-3.5 w-3.5" />
                          {shipment.status.replaceAll('_', ' ')}
                        </div>
                        {shipment.courier_provider || shipment.tracking_id ? (
                          <div className="mt-2 space-y-1 text-[10px] text-gray-500">
                            {shipment.courier_provider ? <p>Courier: {shipment.courier_provider}</p> : null}
                            {shipment.tracking_id ? <p>Tracking: {shipment.tracking_id}</p> : null}
                            {pathaoEventSummary ? (
                              <p className="text-rose-700">
                                Pathao: {pathaoEventSummary.event || 'event pending'}
                                {pathaoEventSummary.status ? ` • ${pathaoEventSummary.status}` : ''}
                              </p>
                            ) : null}
                            {String(shipment.courier_provider || '').toLowerCase().includes('steadfast') ? (
                              <p className="text-blue-700">Manual merchant tracking flow active</p>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-6">
                        {shipment.status === 'delivered' ? (
                          <div className="space-y-1 text-xs font-bold text-emerald-600">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4" />
                              Delivered
                            </div>
                          </div>
                        ) : (
                          renderAction(shipment)
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                    No courier-managed shipments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {activeShipments.length > renderedActiveShipments.length ? (
          <div className="border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={() => setActiveRenderCount((current) => current + 24)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:border-indigo-200 hover:text-indigo-700"
            >
              Load more active shipments
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[32px] border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-50 bg-gray-50/50 p-4 md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <h3 className="font-bold">Courier History</h3>
            <p className="mt-1 text-sm text-gray-500">Review delivered, failed, returned, and cancelled shipments.</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {shipmentHistory.length} records
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-50 text-[10px] uppercase tracking-widest text-gray-400">
                <th className="px-6 py-4 font-bold">Shipment</th>
                <th className="px-6 py-4 font-bold">Pickup</th>
                <th className="px-6 py-4 font-bold">Courier</th>
                <th className="px-6 py-4 font-bold">Final Status</th>
                <th className="px-6 py-4 font-bold">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {renderedShipmentHistory.length > 0 ? (
                renderedShipmentHistory.map((shipment) => (
                  <tr
                    id={`seller-shipment-${shipment.id}`}
                    key={shipment.id}
                    className={`transition-colors hover:bg-gray-50/50 ${
                      shipment.id === focusedShipmentId ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200' : ''
                    }`}
                  >
                    <td className="px-6 py-5">
                      <p className="text-sm font-bold text-slate-900">Shipment #{shipment.id.slice(0, 8)}</p>
                      <p className="text-xs text-gray-500">Order #{shipment.order_id.slice(0, 10)}</p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm font-semibold text-slate-900">{shipment.warehouse_name || 'Seller pickup point'}</p>
                      <p className="text-xs text-gray-500">{shipment.warehouse_city || 'Warehouse city pending'}</p>
                    </td>
                    <td className="px-6 py-5 text-xs text-gray-600">
                      <p>{shipment.courier_provider || 'Not assigned'}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-700">{shipment.tracking_id || 'Pending'}</p>
                      {String(shipment.courier_provider || '').toLowerCase().includes('steadfast') ? (
                        <p className="mt-1 text-[10px] text-blue-700">Merchant panel synced manually</p>
                      ) : null}
                    </td>
                    <td className="px-6 py-5">
                      <div
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          shipment.status === 'delivered'
                            ? 'bg-emerald-100 text-emerald-700'
                            : shipment.status === 'delivery_failed'
                              ? 'bg-amber-100 text-amber-700'
                              : shipment.status === 'returned'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {shipment.status === 'delivered' ? <CheckCircle className="h-3.5 w-3.5" /> : null}
                        {shipment.status === 'delivery_failed' ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                        {shipment.status === 'returned' ? <Undo2 className="h-3.5 w-3.5" /> : null}
                        {shipment.status === 'cancelled' ? <XCircle className="h-3.5 w-3.5" /> : null}
                        {shipment.status.replaceAll('_', ' ')}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-900">{formatPrice(shipment.total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                    No courier history records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {shipmentHistory.length > renderedShipmentHistory.length ? (
          <div className="border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={() => setHistoryRenderCount((current) => current + 20)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:border-indigo-200 hover:text-indigo-700"
            >
              Load more shipment history
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

