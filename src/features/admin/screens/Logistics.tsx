import React, { useMemo, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, MapPinned, RefreshCw, Search, Truck } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';

type ProviderHealth = {
  provider: string;
  healthy: boolean;
  missingConfig: string[];
  hasCachedToken: boolean;
  tokenExpiresAt: string | null;
  refreshAvailable: boolean;
  webhookConfigured: boolean;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
};

type Provider = {
  code: string;
  name: string;
  mode: 'api';
  setupStatus: 'api_ready' | 'missing_config';
  setupMessage: string;
  missingConfig: string[];
  linkedStoreCount: number;
  activeShipmentCount: number;
  supportsTrackingSync: boolean;
  supportsPickupBooking: boolean;
  /** Null unless the load asked for a live probe. */
  health: ProviderHealth | null;
};

type DiagnosticsPayload = {
  updatedAt: string;
  liveProbe: boolean;
  providers: Provider[];
  /** Empty unless a live probe ran. */
  providerHealth: ProviderHealth[];
  readiness: {
    anyProviderConfigured: boolean;
    warehouseBlockers: Array<{
      id: string;
      name: string;
      provider: string | null;
      blockers: string[];
    }>;
    bookingCandidates: Array<{
      id: string;
      orderId: string;
      warehouseName: string | null;
      provider: string | null;
      trackingId: string | null;
      status: string;
      blockers: string[];
    }>;
  };
  warehouseSummary: {
    total: number;
    locationMapped: number;
    storeLinked: number;
    shippingRulesReady: number;
    needsAttention: number;
  };
  shipmentSummary: {
    active: number;
    exceptions: number;
    syncAttention: number;
    bookingBacklog: number;
  };
  warehouseHealth: Array<{
    id: string;
    name: string;
    city: string;
    provider: string | null;
    externalStoreId: string | null;
    externalStoreName: string | null;
    storeStatus: string | null;
    locationMapped: boolean;
    storeLinked: boolean;
    shippingRulesReady: boolean;
    insideDhakaFee: number | null;
    outsideDhakaFee: number | null;
    insideDhakaEta: string | null;
    outsideDhakaEta: string | null;
  }>;
  recentExceptions: Array<{
    id: string;
    orderId: string;
    customerName: string | null;
    warehouseName: string | null;
    warehouseCity: string | null;
    status: string;
    provider: string | null;
    trackingId: string | null;
    deliveryFailureReason: string | null;
    updatedAt: string | null;
  }>;
  syncWatchlist: Array<{
    id: string;
    orderId: string;
    customerName: string | null;
    warehouseName: string | null;
    provider: string | null;
    status: string;
    trackingId: string | null;
    bookingState: string | null;
    providerStatus: string | null;
    lastReconciledAt: string | null;
    syncAgeHours: number | null;
  }>;
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Fills in every field the render path reads, so no panel can crash on a partial
 * response and no screen code needs optional chaining on a required number.
 */
function normalizeDiagnosticsPayload(payload: Partial<DiagnosticsPayload> | null): DiagnosticsPayload {
  return {
    updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
    liveProbe: Boolean(payload?.liveProbe),
    providers: asArray(payload?.providers),
    providerHealth: asArray(payload?.providerHealth),
    readiness: {
      anyProviderConfigured: Boolean(payload?.readiness?.anyProviderConfigured),
      warehouseBlockers: asArray(payload?.readiness?.warehouseBlockers),
      bookingCandidates: asArray(payload?.readiness?.bookingCandidates),
    },
    warehouseSummary: {
      total: Number(payload?.warehouseSummary?.total || 0),
      locationMapped: Number(payload?.warehouseSummary?.locationMapped || 0),
      storeLinked: Number(payload?.warehouseSummary?.storeLinked || 0),
      shippingRulesReady: Number(payload?.warehouseSummary?.shippingRulesReady || 0),
      needsAttention: Number(payload?.warehouseSummary?.needsAttention || 0),
    },
    shipmentSummary: {
      active: Number(payload?.shipmentSummary?.active || 0),
      exceptions: Number(payload?.shipmentSummary?.exceptions || 0),
      syncAttention: Number(payload?.shipmentSummary?.syncAttention || 0),
      bookingBacklog: Number(payload?.shipmentSummary?.bookingBacklog || 0),
    },
    warehouseHealth: asArray(payload?.warehouseHealth),
    recentExceptions: asArray(payload?.recentExceptions),
    syncWatchlist: asArray(payload?.syncWatchlist),
  };
}

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
  const [storePanel, setStorePanel] = useState<{
    provider: string;
    stores: Array<{
      externalStoreId: string;
      externalStoreName: string | null;
      active: boolean;
      metadata?: Record<string, unknown> | null;
    }>;
  } | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [probing, setProbing] = useState(false);
  const [showDeferredOpsPanels, setShowDeferredOpsPanels] = useState(false);
  const deferredOpsRef = useRef<HTMLDivElement | null>(null);
  const [exceptionRenderCount, setExceptionRenderCount] = useState(16);
  const [watchRenderCount, setWatchRenderCount] = useState(12);

  /**
   * Loads diagnostics.
   *
   * `withProbe` appends `?probe=1`, which makes the server make a real
   * authenticated call to each courier. That is why the automatic load never sets
   * it: an operator leaving this tab open would otherwise spend the merchant's API
   * quota every few seconds for connectivity numbers nobody reads.
   */
  const loadDiagnostics = async (silent = false, withProbe = false) => {
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
      if (withProbe) {
        setProbing(true);
      }
      setError('');
      const response = await fetch(
        `/api/admin/logistics/diagnostics${withProbe ? '?probe=1' : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load logistics diagnostics');
      }
      setData(normalizeDiagnosticsPayload(payload));
    } catch (requestError) {
      setData(null);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load logistics diagnostics');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setProbing(false);
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

    // Built from the registry plus whatever the data actually contains, so the
    // filter offers a courier with zero shipments as well as a courier that is
    // no longer registered but still has historical parcels to explain.
    asArray(data?.providers).forEach((provider) => values.add(provider.code));
    asArray(data?.recentExceptions).forEach((shipment) => {
      if (shipment.provider) values.add(shipment.provider);
    });
    asArray(data?.syncWatchlist).forEach((shipment) => {
      if (shipment.provider) values.add(shipment.provider);
    });

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
    return asArray(data?.recentExceptions).filter((shipment) => {
      const provider = shipment.provider || '';
      const matchesProvider = providerFilter === 'all' || provider === providerFilter;

      return (
        matchesProvider &&
        matchesDateRange(shipment.updatedAt) &&
        (
          !needle ||
          shipment.id.toLowerCase().includes(needle) ||
          shipment.orderId.toLowerCase().includes(needle) ||
          String(shipment.customerName || '').toLowerCase().includes(needle) ||
          String(shipment.warehouseName || '').toLowerCase().includes(needle) ||
          String(shipment.provider || '').toLowerCase().includes(needle) ||
          String(shipment.trackingId || '').toLowerCase().includes(needle) ||
          shipment.status.toLowerCase().includes(needle)
        )
      );
    });
  }, [data, searchTerm, providerFilter, dateFrom, dateTo]);

  const filteredWatchlist = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return asArray(data?.syncWatchlist).filter((shipment) => {
      const provider = shipment.provider || '';
      const matchesProvider = providerFilter === 'all' || provider === providerFilter;

      return (
        matchesProvider &&
        matchesDateRange(shipment.lastReconciledAt || null) &&
        (
          !needle ||
          shipment.id.toLowerCase().includes(needle) ||
          shipment.orderId.toLowerCase().includes(needle) ||
          String(shipment.customerName || '').toLowerCase().includes(needle) ||
          String(shipment.warehouseName || '').toLowerCase().includes(needle) ||
          String(shipment.trackingId || '').toLowerCase().includes(needle) ||
          shipment.status.toLowerCase().includes(needle)
        )
      );
    });
  }, [data, searchTerm, providerFilter, dateFrom, dateTo]);

  const renderedExceptions = useMemo(
    () => filteredExceptions.slice(0, exceptionRenderCount),
    [exceptionRenderCount, filteredExceptions],
  );
  const renderedWatchlist = useMemo(
    () => filteredWatchlist.slice(0, watchRenderCount),
    [filteredWatchlist, watchRenderCount],
  );

  useEffect(() => {
    setExceptionRenderCount(16);
    setWatchRenderCount(12);
  }, [searchTerm, providerFilter, dateFrom, dateTo]);

  const handleExport = () => {
    const rows = [
      ...filteredExceptions.map((shipment) => ({
        source: 'exception',
        shipment_id: shipment.id,
        order_id: shipment.orderId,
        courier_provider: shipment.provider || '',
        tracking_id: shipment.trackingId || '',
        warehouse_name: shipment.warehouseName || '',
        customer_name: shipment.customerName || '',
        status: shipment.status,
        note: shipment.deliveryFailureReason || '',
        reference_time: shipment.updatedAt || '',
      })),
      ...filteredWatchlist.map((shipment) => ({
        source: 'sync_watchlist',
        shipment_id: shipment.id,
        order_id: shipment.orderId,
        courier_provider: shipment.provider || '',
        tracking_id: shipment.trackingId || '',
        warehouse_name: shipment.warehouseName || '',
        customer_name: shipment.customerName || '',
        status: shipment.status,
        // The booking state is what an operator acts on here, so it goes in the
        // note column rather than being left implicit in the status.
        note: shipment.bookingState || '',
        reference_time: shipment.lastReconciledAt || '',
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

  /**
   * Lists the pickup points a courier knows about.
   *
   * Replaces a panel that both hardcoded one courier's store id shape and offered
   * hand-built "price test" and "book a parcel" forms. Those two are gone on
   * purpose: a parcel booked from a browser form bypassed our idempotency keys and
   * charge accounting entirely, and a price shown there was not the price checkout
   * would charge.
   */
  const loadProviderStores = async (providerCode: string) => {
    if (!token) return;
    setStoreLoading(true);
    setStoreError('');
    try {
      const response = await fetch(
        `/api/logistics/stores?provider=${encodeURIComponent(providerCode)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load pickup points');
      }
      setStorePanel({
        provider: providerCode,
        stores: asArray(payload?.remoteStores).map((store: any) => ({
          externalStoreId: String(store.externalStoreId),
          externalStoreName: store.externalStoreName ?? null,
          active: Boolean(store.active),
          metadata: store.metadata ?? null,
        })),
      });
    } catch (loadError) {
      setStorePanel(null);
      setStoreError(
        loadError instanceof Error ? loadError.message : 'Failed to load pickup points',
      );
    } finally {
      setStoreLoading(false);
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
    <div className="min-w-0 space-y-5 sm:space-y-7 lg:space-y-8">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">Courier diagnostics</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">Logistics readiness and shipment health</h1>
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
        <div className="relative min-w-0 flex-1">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Providers ready</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">
            {data?.providers.filter((provider) => provider.setupStatus === 'api_ready').length || 0}
          </p>
          <p className="mt-1 text-xs text-gray-400">Direct API-capable courier providers</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Warehouses mapped</p>
          <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{data?.warehouseSummary.locationMapped || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Pickup locations with courier city, zone, and area mapped</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Exceptions</p>
          <p className="mt-2 text-xl font-bold text-rose-600 md:text-2xl">{data?.shipmentSummary.exceptions || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Failed, returned, or cancelled shipments</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Sync attention</p>
          <p className="mt-2 text-xl font-bold text-amber-600 md:text-2xl">{data?.shipmentSummary.syncAttention || 0}</p>
          <p className="mt-1 text-xs text-gray-400">Active shipments the courier cannot yet confirm</p>
        </div>
      </div>

      <div ref={deferredOpsRef} className="space-y-8">
        {showDeferredOpsPanels ? (
          <>
      <section className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-base font-black uppercase tracking-[0.18em] text-white shadow-sm">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Courier ops</p>
              <h2 className="text-lg font-bold text-slate-950">Token and connectivity health</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadDiagnostics(true, true)}
            disabled={probing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {probing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>{probing ? 'Probing...' : 'Run live probe'}</span>
          </button>
        </div>

        {/*
          Connectivity is only known after a probe, so "not checked" is rendered
          explicitly instead of being shown as a red failure. An operator would
          otherwise learn to ignore a permanently red panel.
        */}
        {!data?.liveProbe ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Token state and connectivity are unknown. Nothing is probed on load, because
            each probe is a real authenticated call to the courier. Use
            <span className="font-semibold"> Run live probe</span> when you need a current answer.
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          {data?.providerHealth.length ? data.providerHealth.map((report) => {
            const provider = data.providers.find((entry) => entry.code === report.provider);
            return (
              <div key={report.provider} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{provider?.name || report.provider}</p>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    report.healthy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {report.healthy ? 'Healthy' : 'Unhealthy'}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Cached token</p>
                    <p className={`mt-1 text-sm font-bold ${report.hasCachedToken ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {report.hasCachedToken ? 'Ready' : 'Missing'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Linked pickup points</p>
                    <p className="mt-1 text-sm font-bold text-slate-950">{provider?.linkedStoreCount || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Webhook</p>
                    <p className={`mt-1 text-sm font-bold ${report.webhookConfigured ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {report.webhookConfigured ? 'Configured' : 'Missing'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Latency</p>
                    <p className="mt-1 text-sm font-bold text-slate-950">
                      {report.latencyMs != null ? `${report.latencyMs}ms` : 'N/A'}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600">{report.message}</p>
                {report.missingConfig.length ? (
                  <p className="mt-2 text-xs text-amber-800">
                    {/* Key names only. The adapter never returns values, so this
                        cannot leak a secret. */}
                    Missing config: {report.missingConfig.join(', ')}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">
                  Checked {new Date(report.checkedAt).toLocaleString()}
                  {report.refreshAvailable ? ' • refresh token available' : ''}
                </p>
              </div>
            );
          }) : null}
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-rose-500">Go-live</p>
            <h2 className="mt-2 text-lg font-bold text-slate-950">Exact launch checklist and blockers</h2>
            <p className="mt-2 text-sm text-slate-500">
              This section shows what is still blocking live booking: courier config, pickup point mapping, or shipment data.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
            data?.readiness.anyProviderConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {data?.readiness.anyProviderConfigured ? 'Courier configured' : 'Courier config needed'}
          </span>
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-[0.8fr_1.1fr_1.1fr]">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Courier configuration</h3>
            {asArray(data?.providers).map((provider) => (
              <div key={provider.code} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <div>
                  <span className="font-medium text-slate-700">{provider.name}</span>
                  {provider.missingConfig.length ? (
                    <p className="mt-1 text-[11px] text-amber-800">
                      Missing: {provider.missingConfig.join(', ')}
                    </p>
                  ) : null}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  provider.setupStatus === 'api_ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {provider.setupStatus === 'api_ready' ? 'Ready' : 'Missing'}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Pickup point blockers</h3>
            {asArray(data?.readiness.warehouseBlockers).length ? asArray(data?.readiness.warehouseBlockers).map((warehouse) => (
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
                No warehouse-level pickup point blockers right now.
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Shipment dry-run blockers</h3>
            {asArray(data?.readiness.bookingCandidates).length ? asArray(data?.readiness.bookingCandidates).map((shipment) => (
              <div key={shipment.id} className={`rounded-2xl border p-4 ${
                shipment.blockers.length ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">Shipment #{shipment.id.slice(0, 8)}</p>
                    <p className="mt-1 text-sm text-slate-600">Order {shipment.orderId} • {shipment.warehouseName || 'Warehouse pending'}</p>
                  </div>
                  <a
                    href={`/seller/courier?search=${encodeURIComponent(shipment.trackingId || shipment.id)}`}
                    className="text-[11px] font-semibold text-slate-700 hover:text-primary"
                  >
                    Open seller courier
                  </a>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {shipment.provider || 'Provider pending'} • {shipment.status.replaceAll('_', ' ')} • {shipment.trackingId || 'Tracking pending'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {shipment.blockers.length ? shipment.blockers.map((blocker) => (
                    <span key={blocker} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-amber-800 shadow-sm">
                      {blocker}
                    </span>
                  )) : (
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm">
                      Ready for booking
                    </span>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No active shipment candidates found for dry-run checks.
              </div>
            )}
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
        <section className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-primary" />
            <h2 className="font-bold text-slate-950">Pathao courier readiness</h2>
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
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                    Pickup points: {provider.linkedStoreCount}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                    Active shipments: {provider.activeShipmentCount}
                  </span>
                </div>
                {provider.missingConfig.length ? (
                  <p className="mt-3 text-xs text-amber-800">
                    Missing config: {provider.missingConfig.join(', ')}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="/admin/settings"
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open settings
                  </a>
                  {/*
                    Pickup point mapping lives in inventory for every courier, so
                    the link is no longer chosen by testing `provider.code === 'pathao'`.
                  */}
                  <a
                    href="/admin/inventory"
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open mapping
                  </a>
                  <a
                    href="/admin/orders"
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open orders
                  </a>
                  <button
                    type="button"
                    onClick={() => void loadProviderStores(provider.code)}
                    disabled={storeLoading}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    {storeLoading && storePanel?.provider === provider.code
                      ? 'Loading...'
                      : 'List courier pickup points'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {storeError ? (
            <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
              {storeError}
            </div>
          ) : null}
          {storePanel?.stores.length ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">
                Pickup points at {storePanel.provider} ({storePanel.stores.length})
              </p>
              <div className="mt-3 space-y-2">
                {storePanel.stores.map((store) => (
                  <div key={store.externalStoreId} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {store.externalStoreName || store.externalStoreId}
                      </p>
                      <p className="text-[11px] text-slate-500">{store.externalStoreId}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      store.active ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {store.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-6">
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
              <p className="mt-2 text-xl font-bold text-emerald-900">{data?.warehouseSummary.locationMapped || 0}</p>
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
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">{warehouse.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{warehouse.city}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
                    <span className={`rounded-full px-2.5 py-1 ${warehouse.locationMapped ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {warehouse.locationMapped ? 'Area mapped' : 'Map area'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 ${warehouse.storeLinked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {/*
                        The courier's own pickup point id, from the provider-neutral
                        mapping. A store that exists but is still awaiting approval is
                        labelled as such, because "linked" would imply it is bookable.
                      */}
                      {warehouse.storeLinked
                        ? `Pickup point ${warehouse.externalStoreId || 'pending'}${
                            warehouse.storeStatus && warehouse.storeStatus !== 'active'
                              ? ` (${warehouse.storeStatus})`
                              : ''
                          }`
                        : 'Link pickup point'}
                    </span>
                    {warehouse.provider ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                        {warehouse.provider}
                      </span>
                    ) : null}
                    <span className={`rounded-full px-2.5 py-1 ${warehouse.shippingRulesReady ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                      {warehouse.shippingRulesReady ? 'Rules ready' : 'Add shipping rules'}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Inside Dhaka: {warehouse.insideDhakaFee != null ? `BDT ${warehouse.insideDhakaFee}` : 'fee missing'} / {warehouse.insideDhakaEta || 'ETA missing'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Outside Dhaka: {warehouse.outsideDhakaFee != null ? `BDT ${warehouse.outsideDhakaFee}` : 'fee missing'} / {warehouse.outsideDhakaEta || 'ETA missing'}
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
        <section className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-500" />
            <h2 className="font-bold text-slate-950">Recent shipment exceptions</h2>
          </div>
          <div className="mt-5 space-y-3">
            {renderedExceptions.length ? renderedExceptions.map((shipment) => (
              <div key={shipment.id} className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">Shipment #{shipment.id.slice(0, 8)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Order {shipment.orderId} • {shipment.customerName || 'Customer'}
                    </p>
                  </div>
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-800">
                    {shipment.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {shipment.deliveryFailureReason || 'Needs manual courier follow-up.'}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {shipment.provider || 'Courier pending'} • {shipment.trackingId || 'Tracking pending'} • {shipment.updatedAt ? new Date(shipment.updatedAt).toLocaleString() : 'No update time'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/admin/orders?search=${encodeURIComponent(shipment.orderId)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open order
                  </a>
                  <a
                    href={`/admin/orders?search=${encodeURIComponent(shipment.trackingId || shipment.id)}`}
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

        <section className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-amber-500" />
            <h2 className="font-bold text-slate-950">Sync watchlist</h2>
          </div>
          <div className="mt-5 space-y-3">
            {renderedWatchlist.length ? renderedWatchlist.map((shipment) => (
              <div key={shipment.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div>
                    <p className="font-semibold text-slate-950">Shipment #{shipment.id.slice(0, 8)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Order {shipment.orderId} • {shipment.customerName || 'Customer'}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 shadow-sm">
                    {shipment.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Tracking {shipment.trackingId || 'pending'} • {shipment.warehouseName || 'Warehouse not linked'}
                </p>
                {shipment.providerStatus || shipment.providerStatus ? (
                  <p className="mt-2 text-xs font-medium text-rose-700">
                    Pathao event: {(shipment.providerStatus || 'event pending').replaceAll('_', ' ').replaceAll('.', ' ')}
                    {shipment.providerStatus
                      ? ` • ${(shipment.providerStatus || '').replaceAll('_', ' ')}`
                      : ''}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                  {shipment.lastReconciledAt
                    ? `Last sync ${shipment.syncAgeHours ?? 0}h ago`
                    : 'Never synced after booking'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/admin/orders?search=${encodeURIComponent(shipment.orderId)}`}
                    className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                  >
                    Open order
                  </a>
                  <a
                    href={`/seller/courier?search=${encodeURIComponent(shipment.trackingId || shipment.id)}`}
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
                No active shipments need sync attention right now.
              </div>
            )}
            {filteredWatchlist.length > renderedWatchlist.length ? (
              <button
                type="button"
                onClick={() => setWatchRenderCount((current) => current + 12)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Load more shipments
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};


