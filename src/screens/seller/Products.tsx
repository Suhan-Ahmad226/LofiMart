import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ExternalLink,
  AlertCircle,
  Printer,
  Package,
  Boxes,
  Archive,
  AlertTriangle,
} from 'lucide-react';
import { Product } from '../../types';
import { formatPrice } from '../../lib/utils';
import OptimizedImage from '../../components/ui/OptimizedImage';
import { Link, useNavigate } from '@/src/lib/navigation';
import { useUser } from '../../context/UserContext';
import { TableSkeleton } from '../../components/ui/DataSkeletons';
import { printSkuLabel, printSkuLabelSheet } from '../../lib/skuLabel';
import toast from 'react-hot-toast';
import { SellerEmptyState, SellerPageHeader, SellerStatCard } from '../../components/seller/SellerPageHeader';

type ProductTab = 'all' | 'active' | 'low_stock' | 'out_of_stock';

const getInventoryStatus = (stock: number): ProductTab => {
  if (stock <= 0) return 'out_of_stock';
  if (stock < 10) return 'low_stock';
  return 'active';
};

const renderInventoryLabel = (status: ProductTab) => {
  if (status === 'out_of_stock') return 'Out of stock';
  if (status === 'low_stock') return 'Low stock';
  return 'Active';
};

const renderInventoryTone = (status: ProductTab) => {
  if (status === 'out_of_stock') return 'bg-rose-100 text-rose-700';
  if (status === 'low_stock') return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-800';
};

export const SellerProductsPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [focusedProductId, setFocusedProductId] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ProductTab | 'all'>('all');
  const { token, user } = useUser();
  const navigate = useNavigate();

  const fetchProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/seller/products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to fetch products');
      setProducts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void fetchProducts();
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.get('search');
    const nextProductId = params.get('product');

    if (nextSearch) {
      setSearch(nextSearch);
    }
    if (nextProductId) {
      setFocusedProductId(nextProductId);
    }
  }, []);

  const handleDelete = async (id: number) => {
    try {
      setError('');
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Failed to delete product');
      setDeleteConfirmId(null);
      setProducts((current) => current.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const productMetrics = useMemo(() => {
    const active = products.filter((product) => getInventoryStatus(Number(product.stock || 0)) === 'active').length;
    const lowStock = products.filter((product) => getInventoryStatus(Number(product.stock || 0)) === 'low_stock').length;
    const outOfStock = products.filter((product) => getInventoryStatus(Number(product.stock || 0)) === 'out_of_stock').length;

    return {
      total: products.length,
      active,
      lowStock,
      outOfStock,
      drafts: products.filter((product) => product.product_status !== 'published').length,
    };
  }, [products]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const inventoryStatus = getInventoryStatus(Number(product.stock || 0));
        const matchesTab = activeTab === 'all' ? true : inventoryStatus === activeTab;

        if (!matchesTab) return false;

        return (
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          String(product.category || '').toLowerCase().includes(search.toLowerCase()) ||
          String(product.id).toLowerCase().includes(search.toLowerCase()) ||
          String(product.sku || '').toLowerCase().includes(search.toLowerCase())
        );
      }),
    [activeTab, products, search],
  );

  useEffect(() => {
    if (!focusedProductId) return;

    const matched = filteredProducts.find((product) => String(product.id) === focusedProductId);
    if (!matched) return;

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`seller-product-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [filteredProducts, focusedProductId]);

  const handlePrintSkuLabel = (product: Product) => {
    try {
      printSkuLabel(product);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to print SKU label.');
    }
  };

  const handlePrintSkuLabelSheet = () => {
    try {
      printSkuLabelSheet(filteredProducts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to print SKU labels.');
    }
  };

  const productTabs = [
    { id: 'all', label: 'All products', count: productMetrics.total },
    { id: 'active', label: 'Active', count: productMetrics.active },
    { id: 'low_stock', label: 'Low stock', count: productMetrics.lowStock },
    { id: 'out_of_stock', label: 'Out of stock', count: productMetrics.outOfStock },
  ] as const;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center space-x-2 rounded-xl bg-accent/10 p-4 text-accent">
          <AlertCircle size={20} />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {user?.seller_status !== 'approved' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your account is still {String(user?.seller_status || 'draft').replaceAll('_', ' ')}. Products stay private as drafts until admin approval.
        </div>
      ) : null}

      <SellerPageHeader
        eyebrow="Inventory workspace"
        title="Seller Products"
        description="Manage your inventory, pricing, and product listings with SKU-ready actions and clearer stock visibility."
        actions={
          <>
            <Link
              to="/seller/products/bulk"
              className="inline-flex h-11 items-center space-x-2 rounded-xl border border-gray-200 px-4 text-sm font-medium transition-all hover:bg-gray-50"
            >
              <Archive size={16} />
              <span>Bulk Upload</span>
            </Link>
            <button
              onClick={handlePrintSkuLabelSheet}
              className="inline-flex h-11 items-center space-x-2 rounded-xl border border-gray-200 px-4 text-sm font-medium transition-all hover:bg-gray-50"
            >
              <Printer size={16} />
              <span>Print Labels</span>
            </button>
            <Link to="/seller/products/add" className="btn-primary inline-flex h-11 items-center space-x-2">
              <Plus size={18} />
              <span>Add Product</span>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SellerStatCard label="All products" value={productMetrics.total} />
        <SellerStatCard label="Active" value={productMetrics.active} tone="success" />
        <SellerStatCard label="Low stock" value={productMetrics.lowStock} tone="warning" />
        <SellerStatCard label="Out of stock" value={productMetrics.outOfStock} tone="critical" />
        <SellerStatCard label="Draft only" value={productMetrics.drafts} tone="warning" />
      </div>

      <div className="sticky top-[5.5rem] z-10 space-y-4 rounded-[1.75rem] border border-black/5 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
        <div className="dashboard-chip-scroll -mx-1 flex gap-2 overflow-x-auto px-1">
          {productTabs.map((tab) => (
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

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 lg:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by name, category, id, or SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/seller/inventory"
              className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:border-primary/20 hover:text-primary"
            >
              Stock Control
            </Link>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
              {filteredProducts.length} of {products.length} products visible
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-sm">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} columns={6} />
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4 md:hidden">
              {filteredProducts.length === 0 ? (
                <SellerEmptyState
                  message="No products found for this filter. Try a different search or add your first product."
                  action={
                    <Link to="/seller/products/add" className="inline-flex rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white">
                      Add product
                    </Link>
                  }
                />
              ) : (
                filteredProducts.map((product) => {
                  const inventoryStatus = getInventoryStatus(Number(product.stock || 0));
                  return (
                    <div
                      id={`seller-product-${product.id}`}
                      key={product.id}
                      className={`rounded-2xl border p-4 shadow-sm ${
                        String(product.id) === focusedProductId
                          ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/30'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <OptimizedImage
                          src={product.image}
                          alt={product.name}
                          widthHint={112}
                          heightHint={112}
                          className="h-14 w-14 rounded-xl object-cover bg-gray-100"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900">{product.name}</p>
                          <p className="mt-1 text-xs text-gray-500">SKU: {product.sku || 'Auto-generated on save'}</p>
                          <p className="mt-1 text-xs text-gray-500">{product.category}</p>
                          {Array.isArray(product.variant_options) && product.variant_options.length > 0 ? (
                            <p className="mt-1 text-xs font-medium text-slate-500">
                              {product.variant_options.length} variant group{product.variant_options.length === 1 ? '' : 's'}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-gray-500">Price</p>
                          <p className="font-bold text-primary">{formatPrice(product.price)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Stock</p>
                          <p className={`font-bold ${product.stock < 10 ? 'text-accent' : 'text-gray-900'}`}>{product.stock}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Status</p>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${renderInventoryTone(
                              inventoryStatus,
                            )}`}
                          >
                            {renderInventoryLabel(inventoryStatus)}
                          </span>
                        </div>
                      </div>
                      {deleteConfirmId === product.id ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-rose-700">Delete this product?</span>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Link
                            to={`/product/${product.slug}`}
                            target="_blank"
                            className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-3 text-gray-500 transition hover:text-primary"
                          >
                            <ExternalLink size={16} />
                          </Link>
                          <button
                            onClick={() => handlePrintSkuLabel(product)}
                            className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-3 text-gray-500 transition hover:text-emerald-600"
                            title="Print SKU label"
                          >
                            <Printer size={16} />
                          </button>
                          <button
                            onClick={() => navigate(`/seller/products/edit/${product.id}`)}
                            className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-3 text-gray-500 transition hover:text-blue-500"
                            title="Edit product"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(product.id)}
                            className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-3 text-gray-500 transition hover:text-accent"
                            title="Delete product"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Price</th>
                    <th className="px-6 py-4">Stock</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex justify-center">
                          <div className="w-full max-w-md">
                            <SellerEmptyState
                              message="No products found for this filter. Try a different search or add your first product."
                              action={
                                <Link to="/seller/products/add" className="inline-flex rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white">
                                  Add product
                                </Link>
                              }
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product) => {
                      const inventoryStatus = getInventoryStatus(Number(product.stock || 0));
                      return (
                        <tr
                          id={`seller-product-${product.id}`}
                          key={product.id}
                          className={`group transition-colors ${
                            String(product.id) === focusedProductId
                              ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <OptimizedImage
                                src={product.image}
                                alt={product.name}
                                widthHint={96}
                                heightHint={96}
                                className="h-12 w-12 rounded-lg object-cover bg-gray-100"
                              />
                              <div className="min-w-0">
                                <p className="max-w-[220px] truncate text-sm font-bold text-gray-900">{product.name}</p>
                                <p className="text-xs text-gray-500">SKU: {product.sku || 'Auto-generated on save'}</p>
                                {Array.isArray(product.variant_options) && product.variant_options.length > 0 ? (
                                  <p className="text-[11px] text-slate-500">
                                    {product.variant_options.length} variant group{product.variant_options.length === 1 ? '' : 's'}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{product.category}</td>
                          <td className="px-6 py-4 text-sm font-bold text-primary">{formatPrice(product.price)}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className={`text-sm font-bold ${product.stock < 10 ? 'text-accent' : 'text-gray-900'}`}>{product.stock}</span>
                              <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={`h-full rounded-full ${product.stock < 10 ? 'bg-accent' : 'bg-primary'}`}
                                  style={{ width: `${Math.min(100, (Number(product.stock || 0) / 50) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${renderInventoryTone(inventoryStatus)}`}>
                              {renderInventoryLabel(inventoryStatus)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {deleteConfirmId === product.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs font-medium text-rose-700">Delete this product?</span>
                                <button
                                  onClick={() => handleDelete(product.id)}
                                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end space-x-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <Link to={`/product/${product.slug}`} target="_blank" className="p-2 text-gray-400 transition-colors hover:text-primary">
                                  <ExternalLink size={18} />
                                </Link>
                                <button
                                  onClick={() => handlePrintSkuLabel(product)}
                                  className="p-2 text-gray-400 transition-colors hover:text-emerald-600"
                                  title="Print SKU label"
                                >
                                  <Printer size={18} />
                                </button>
                                <button
                                  onClick={() => navigate(`/seller/products/edit/${product.id}`)}
                                  className="p-2 text-gray-400 transition-colors hover:text-blue-500"
                                  title="Edit product"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(product.id)}
                                  className="p-2 text-gray-400 transition-colors hover:text-accent"
                                  title="Delete product"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 p-4">
          <p className="text-xs text-gray-500">
            Showing {filteredProducts.length} of {products.length} products
          </p>
          <div className="flex space-x-2">
            <button disabled className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-bold disabled:opacity-50">
              Previous
            </button>
            <button disabled className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-bold disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
