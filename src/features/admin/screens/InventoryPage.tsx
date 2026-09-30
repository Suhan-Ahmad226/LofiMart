import React from 'react';
import WarehouseList from '@/features/inventory/components/WarehouseList';
import SupplierList from '@/features/inventory/components/SupplierList';
import PurchaseOrderList from '@/features/inventory/components/PurchaseOrderList';
import InventoryItemList from '@/features/inventory/components/InventoryItemList';
import InventoryDashboard from '@/features/inventory/components/InventoryDashboard';
import { useInventoryActions } from '@/features/inventory/hooks/useInventoryActions';
import { useInventorySync } from '@/features/inventory/hooks/useInventorySync';
import { useInventoryState } from '../../../features/inventory/state/InventoryContext';
import { Link, useSearchParams } from '../../../lib/navigation';

const InventoryPage: React.FC = () => {
  const { loadAll } = useInventoryActions();
  const { status } = useInventorySync(true);
  const { error, loading, inventory, warehouses, purchaseOrders } = useInventoryState();
  const [searchParams] = useSearchParams();
  const urlProduct = searchParams.get('product') || '';
  const [queueFilter, setQueueFilter] = React.useState<'all' | 'critical'>('all');
  const [queueView, setQueueView] = React.useState<'items' | 'warehouses'>('items');
  const [queueSort, setQueueSort] = React.useState<'severity' | 'pending_po' | 'warehouse'>('severity');
  const [focusedProductId, setFocusedProductId] = React.useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(true);
  const [nextRefreshInSeconds, setNextRefreshInSeconds] = React.useState(60);
  const [itemRenderCount, setItemRenderCount] = React.useState(8);
  const [warehouseRenderCount, setWarehouseRenderCount] = React.useState(6);
  const [inventoryTab, setInventoryTab] = React.useState<'all' | 'low' | 'out' | 'warehouses'>('all');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const saved = window.localStorage.getItem('inventory_restock_auto_refresh');
    if (saved === 'off') {
      setAutoRefreshEnabled(false);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('inventory_restock_auto_refresh', autoRefreshEnabled ? 'on' : 'off');
  }, [autoRefreshEnabled]);

  React.useEffect(() => {
    void loadAll().then(() => setLastRefreshedAt(new Date().toISOString()));
  }, [loadAll]);

  React.useEffect(() => {
    if (!autoRefreshEnabled) {
      setNextRefreshInSeconds(0);
      return;
    }

    setNextRefreshInSeconds(60);
    const intervalId = window.setInterval(() => {
      void loadAll().then(() => setLastRefreshedAt(new Date().toISOString()));
      setNextRefreshInSeconds(60);
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [autoRefreshEnabled, loadAll]);

  React.useEffect(() => {
    if (!autoRefreshEnabled) return;

    const countdownId = window.setInterval(() => {
      setNextRefreshInSeconds((current) => (current <= 1 ? 60 : current - 1));
    }, 1000);

    return () => window.clearInterval(countdownId);
  }, [autoRefreshEnabled]);

  React.useEffect(() => {
    if (urlProduct) {
      setFocusedProductId(urlProduct);
    }
  }, [urlProduct]);

  const lowStockQueue = React.useMemo(() => {
    return inventory
      .filter((item) => item.quantity <= (item.restockThreshold ?? item.reorderLevel))
      .map((item) => {
        const warehouse = warehouses.find((entry) => entry.id === item.warehouseId);
        const pendingPurchaseOrders = purchaseOrders.filter(
          (po) =>
            po.status !== 'cancelled' &&
            po.status !== 'fulfilled' &&
            po.items.some((line) => line.productId === item.productId),
        ).length;

        return {
          ...item,
          warehouseName: warehouse?.name || 'Unassigned warehouse',
          pendingPurchaseOrders,
          threshold: item.restockThreshold ?? item.reorderLevel,
        };
      })
      .sort((a, b) => a.quantity - b.quantity)
      ;
  }, [inventory, purchaseOrders, warehouses]);

  const visibleLowStockQueue = React.useMemo(() => {
    const filtered = lowStockQueue.filter((item) => (queueFilter === 'critical' ? item.quantity <= 2 : true));

    return [...filtered].sort((a, b) => {
      if (queueSort === 'pending_po') {
        if (b.pendingPurchaseOrders !== a.pendingPurchaseOrders) {
          return b.pendingPurchaseOrders - a.pendingPurchaseOrders;
        }
        return a.quantity - b.quantity;
      }

      if (queueSort === 'warehouse') {
        const warehouseCompare = a.warehouseName.localeCompare(b.warehouseName);
        if (warehouseCompare !== 0) return warehouseCompare;
        return a.quantity - b.quantity;
      }

      const aSeverity = a.quantity <= 2 ? 0 : 1;
      const bSeverity = b.quantity <= 2 ? 0 : 1;
      if (aSeverity !== bSeverity) return aSeverity - bSeverity;
      if (a.quantity !== b.quantity) return a.quantity - b.quantity;
      return b.pendingPurchaseOrders - a.pendingPurchaseOrders;
    });
  }, [lowStockQueue, queueFilter, queueSort]);

  const warehouseGroupedQueue = React.useMemo(() => {
    const groups = new Map<
      string,
      {
        warehouseId: string;
        warehouseName: string;
        criticalCount: number;
        totalCount: number;
        pendingPurchaseOrders: number;
        items: typeof visibleLowStockQueue;
      }
    >();

    for (const item of visibleLowStockQueue) {
      const key = item.warehouseId || 'unassigned';
      const existing = groups.get(key) ?? {
        warehouseId: key,
        warehouseName: item.warehouseName,
        criticalCount: 0,
        totalCount: 0,
        pendingPurchaseOrders: 0,
        items: [],
      };

      existing.totalCount += 1;
      existing.pendingPurchaseOrders += item.pendingPurchaseOrders;
      if (item.quantity <= 2) {
        existing.criticalCount += 1;
      }
      existing.items.push(item);
      groups.set(key, existing);
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
      return b.totalCount - a.totalCount;
    });
  }, [visibleLowStockQueue]);

  const renderedLowStockQueue = React.useMemo(
    () => visibleLowStockQueue.slice(0, itemRenderCount),
    [visibleLowStockQueue, itemRenderCount],
  );

  const renderedWarehouseQueue = React.useMemo(
    () => warehouseGroupedQueue.slice(0, warehouseRenderCount),
    [warehouseGroupedQueue, warehouseRenderCount],
  );

  const restockMetrics = React.useMemo(
    () => ({
      totalItems: visibleLowStockQueue.length,
      criticalItems: visibleLowStockQueue.filter((item) => item.quantity <= 2).length,
      pendingPoItems: visibleLowStockQueue.filter((item) => item.pendingPurchaseOrders > 0).length,
      warehousesAffected: new Set(
        visibleLowStockQueue.map((item) => item.warehouseId || `unassigned:${item.warehouseName}`),
      ).size,
    }),
    [visibleLowStockQueue],
  );

  const outOfStockCount = inventory.filter((item) => item.quantity <= 0).length;
  const lowStockCount = lowStockQueue.length;

  const freshness = React.useMemo(() => {
    if (!lastRefreshedAt) {
      return {
        label: 'Waiting for first refresh',
        tone: 'bg-slate-100 text-slate-600',
      };
    }

    const ageMs = Date.now() - new Date(lastRefreshedAt).getTime();
    const ageSeconds = Math.max(0, Math.floor(ageMs / 1000));

    if (ageSeconds < 90) {
      return {
        label: `Fresh ${ageSeconds}s ago`,
        tone: 'bg-emerald-100 text-emerald-700',
      };
    }

    const ageMinutes = Math.floor(ageSeconds / 60);
    if (ageMinutes < 5) {
      return {
        label: `Updated ${ageMinutes}m ago`,
        tone: 'bg-amber-100 text-amber-700',
      };
    }

    return {
      label: `Stale ${ageMinutes}m ago`,
      tone: 'bg-rose-100 text-rose-700',
    };
  }, [lastRefreshedAt]);

  const exportRestockQueue = React.useCallback(() => {
    if (typeof window === 'undefined') return;

    const rows =
      queueView === 'warehouses'
        ? warehouseGroupedQueue.map((group) => ({
            type: 'warehouse',
            warehouse: group.warehouseName,
            warehouse_id: group.warehouseId,
            total_low_stock_items: group.totalCount,
            critical_items: group.criticalCount,
            pending_po_total: group.pendingPurchaseOrders,
            sample_products: group.items.map((item) => item.productId).join(' | '),
          }))
        : visibleLowStockQueue.map((item) => ({
            type: 'item',
            product_id: item.productId,
            inventory_item_id: item.id,
            warehouse: item.warehouseName,
            warehouse_id: item.warehouseId,
            quantity: item.quantity,
            threshold: item.threshold,
            pending_po_count: item.pendingPurchaseOrders,
            severity: item.quantity <= 2 ? 'critical' : 'low',
          }));

    if (rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header as keyof typeof row] ?? '').replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restock-queue-${queueView}-${queueFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [queueFilter, queueView, visibleLowStockQueue, warehouseGroupedQueue]);

  React.useEffect(() => {
    if (!focusedProductId) return;

    const matched = visibleLowStockQueue.find((item) => item.productId === focusedProductId);
    if (!matched) return;

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`restock-queue-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [focusedProductId, visibleLowStockQueue]);

  React.useEffect(() => {
    setItemRenderCount(8);
    setWarehouseRenderCount(6);
  }, [queueFilter, queueView, queueSort]);

  return (
    <div className="min-h-full bg-[#f8f2fa] p-4 text-[#1d1b20] md:p-6">
      <div className="mx-auto max-w-[1480px]">
      <div className="mb-6 flex flex-col gap-4 border-b border-[#cbc4d2]/60 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1d1b20]">Inventory Management</h1>
          <p className="mt-1 text-sm text-[#494551]">Monitor stock, warehouses, suppliers and purchase orders.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[#63597c]">
            <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${status === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} /> Live sync</span>
            <span className="text-[#7a7582]">{lastRefreshedAt ? `Updated ${new Date(lastRefreshedAt).toLocaleTimeString()}` : 'Waiting for first update'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              status === 'live'
                ? 'bg-green-100 text-green-700'
                : status === 'local'
                ? 'bg-amber-100 text-amber-700'
                : status === 'connecting'
                ? 'bg-blue-100 text-blue-700'
                : status === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {status === 'local' ? 'local-only' : status}
          </span>
          <button
            onClick={() => void loadAll().then(() => setLastRefreshedAt(new Date().toISOString()))}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4f378a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6750a4]"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh ↻'}
          </button>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Total Products', inventory.length, 'text-[#1d1b20]'],
          ['Low Stock', lowStockCount, 'text-amber-700'],
          ['Critical', restockMetrics.criticalItems, 'text-rose-700'],
          ['Pending PO', restockMetrics.pendingPoItems, 'text-[#4f378a]'],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-xl bg-white px-4 py-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7a7582]">{label}</p>
            <p className={`mt-2 text-2xl font-extrabold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-sm md:p-5">
        <div className="mobile-sticky-toolbar flex flex-col gap-3 p-3 md:flex-row md:items-start md:justify-between md:p-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg text-amber-600">⚠</span>
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1d1b20]">Restock Queue</h2>
            </div>
            <p className="mt-2 text-sm text-[#494551]">Items below their reorder threshold need purchase-order follow-up.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${freshness.tone}`}>
              {freshness.label}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {autoRefreshEnabled ? `Next refresh in ${nextRefreshInSeconds}s` : 'Auto refresh paused'}
            </span>
            <button
              type="button"
              onClick={() => setAutoRefreshEnabled((current) => !current)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                autoRefreshEnabled
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Auto refresh {autoRefreshEnabled ? 'on' : 'off'}
            </button>
            <button
              type="button"
              onClick={() => setQueueFilter('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                queueFilter === 'all'
                  ? 'bg-slate-950 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              All low stock ({lowStockQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setQueueFilter('critical')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                queueFilter === 'critical'
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50'
              }`}
            >
              Critical only ({lowStockQueue.filter((item) => item.quantity <= 2).length})
            </button>
            <button
              type="button"
              onClick={() => setQueueView('items')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                queueView === 'items'
                  ? 'bg-slate-950 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              Item view
            </button>
            <button
              type="button"
              onClick={() => setQueueView('warehouses')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                queueView === 'warehouses'
                  ? 'bg-slate-950 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              Warehouse view
            </button>
            <select
              value={queueSort}
              onChange={(event) => setQueueSort(event.target.value as typeof queueSort)}
              className="min-w-[140px] rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <option value="severity">Sort: Severity</option>
              <option value="pending_po">Sort: Pending PO</option>
              <option value="warehouse">Sort: Warehouse</option>
            </select>
            <Link
              to="/admin/inventory?section=po"
              className="rounded-lg bg-[#4f378a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6750a4]"
            >
              View All →
            </Link>
            <button
              type="button"
              onClick={exportRestockQueue}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-lg border border-[#ece6ee] bg-[#f8f2fa] px-3 py-3 md:px-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visible Items</p>
            <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{restockMetrics.totalItems}</p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 md:px-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Critical</p>
            <p className="mt-2 text-xl font-bold text-rose-700 md:text-2xl">{restockMetrics.criticalItems}</p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 md:px-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">With Pending PO</p>
            <p className="mt-2 text-xl font-bold text-amber-700 md:text-2xl">{restockMetrics.pendingPoItems}</p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-3 md:px-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warehouses</p>
            <p className="mt-2 text-xl font-bold text-slate-950 md:text-2xl">{restockMetrics.warehousesAffected}</p>
          </div>
        </div>

        {visibleLowStockQueue.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-amber-200 bg-white/70 px-4 py-5 text-sm text-slate-600">
            {queueFilter === 'critical'
              ? 'No critical stock items are currently below 2 units.'
              : 'No inventory items are currently below the configured reorder threshold.'}
          </div>
        ) : queueView === 'warehouses' ? (
          <>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {renderedWarehouseQueue.map((group) => (
              <div
                key={group.warehouseId}
                className={`rounded-xl border px-4 py-4 ${
                  group.criticalCount > 0 ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-white/80'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{group.warehouseName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {group.totalCount} low-stock item{group.totalCount === 1 ? '' : 's'}
                      {group.criticalCount > 0 ? ` â€¢ ${group.criticalCount} critical` : ''}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      group.criticalCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {group.pendingPurchaseOrders} pending PO
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.items.slice(0, 4).map((item) => (
                    <span
                      key={item.id}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        item.quantity <= 2 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.productId}: {item.quantity}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-semibold">
                  <Link
                    to={
                      group.warehouseId !== 'unassigned'
                        ? `/admin/inventory?warehouse=${encodeURIComponent(group.warehouseId)}`
                        : '/admin/inventory'
                    }
                    className="text-primary hover:underline"
                  >
                    Open warehouse
                  </Link>
                  <Link
                    to={
                      group.items[0]
                        ? `/admin/inventory?section=po&product=${encodeURIComponent(group.items[0].productId)}`
                        : '/admin/inventory?section=po'
                    }
                    className="text-slate-950 hover:text-primary hover:underline"
                  >
                    Start restock
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {warehouseGroupedQueue.length > renderedWarehouseQueue.length ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setWarehouseRenderCount((current) => current + 6)}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Load more warehouses
              </button>
            </div>
          ) : null}
          </>
        ) : (
          <>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {renderedLowStockQueue.map((item) => (
              <div
                id={`restock-queue-${item.id}`}
                key={item.id}
                className={`rounded-xl border px-4 py-4 ${
                  item.quantity <= 2 ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-white/80'
                } ${item.productId === focusedProductId ? 'ring-2 ring-indigo-200' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Product {item.productId}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.warehouseName}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      item.quantity <= 2 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {item.quantity <= 2 ? 'Critical' : 'Low'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-700">
                  <span>Qty {item.quantity}</span>
                  <span>Threshold {item.threshold}</span>
                  <span className={item.pendingPurchaseOrders > 0 ? 'font-semibold text-amber-700' : ''}>
                    {item.pendingPurchaseOrders} pending PO
                  </span>
                </div>
                {item.pendingPurchaseOrders > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                    A purchase order already exists for this product. Review before creating another one.
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-semibold">
                  <Link
                    to={`/admin/inventory?product=${encodeURIComponent(item.productId)}`}
                    className="text-primary hover:underline"
                  >
                    Open stock row
                  </Link>
                  <Link
                    to={`/admin/inventory?section=po&product=${encodeURIComponent(item.productId)}`}
                    className="text-slate-950 hover:text-primary hover:underline"
                  >
                    Create PO
                  </Link>
                  <Link
                    to={`/admin/products?search=${encodeURIComponent(item.productId)}&product=${encodeURIComponent(item.productId)}`}
                    className="text-slate-600 hover:text-primary hover:underline"
                  >
                    Open product
                  </Link>
                  <Link
                    to="/admin/inventory?section=suppliers"
                    className="text-slate-600 hover:text-primary hover:underline"
                  >
                    Open suppliers
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {visibleLowStockQueue.length > renderedLowStockQueue.length ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setItemRenderCount((current) => current + 8)}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Load more items
              </button>
            </div>
          ) : null}
          </>
        )}
      </div>
      <section className="mb-6 rounded-xl bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-[#ece6ee] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1d1b20]">Inventory</h2>
            <p className="mt-1 text-sm text-[#494551]">Search and manage every stock record across your warehouses.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['all', 'All Items'],
              ['low', 'Low Stock'],
              ['out', `Out of Stock (${outOfStockCount})`],
              ['warehouses', 'Warehouses'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setInventoryTab(value as typeof inventoryTab)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  inventoryTab === value ? 'bg-[#4f378a] text-white' : 'bg-[#f2ecf4] text-[#63597c] hover:bg-[#e6e0e9]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 rounded-lg border border-[#cbc4d2]/70 bg-[#f8f2fa] px-4 py-3 text-sm text-[#7a7582]">Search product / SKU...</div>
          <button type="button" className="rounded-lg bg-[#f2ecf4] px-4 py-2.5 text-sm font-semibold text-[#63597c] hover:bg-[#e6e0e9]">Filters</button>
        </div>
      </section>
      <section className="mb-6 rounded-xl bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#1d1b20]">Quick Access</h2>
            <p className="mt-1 text-sm text-[#494551]">Jump to the operational areas used most often.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link to="/admin/inventory?section=warehouses" className="rounded-lg bg-[#f2ecf4] px-4 py-4 text-sm font-bold text-[#4f378a] transition hover:bg-[#e9ddff]">Warehouses <span className="float-right">→</span></Link>
          <Link to="/admin/inventory?section=suppliers" className="rounded-lg bg-[#f2ecf4] px-4 py-4 text-sm font-bold text-[#4f378a] transition hover:bg-[#e9ddff]">Suppliers <span className="float-right">→</span></Link>
          <Link to="/admin/inventory?section=po" className="rounded-lg bg-[#f2ecf4] px-4 py-4 text-sm font-bold text-[#4f378a] transition hover:bg-[#e9ddff]">Purchase Orders <span className="float-right">→</span></Link>
        </div>
      </section>
      <InventoryDashboard />
      <WarehouseList />
      <SupplierList />
      <PurchaseOrderList />
      <InventoryItemList />
    </div>
    </div>
  );
};

export default InventoryPage;
