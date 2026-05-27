import React, { useMemo, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, MapPinned, RefreshCw, Search, Truck } from 'lucide-react';
import { useUser } from '../../context/UserContext';

type Provider = {
  code: string;
  name: string;
  mode: 'manual' | 'api';
  setupStatus?: 'manual_ready' | 'api_ready' | 'missing_config';
  setupMessage?: string;
  supportsTrackingSync?: boolean;
};

type DiagnosticsPayload = {
  updatedAt: string;
  steadfastHealth?: {
    apiConfigured: boolean;
    webhookConfigured: boolean;
    baseUrl: string | null;
  };
  pathaoHealth?: {
    baseUrl: string | null;
    hasCachedToken: boolean;
    tokenType: string | null;
    issuedAt: string | null;
    expiresAt: string | null;
    expiresInSeconds: number | null;
    refreshTokenAvailable: boolean;
    linkedStoreCount: number;
    webhookConfigured: boolean;
  };
  pathaoReadiness?: {
    envChecks: Array<{
      key: string;
      label: string;
      ready: boolean;
    }>;
    envReady: boolean;
    warehouseBlockers: Array<{
      id: string;
      name: string;
      blockers: string[];
    }>;
    bookingCandidates: Array<{
      id: string;
      order_id: string;
      warehouse_name: string | null;
      courier_provider: string | null;
      tracking_id: string | null;
      status: string;
      blockers: string[];
    }>;
  };
  providers: Provider[];
  warehouseSummary: {
    total: number;
    areaMapped: number;
    storeLinked: number;
    shippingRulesReady: number;
    needsAttention: number;
  };
  shipmentSummary: {
    active: number;
    exceptions: number;
    pathaoSyncAttention: number;
    redxSyncAttention: number;
    steadfastSyncAttention: number;
  };
  warehouseHealth: Array<{
    id: string;
    name: string;
    city: string;
    pathao_store_id: number | null;
    mapping_ready: boolean;
    store_linked: boolean;
    shipping_rules_ready: boolean;
    inside_dhaka_fee: number | null;
    outside_dhaka_fee: number | null;
    inside_dhaka_eta: string | null;
    outside_dhaka_eta: string | null;
  }>;
  recentExceptions: Array<{
    id: string;
    order_id: string;
    customer_name: string | null;
    warehouse_name: string | null;
    warehouse_city: string | null;
    status: string;
    courier_provider: string | null;
    tracking_id: string | null;
    delivery_failure_reason: string | null;
    updated_at: string | null;
  }>;
  pathaoWatchlist: Array<{
    id: string;
    order_id: string;
    customer_name: string | null;
    warehouse_name: string | null;
    status: string;
    tracking_id: string | null;
    booking_reference: string | null;
    pathao_last_event: string | null;
    pathao_last_status_slug: string | null;
    pathao_last_sync_at: string | null;
    sync_age_hours: number | null;
  }>;
  redxWatchlist: Array<{
    id: string;
    order_id: string;
    customer_name: string | null;
    warehouse_name: string | null;
    status: string;
    tracking_id: string | null;
    booking_reference: string | null;
    redx_last_sync_at: string | null;
    sync_age_hours: number | null;
  }>;
};

type PathaoStoreRow = {
  store_id?: number;
  store_name?: string;
  store_address?: string;
  city_id?: number;
  zone_id?: number;
  is_active?: number;
  is_default_store?: boolean | number;
};

export const AdminLogisticsPage = () => {
  const { token } = useUser();
  const [data, setData] = useState<DiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pathaoActionLoading, setPathaoActionLoading] = useState<string | null>(null);
  const [pathaoStores, setPathaoStores] = useState<PathaoStoreRow[]>([]);
  const [pathaoStoresLoaded, setPathaoStoresLoaded] = useState(false);
  const [pathaoResult, setPathaoResult] = useState('');
  const [pathaoPriceForm, setPathaoPriceForm] = useState({
    store_id: '',
    recipient_city: '',
    recipient_zone: '',
    item_weight: '0.5',
    delivery_type: '48',
    item_type: '2',
  });
  const [pathaoOrderForm, setPathaoOrderForm] = useState({
    store_id: '',
    merchant_order_id: '',
    recipient_name: '',
    recipient_phone: '',
    recipient_address: '',
    recipient_city: '',
    recipient_zone: '',
    recipient_area: '',
    delivery_type: '48',
    item_type: '2',
    item_quantity: '1',
    item_weight: '0.5',
    item_description: '',
    amount_to_collect: '0',
    special_instruction: '',
  });
  const [showDeferredOpsPanels, setShowDeferredOpsPanels] = useState(false);
  const deferredOpsRef = useRef<HTMLDivElement | null>(null);
  const [exceptionRenderCount, setExceptionRenderCount] = useState(16);
  const [pathaoWatchRenderCount, setPathaoWatchRenderCount] = useState(12);
  const [redxWatchRenderCount, setRedxWatchRenderCount] = useState(12);

  const runPathaoAction = async (key: string, handler: () => Promise<void>) => {
    try {
      setPathaoActionLoading(key);
      setPathaoResult('');
      await handler();
    } catch (actionError) {
      setPathaoResult(actionError instanceof Error ? actionError.message : 'Pathao action failed');
    } finally {
      setPathaoActionLoading(null);
    }
  };

  const loadDiagnostics = async (silent = false) => {
    if (!token) {
      setLoading(false);
      setError('Please log in as an admin to view logistics diagnostics.');
      setData(null);
      return;
    }

    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      const response = await fetch('/api/admin/logistics/diagnostics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load logistics diagnostics');
      }
      setData(payload);
    } catch (requestError) {
      setData(null);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load logistics diagnostics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDiagnostics();
  }, [token]);

  useEffect(() => {
    if (showDeferredOpsPanels) return;

    const target = deferredOpsRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      const timeoutId = window.setTimeout(() => setShowDeferredOpsPanels(true), 250);
      return () => window.clearTimeout(timeoutId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowDeferredOpsPanels(true);
          observer.disconnect();
        }
      },
      { rootMargin: '520px 0px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [showDeferredOpsPanels]);

  const providerOptions = useMemo(() => {
    const values = new Set<string>();

    data?.recentExceptions.forEach((shipment) => {
      if (shipment.courier_provider) {
        values.add(shipment.courier_provider);
      }
    });
    data?.pathaoWatchlist.forEach(() => values.add('Pathao'));
    data?.redxWatchlist.forEach(() => values.add('RedX'));

    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [data]);

  const matchesDateRange = (value?: string | null) => {
    if (!value) {
      return !dateFrom && !dateTo;
    }

    const date = new Date(value);
    const startDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const endDate = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    if (startDate && date < startDate) {
      return false;
    }
    if (endDate && date > endDate) {
      return false;
    }
    return true;
  };

  const filteredExceptions = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return (data?.recentExceptions || []).filter((shipment) => {
      const providerName = shipment.courier_provider || 'Unassigned';
      const matchesProvider =
        providerFilter === 'all' || providerName.toLowerCase() === providerFilter.toLowerCase();

      return (
        matchesProvider &&
        matchesDateRange(shipment.updated_at) &&
        (
          !needle ||
          shipment.id.toLowerCase().includes(needle) ||
          shipment.order_id.toLowerCase().includes(needle) ||
          String(shipment.customer_name || '').toLowerCase().includes(needle) ||
          String(shipment.warehouse_name || '').toLowerCase().includes(needle) ||
          String(shipment.courier_provider || '').toLowerCase().includes(needle) ||
          String(shipment.tracking_id || '').toLowerCase().includes(needle) ||
          shipment.status.toLowerCase().includes(needle)
        )
      );
    });
  }, [data, searchTerm, providerFilter, dateFrom, dateTo]);

  const filteredPathaoWatchlist = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (providerFilter !== 'all' && providerFilter.toLowerCase() !== 'pathao') {
      return [];
    }
    return (data?.pathaoWatchlist || []).filter((shipment) => {
      return (
        matchesDateRange(shipment.pathao_last_sync_at) &&
        (
          !needle ||
          shipment.id.toLowerCase().includes(needle) ||
          shipment.order_id.toLowerCase().includes(needle) ||
          String(shipment.customer_name || '').toLowerCase().includes(needle) ||
          String(shipment.warehouse_name || '').toLowerCase().includes(needle) ||
          String(shipment.tracking_id || '').toLowerCase().includes(needle) ||
          shipment.status.toLowerCase().includes(needle)
        )
      );
    });
  }, [data, searchTerm, providerFilter, dateFrom, dateTo]);

  const filteredRedxWatchlist = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (providerFilter !== 'all' && providerFilter.toLowerCase() !== 'redx') {
      return [];
    }
    return (data?.redxWatchlist || []).filter((shipment) => {
      return (
        matchesDateRange(shipment.redx_last_sync_at) &&
        (
          !needle ||
          shipment.id.toLowerCase().includes(needle) ||
          shipment.order_id.toLowerCase().includes(needle) ||
          String(shipment.customer_name || '').toLowerCase().includes(needle) ||
          String(shipment.warehouse_name || '').toLowerCase().includes(needle) ||
          String(shipment.tracking_id || '').toLowerCase().includes(needle) ||
          shipment.status.toLowerCase().includes(needle)
        )
      );
    });
  }, [data, searchTerm, providerFilter, dateFrom, dateTo]);
  const renderedExceptions = useMemo(
    () => filteredExceptions.slice(0, exceptionRenderCount),
    [exceptionRenderCount, filteredExceptions],
  );
  const renderedPathaoWatchlist = useMemo(
    () => filteredPathaoWatchlist.slice(0, pathaoWatchRenderCount),
    [filteredPathaoWatchlist, pathaoWatchRenderCount],
  );
  const renderedRedxWatchlist = useMemo(
    () => filteredRedxWatchlist.slice(0, redxWatchRenderCount),
    [filteredRedxWatchlist, redxWatchRenderCount],
  );

  useEffect(() => {
    setExceptionRenderCount(16);
    setPathaoWatchRenderCount(12);
    setRedxWatchRenderCount(12);
  }, [searchTerm, providerFilter, dateFrom, dateTo]);

  const steadfastProvider = useMemo(
    () => data?.providers.find((provider) => provider.code === 'steadfast') || null,
    [data],
  );

  const steadfastExceptionCount = useMemo(
    () =>
      (data?.recentExceptions || []).filter((shipment) =>
        String(shipment.courier_provider || '').toLowerCase().includes('steadfast'),
      ).length,
    [data],
  );

  const handleExport = () => {
    const rows = [
      ...filteredExceptions.map((shipment) => ({
        source: 'exception',
        shipment_id: shipment.id,
        order_id: shipment.order_id,
        courier_provider: shipment.courier_provider || '',
        tracking_id: shipment.tracking_id || '',
        warehouse_name: shipment.warehouse_name || '',
        customer_name: shipment.customer_name || '',
        status: shipment.status,
        note: shipment.delivery_failure_reason || '',
        reference_time: shipment.updated_at || '',
      })),
      ...filteredPathaoWatchlist.map((shipment) => ({
        source: 'pathao_watchlist',
        shipment_id: shipment.id,
        order_id: shipment.order_id,
        courier_provider: 'Pathao',
        tracking_id: shipment.tracking_id || '',
        warehouse_name: shipment.warehouse_name || '',
        customer_name: shipment.customer_name || '',
        status: shipment.status,
        note: shipment.booking_reference || '',
        reference_time: shipment.pathao_last_sync_at || '',
      })),
      ...filteredRedxWatchlist.map((shipment) => ({
        source: 'redx_watchlist',
        shipment_id: shipment.id,
        order_id: shipment.order_id,
        courier_provider: 'RedX',
        tracking_id: shipment.tracking_id || '',
        warehouse_name: shipment.warehouse_name || '',
        customer_name: shipment.customer_name || '',
        status: shipment.status,
        note: shipment.booking_reference || '',
        reference_time: shipment.redx_last_sync_at || '',
      })),
    ];

    if (!rows.length) {
      setError('No logistics records matched the current filters to export.');
      return;
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header as keyof (typeof rows)[number]] ?? '').replaceAll('"', '""')}"`)
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `admin-logistics-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadPathaoStores = async () => {
    if (!token) return;
    const response = await fetch('/api/logistics/pathao/stores', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load Pathao stores');
    }
    const rows = Array.isArray(payload?.data?.data) ? payload.data.data : [];
    setPathaoStores(rows);
    setPathaoStoresLoaded(true);
    setPathaoResult(`Loaded ${rows.length} Pathao store${rows.length === 1 ? '' : 's'}.`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">Courier diagnostics</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Logistics readiness and shipment health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            Check provider setup, warehouse mapping coverage, delivery exceptions, and shipments that need sync attention before they become support issues.
          </p>
        </div>
        <button
          onClick={() => void loadDiagnostics(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          <span>Refresh diagnostics</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:flex-wrap md:items-center">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search shipment, tracking, warehouse..."
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 md:py-2"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(event) => setProviderFilter(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/20 md:w-auto md:py-2"
        >
          <option value="all">All providers</option>
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
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/20 md:w-auto md:py-2"
          aria-label="Logistics records from date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/20 md:w-auto md:py-2"
          aria-label="Logistics records to date"
        />
        <button
          onClick={() => {
            setSearchTerm('');
            setProviderFilter('all');
            setDateFrom('');
            setDateTo('');
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 md:py-2"
        >
          Clear
        </button>
        <button
          onClick={handleExport}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 md:py-2"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Providers ready</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">
            {data?.providers.filter((provider) => provider.setupStatus === 'api_ready').length || 0}
          </p>
          <p className="mt-1 text-xs text-gray-400">Direct API-capable courier providers</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Warehouses mapped</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{data?.warehouseSummary.areaMapped || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Pickup locations with Pathao city, zone, and area</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Exceptions</p>
          <p className="mt-2 text-xl font-bold text-rose-600 md:text-2xl">{data?.shipmentSummary.exceptions || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Failed, returned, or cancelled shipments</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Pathao sync attention</p>
          <p className="mt-2 text-xl font-bold text-amber-600 md:text-2xl">{data?.shipmentSummary.pathaoSyncAttention || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Active Pathao shipments missing fresh sync</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">RedX sync attention</p>
          <p className="mt-2 text-xl font-bold text-red-600 md:text-2xl">{data?.shipmentSummary.redxSyncAttention || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Active RedX shipments missing fresh sync</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Steadfast sync attention</p>
          <p className="mt-2 text-xl font-bold text-blue-600 md:text-2xl">{data?.shipmentSummary.steadfastSyncAttention || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Active Steadfast shipments missing fresh sync</p>
        </div>
      </div>

      <div ref={deferredOpsRef} className="space-y-8">
        {showDeferredOpsPanels ? (
          <>
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ef4444] text-base font-black uppercase tracking-[0.18em] text-white shadow-sm">
            P
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#ef4444]">Pathao ops</p>
            <h2 className="text-lg font-bold text-slate-950">Pathao Courier token and store health</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Cached token</p>
            <p className={`mt-2 text-xl font-bold ${data?.pathaoHealth?.hasCachedToken ? 'text-emerald-700' : 'text-amber-700'}`}>
              {data?.pathaoHealth?.hasCachedToken ? 'Ready' : 'Missing'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Linked stores</p>
            <p className="mt-2 text-xl font-bold text-slate-950">{data?.pathaoHealth?.linkedStoreCount || 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Webhook</p>
            <p className={`mt-2 text-xl font-bold ${data?.pathaoHealth?.webhookConfigured ? 'text-emerald-700' : 'text-amber-700'}`}>
              {data?.pathaoHealth?.webhookConfigured ? 'Configured' : 'Missing'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Token expires</p>
            <p className="mt-2 text-xl font-bold text-slate-950">
              {data?.pathaoHealth?.expiresInSeconds != null
                ? `${Math.max(0, Math.round(data.pathaoHealth.expiresInSeconds / 60))}m`
                : 'N/A'}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Base URL</p>
            <p className="mt-1 break-all">{data?.pathaoHealth?.baseUrl || 'Not configured'}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Token metadata</p>
            <p className="mt-1">
              {data?.pathaoHealth?.issuedAt
                ? `Issued ${new Date(data.pathaoHealth.issuedAt).toLocaleString()}`
                : 'No cached Pathao token yet'}
            </p>
            <p className="mt-1">
              {data?.pathaoHealth?.refreshTokenAvailable ? 'Refresh token cached' : 'Refresh token unavailable'}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#ef4444]">Pathao go-live</p>
            <h2 className="mt-2 text-lg font-bold text-slate-950">Exact launch checklist and blockers</h2>
            <p className="mt-2 text-sm text-slate-500">
              This section shows what is still blocking live Pathao booking: env config, warehouse mapping, or shipment data.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
            data?.pathaoReadiness?.envReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {data?.pathaoReadiness?.envReady ? 'Env ready' : 'Env blockers'}
          </span>
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-[0.8fr_1.1fr_1.1fr]">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Environment</h3>
            {data?.pathaoReadiness?.envChecks.map((check) => (
              <div key={check.key} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <span className="font-medium text-slate-700">{check.label}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  check.ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {check.ready ? 'Ready' : 'Missing'}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Warehouse blockers</h3>
            {data?.pathaoReadiness?.warehouseBlockers.length ? data.pathaoReadiness.warehouseBlockers.map((warehouse) => (
              <div key={warehouse.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{warehouse.name}</p>
                  <a
                    href={`/admin/inventory?warehouse=${encodeURIComponent(warehouse.id)}`}
                    className="text-[11px] font-semibold text-slate-700 hover:text-primary"
                  >
                    Fix now
                  </a>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {warehouse.blockers.map((blocker) => (
                    <span key={blocker} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-amber-800 shadow-sm">
                      {blocker}
                    </span>
                  ))}
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No warehouse-level Pathao blockers right now.
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Shipment dry-run blockers</h3>
            {data?.pathaoReadiness?.bookingCandidates.length ? data.pathaoReadiness.bookingCandidates.map((shipment) => (
              <div key={shipment.id} className={`rounded-2xl border p-4 ${
                shipment.blockers.length ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">Shipment #{shipment.id.slice(0, 8)}</p>
                    <p className="mt-1 text-sm text-slate-600">Order {shipment.order_id} • {shipment.warehouse_name || 'Warehouse pending'}</p>
                  </div>
                  <a
                    href={`/seller/courier?search=${encodeURIComponent(shipment.tracking_id || shipment.id)}`}
                    className="text-[11px] font-semibold text-slate-700 hover:text-primary"
                  >
                    Open seller courier
                  </a>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {shipment.courier_provider || 'Provider pending'} • {shipment.status.replaceAll('_', ' ')} • {shipment.tracking_id || 'Tracking pending'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {shipment.blockers.length ? shipment.blockers.map((blocker) => (
                    <span key={blocker} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-amber-800 shadow-sm">
                      {blocker}
                    </span>
                  )) : (
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm">
                      Ready for Pathao booking
                    </span>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No active shipment candidates found for Pathao dry-run checks.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1d4ed8] text-base font-black uppercase tracking-[0.18em] text-white shadow-sm">
            ST
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#1d4ed8]">Steadfast ops</p>
            <h2 className="text-lg font-bold text-slate-950">Steadfast manual merchant workflow</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Provider status</p>
            <p className={`mt-2 text-xl font-bold ${
              data?.steadfastHealth?.apiConfigured || steadfastProvider?.setupStatus === 'api_ready'
                ? 'text-emerald-700'
                : steadfastProvider?.setupStatus === 'manual_ready'
                  ? 'text-slate-700'
                  : 'text-amber-700'
            }`}>
              {data?.steadfastHealth?.apiConfigured || steadfastProvider?.setupStatus === 'api_ready'
                ? 'API ready'
                : steadfastProvider?.setupStatus === 'manual_ready'
                  ? 'Manual ready'
                  : 'Needs review'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Exception records</p>
            <p className="mt-2 text-xl font-bold text-slate-950">{steadfastExceptionCount}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Webhook</p>
            <p className={`mt-2 text-xl font-bold ${data?.steadfastHealth?.webhookConfigured ? 'text-emerald-700' : 'text-amber-700'}`}>
              {data?.steadfastHealth?.webhookConfigured ? 'Configured' : 'Manual sync'}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void runPathaoAction('issue-token', async () => {
                  if (!token) throw new Error('Admin login required');
                  const response = await fetch('/api/logistics/pathao/token/issue', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ grant_type: 'password' }),
                  });
                  const payload = await response.json().catch(() => null);
                  if (!response.ok) {
                    throw new Error(payload?.error || 'Failed to issue Pathao token');
                  }
                  setPathaoResult(`Token issued successfully. Expires in ${payload?.expires_in ?? 'unknown'} seconds.`);
                  await loadDiagnostics(true);
                })}
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                {pathaoActionLoading === 'issue-token' ? 'Issuing token...' : 'Issue token'}
              </button>
              <button
                onClick={() => void runPathaoAction('refresh-token', async () => {
                  if (!token) throw new Error('Admin login required');
                  const response = await fetch('/api/logistics/pathao/token/refresh', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const payload = await response.json().catch(() => null);
                  if (!response.ok) {
                    throw new Error(payload?.error || 'Failed to refresh Pathao token');
                  }
                  setPathaoResult(`Token refreshed successfully. Expires in ${payload?.expires_in ?? 'unknown'} seconds.`);
                  await loadDiagnostics(true);
                })}
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                {pathaoActionLoading === 'refresh-token' ? 'Refreshing token...' : 'Refresh token'}
              </button>
              <button
                onClick={() => void runPathaoAction('load-stores', loadPathaoStores)}
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                {pathaoActionLoading === 'load-stores' ? 'Loading stores...' : 'Load stores'}
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              {pathaoResult || 'Use these quick actions to issue or refresh OAuth tokens and inspect merchant stores without leaving diagnostics.'}
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Merchant stores</p>
              {pathaoStoresLoaded ? (
                pathaoStores.length ? (
                  <div className="space-y-2">
                    {pathaoStores.slice(0, 6).map((store) => (
                      <div key={String(store.store_id)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                        <p className="font-semibold text-slate-900">{store.store_name || `Store ${store.store_id}`}</p>
                        <p className="mt-1">ID {store.store_id} • City {store.city_id || '-'} • Zone {store.zone_id || '-'}</p>
                        <p className="mt-1 line-clamp-2">{store.store_address || 'Address unavailable'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">
                    No Pathao stores were returned for this merchant account.
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">
                  Load stores to inspect merchant store IDs and linked pickup locations.
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Price test</p>
              <div className="mt-3 grid gap-3">
                <input
                  value={pathaoPriceForm.store_id}
                  onChange={(event) => setPathaoPriceForm((current) => ({ ...current, store_id: event.target.value }))}
                  placeholder="Store ID"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={pathaoPriceForm.recipient_city}
                    onChange={(event) => setPathaoPriceForm((current) => ({ ...current, recipient_city: event.target.value }))}
                    placeholder="Recipient city"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <input
                    value={pathaoPriceForm.recipient_zone}
                    onChange={(event) => setPathaoPriceForm((current) => ({ ...current, recipient_zone: event.target.value }))}
                    placeholder="Recipient zone"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    value={pathaoPriceForm.item_weight}
                    onChange={(event) => setPathaoPriceForm((current) => ({ ...current, item_weight: event.target.value }))}
                    placeholder="Weight"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <select
                    value={pathaoPriceForm.delivery_type}
                    onChange={(event) => setPathaoPriceForm((current) => ({ ...current, delivery_type: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="48">Normal 48h</option>
                    <option value="12">On demand 12h</option>
                  </select>
                  <select
                    value={pathaoPriceForm.item_type}
                    onChange={(event) => setPathaoPriceForm((current) => ({ ...current, item_type: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="2">Parcel</option>
                    <option value="1">Document</option>
                  </select>
                </div>
                <button
                  onClick={() => void runPathaoAction('price-test', async () => {
                    if (!token) throw new Error('Admin login required');
                    const response = await fetch('/api/logistics/pathao/price', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(pathaoPriceForm),
                    });
                    const payload = await response.json().catch(() => null);
                    if (!response.ok) {
                      throw new Error(payload?.error || 'Failed to calculate Pathao price');
                    }
                    const price = payload?.data?.final_price ?? payload?.data?.price ?? 'unknown';
                    setPathaoResult(`Price test succeeded. Final price: ${price}.`);
                  })}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {pathaoActionLoading === 'price-test' ? 'Calculating...' : 'Run price test'}
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Single order test</p>
              <div className="mt-3 grid gap-3">
                <input value={pathaoOrderForm.store_id} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, store_id: event.target.value }))} placeholder="Store ID" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <input value={pathaoOrderForm.merchant_order_id} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, merchant_order_id: event.target.value }))} placeholder="Merchant order ID" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <input value={pathaoOrderForm.recipient_name} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, recipient_name: event.target.value }))} placeholder="Recipient name" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <input value={pathaoOrderForm.recipient_phone} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, recipient_phone: event.target.value }))} placeholder="Recipient phone" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <textarea value={pathaoOrderForm.recipient_address} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, recipient_address: event.target.value }))} placeholder="Recipient address" className="min-h-[88px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <div className="grid grid-cols-3 gap-3">
                  <input value={pathaoOrderForm.item_quantity} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, item_quantity: event.target.value }))} placeholder="Qty" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  <input value={pathaoOrderForm.item_weight} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, item_weight: event.target.value }))} placeholder="Weight" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  <input value={pathaoOrderForm.amount_to_collect} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, amount_to_collect: event.target.value }))} placeholder="COD" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <input value={pathaoOrderForm.item_description} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, item_description: event.target.value }))} placeholder="Item description" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <input value={pathaoOrderForm.special_instruction} onChange={(event) => setPathaoOrderForm((current) => ({ ...current, special_instruction: event.target.value }))} placeholder="Special instruction" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <button
                  onClick={() => void runPathaoAction('order-test', async () => {
                    if (!token) throw new Error('Admin login required');
                    const response = await fetch('/api/logistics/pathao/orders', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(pathaoOrderForm),
                    });
                    const payload = await response.json().catch(() => null);
                    if (!response.ok) {
                      throw new Error(payload?.error || 'Failed to create Pathao test order');
                    }
                    const consignmentId = payload?.data?.consignment_id || payload?.data?.consignmentId || 'unknown';
                    setPathaoResult(`Pathao test order created successfully. Consignment ID: ${consignmentId}.`);
                  })}
                  className="rounded-xl bg-[#ef4444] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#dc2626]"
                >
                  {pathaoActionLoading === 'order-test' ? 'Creating order...' : 'Create single order'}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Current readiness</p>
            <p className="mt-2">
              {steadfastProvider?.setupMessage || 'Steadfast should be operated through the manual merchant workflow.'}
            </p>
            <p className="mt-2 break-all text-xs text-slate-500">
              Base URL: {data?.steadfastHealth?.baseUrl || 'Not configured'}
            </p>
            <div className="mt-4 space-y-2 text-[13px]">
              <p>1. If API mode is ready, seller pickup requests can book Steadfast directly from the courier queue.</p>
              <p>2. If API mode is not active, seller can still book from the Steadfast merchant panel and keep the tracking code here.</p>
              <p>3. Seller or admin can sync or update shipment milestones so customer tracking stays live.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-semibold">When to use this block</p>
            <p className="mt-2">
              Use this workflow when Steadfast is the pickup partner but direct API automation is not yet enabled. The marketplace shipment history, admin orders, and customer tracking will still stay operational.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="/seller/courier?search=steadfast"
                className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                Open seller courier
              </a>
              <a
                href="/admin/orders?search=steadfast"
                className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                Open orders
              </a>
              <a
                href="/admin/settings"
                className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                Open settings
              </a>
            </div>
          </div>
        </div>
      </section>
          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="h-64 animate-pulse rounded-2xl border border-black/5 bg-white shadow-sm" />
            <div className="h-64 animate-pulse rounded-2xl border border-black/5 bg-white shadow-sm" />
            <div className="h-64 animate-pulse rounded-2xl border border-black/5 bg-white shadow-sm" />
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-primary" />
            <h2 className="font-bold text-slate-950">Courier provider readiness</h2>
          </div>
          <div className="mt-5 space-y-4">
            {data?.providers.map((provider) => (
              <div key={provider.code} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">{provider.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{provider.code}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    provider.setupStatus === 'api_ready'
                      ? 'bg-emerald-100 text-emerald-800'
                      : provider.setupStatus === 'missing_config'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                  }`}>
                    {provider.setupStatus === 'api_ready'
                      ? 'API ready'
                      : provider.setupStatus === 'missing_config'
                        ? 'Config needed'
                        : 'Manual ready'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">{provider.setupMessage || 'Provider setup details are not available.'}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">Mode: {provider.mode}</span>
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                    Tracking sync: {provider.supportsTrackingSync ? 'supported' : 'not active'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="/admin/settings"
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open settings
                  </a>
                  <a
                    href={provider.code === 'pathao' || provider.code === 'redx' ? '/admin/inventory' : '/admin/orders'}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    {provider.code === 'pathao' || provider.code === 'redx' ? 'Open mapping' : 'Open orders'}
                  </a>
                  <a
                    href="/admin/logistics"
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Stay in diagnostics
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <MapPinned size={18} className="text-primary" />
            <h2 className="font-bold text-slate-950">Warehouse mapping health</h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total</p>
              <p className="mt-2 text-xl font-bold text-slate-950">{data?.warehouseSummary.total || 0}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Area mapped</p>
              <p className="mt-2 text-xl font-bold text-emerald-900">{data?.warehouseSummary.areaMapped || 0}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Needs attention</p>
              <p className="mt-2 text-xl font-bold text-amber-900">{data?.warehouseSummary.needsAttention || 0}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-700">Shipping rules</p>
              <p className="mt-2 text-xl font-bold text-sky-900">{data?.warehouseSummary.shippingRulesReady || 0}</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {data?.warehouseHealth.length ? data.warehouseHealth.map((warehouse) => (
              <div key={warehouse.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">{warehouse.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{warehouse.city}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
                    <span className={`rounded-full px-2.5 py-1 ${warehouse.mapping_ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {warehouse.mapping_ready ? 'Area mapped' : 'Map area'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 ${warehouse.store_linked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {warehouse.store_linked ? `Store ${warehouse.pathao_store_id}` : 'Link store'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 ${warehouse.shipping_rules_ready ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                      {warehouse.shipping_rules_ready ? 'Rules ready' : 'Add shipping rules'}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Inside Dhaka: {warehouse.inside_dhaka_fee != null ? `BDT ${warehouse.inside_dhaka_fee}` : 'fee missing'} / {warehouse.inside_dhaka_eta || 'ETA missing'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Outside Dhaka: {warehouse.outside_dhaka_fee != null ? `BDT ${warehouse.outside_dhaka_fee}` : 'fee missing'} / {warehouse.outside_dhaka_eta || 'ETA missing'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/admin/inventory?warehouse=${encodeURIComponent(warehouse.id)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Fix in inventory
                  </a>
                  <a
                    href={`/seller/pickup-locations?warehouse=${encodeURIComponent(warehouse.id)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open seller pickup
                  </a>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                All tracked warehouses currently have area mapping, linked store coverage, and shipping rules.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-500" />
            <h2 className="font-bold text-slate-950">Recent shipment exceptions</h2>
          </div>
          <div className="mt-5 space-y-3">
            {renderedExceptions.length ? renderedExceptions.map((shipment) => (
              <div key={shipment.id} className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">Shipment #{shipment.id.slice(0, 8)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Order {shipment.order_id} • {shipment.customer_name || 'Customer'}
                    </p>
                  </div>
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-800">
                    {shipment.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {shipment.delivery_failure_reason || 'Needs manual courier follow-up.'}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {shipment.courier_provider || 'Courier pending'} • {shipment.tracking_id || 'Tracking pending'} • {shipment.updated_at ? new Date(shipment.updated_at).toLocaleString() : 'No update time'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/admin/orders?search=${encodeURIComponent(shipment.order_id)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open order
                  </a>
                  <a
                    href={`/admin/orders?search=${encodeURIComponent(shipment.tracking_id || shipment.id)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open courier queue
                  </a>
                  <a
                    href="/admin/inventory"
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open inventory mapping
                  </a>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No recent shipment exceptions right now.
              </div>
            )}
            {filteredExceptions.length > renderedExceptions.length ? (
              <button
                type="button"
                onClick={() => setExceptionRenderCount((current) => current + 16)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Load more exceptions
              </button>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-amber-500" />
            <h2 className="font-bold text-slate-950">Pathao sync watchlist</h2>
          </div>
          <div className="mt-5 space-y-3">
            {renderedPathaoWatchlist.length ? renderedPathaoWatchlist.map((shipment) => (
              <div key={shipment.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">Shipment #{shipment.id.slice(0, 8)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Order {shipment.order_id} • {shipment.customer_name || 'Customer'}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 shadow-sm">
                    {shipment.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Tracking {shipment.tracking_id || 'pending'} • {shipment.warehouse_name || 'Warehouse not linked'}
                </p>
                {shipment.pathao_last_event || shipment.pathao_last_status_slug ? (
                  <p className="mt-2 text-xs font-medium text-rose-700">
                    Pathao event: {(shipment.pathao_last_event || 'event pending').replaceAll('_', ' ').replaceAll('.', ' ')}
                    {shipment.pathao_last_status_slug
                      ? ` • ${(shipment.pathao_last_status_slug || '').replaceAll('_', ' ')}`
                      : ''}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                  {shipment.pathao_last_sync_at
                    ? `Last sync ${shipment.sync_age_hours ?? 0}h ago`
                    : 'Never synced after booking'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/admin/orders?search=${encodeURIComponent(shipment.order_id)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open order
                  </a>
                  <a
                    href={`/seller/courier?search=${encodeURIComponent(shipment.tracking_id || shipment.id)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open seller courier
                  </a>
                  <a
                    href="/admin/inventory"
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open inventory mapping
                  </a>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No active Pathao shipments need sync attention right now.
              </div>
            )}
            {filteredPathaoWatchlist.length > renderedPathaoWatchlist.length ? (
              <button
                type="button"
                onClick={() => setPathaoWatchRenderCount((current) => current + 12)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Load more Pathao shipments
              </button>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-red-500" />
            <h2 className="font-bold text-slate-950">RedX sync watchlist</h2>
          </div>
          <div className="mt-5 space-y-3">
            {renderedRedxWatchlist.length ? renderedRedxWatchlist.map((shipment) => (
              <div key={shipment.id} className="rounded-2xl border border-red-100 bg-red-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">Shipment #{shipment.id.slice(0, 8)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Order {shipment.order_id} • {shipment.customer_name || 'Customer'}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-800 shadow-sm">
                    {shipment.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Tracking {shipment.tracking_id || 'pending'} • {shipment.warehouse_name || 'Warehouse not linked'}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {shipment.redx_last_sync_at
                    ? `Last sync ${shipment.sync_age_hours ?? 0}h ago`
                    : 'Never synced after booking'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/admin/orders?search=${encodeURIComponent(shipment.order_id)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open order
                  </a>
                  <a
                    href={`/seller/courier?search=${encodeURIComponent(shipment.tracking_id || shipment.id)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open seller courier
                  </a>
                  <a
                    href="/admin/inventory"
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open inventory mapping
                  </a>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No active RedX shipments need sync attention right now.
              </div>
            )}
            {filteredRedxWatchlist.length > renderedRedxWatchlist.length ? (
              <button
                type="button"
                onClick={() => setRedxWatchRenderCount((current) => current + 12)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Load more RedX shipments
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};


