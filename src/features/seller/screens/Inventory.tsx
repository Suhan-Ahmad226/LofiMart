import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ExternalLink, Loader2, PackagePlus } from 'lucide-react';
import { Link } from '../../../lib/navigation';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '../../../components/seller/SellerPageHeader';
import { useUser } from '../../../features/shared/state/UserContext';
import { formatPrice } from '../../../lib/utils';
import { Product } from '../../../types';

const getInventoryState = (stock: number) => {
  if (stock <= 0) return 'out';
  if (stock < 5) return 'critical';
  if (stock < 10) return 'low';
  return 'healthy';
};

export const SellerInventoryPage = () => {
  const { token } = useUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [alerts, setAlerts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setProducts([]);
      setAlerts([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError('');

    Promise.all([
      fetch('/api/seller/products', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/seller/inventory-alerts', { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(async ([productsRes, alertsRes]) => {
        const productsPayload = await productsRes.json().catch(() => null);
        const alertsPayload = await alertsRes.json().catch(() => null);
        if (!productsRes.ok) throw new Error(productsPayload?.error || 'Failed to load inventory');
        if (!alertsRes.ok) throw new Error(alertsPayload?.error || 'Failed to load inventory alerts');
        if (!mounted) return;
        setProducts(Array.isArray(productsPayload) ? productsPayload : []);
        setAlerts(Array.isArray(alertsPayload) ? alertsPayload : []);
      })
      .catch((requestError: unknown) => {
        if (!mounted) return;
        setProducts([]);
        setAlerts([]);
        setError(requestError instanceof Error ? requestError.message : 'Failed to load inventory.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const metrics = useMemo(() => {
    const critical = products.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) < 5);
    const low = products.filter((product) => Number(product.stock || 0) >= 5 && Number(product.stock || 0) < 10);
    const out = products.filter((product) => Number(product.stock || 0) <= 0);
    return { total: products.length, critical: critical.length, low: low.length, out: out.length };
  }, [products]);

  const actionList = useMemo(
    () =>
      [...products]
        .filter((product) => Number(product.stock || 0) < 10)
        .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
        .slice(0, 12),
    [products],
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
        eyebrow="Stock control"
        title="Inventory"
        description="Watch low-stock pressure, out-of-stock products, and the next items that need replenishment."
        actions={
          <>
            <Link to="/seller/products/add" className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              <PackagePlus size={16} />
              Add product
            </Link>
            <Link to="/seller/products" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <ExternalLink size={16} />
              Open full catalog
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SellerStatCard label="Catalog" value={metrics.total} />
        <SellerStatCard label="Critical" value={metrics.critical} tone="critical" />
        <SellerStatCard label="Low" value={metrics.low} tone="warning" />
        <SellerStatCard label="Out" value={metrics.out} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Restock priority</h2>
              <p className="mt-1 text-sm text-slate-500">Products with the most urgent stock pressure.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{actionList.length} items</span>
          </div>
          <div className="mt-5 space-y-3">
            {actionList.length === 0 ? (
              <SellerEmptyState message="Inventory looks healthy right now." />
            ) : (
              actionList.map((product) => {
                const inventoryState = getInventoryState(Number(product.stock || 0));
                const tone =
                  inventoryState === 'out'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : inventoryState === 'critical'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-slate-50 border-slate-200 text-slate-800';

                return (
                  <div key={product.id} className={`rounded-2xl border px-4 py-4 ${tone}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        <p className="mt-1 text-xs opacity-80">SKU {product.sku || `PRD-${product.id}`} â€¢ {product.category}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold">Stock {Number(product.stock || 0)}</span>
                        <Link to={`/seller/products/edit/${product.id}`} className="text-sm font-semibold underline underline-offset-4">
                          Update
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-amber-500" size={18} />
              <h2 className="text-lg font-bold text-slate-950">Live low-stock alerts</h2>
            </div>
            <div className="mt-5 space-y-3">
              {alerts.length === 0 ? (
                <SellerEmptyState message="No live low-stock alerts." />
              ) : (
                alerts.slice(0, 8).map((product) => (
                  <div key={product.id} className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-semibold">{product.name}</p>
                    <p className="mt-1 text-xs">Only {Number(product.stock || 0)} left â€¢ {formatPrice(Number(product.price || 0))}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Archive className="text-slate-500" size={18} />
              <h2 className="text-lg font-bold text-slate-950">Out-of-stock products</h2>
            </div>
            <div className="mt-5 space-y-3">
              {products.filter((product) => Number(product.stock || 0) <= 0).length === 0 ? (
                <SellerEmptyState message="No products are fully out of stock." />
              ) : (
                products
                  .filter((product) => Number(product.stock || 0) <= 0)
                  .slice(0, 8)
                  .map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{product.category}</p>
                      </div>
                      <Link to={`/seller/products/edit/${product.id}`} className="text-sm font-semibold text-primary">
                        Restock
                      </Link>
                    </div>
                  ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SellerInventoryPage;
