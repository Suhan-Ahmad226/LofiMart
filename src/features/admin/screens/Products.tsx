import React, { useEffect, useMemo, useState } from 'react';
import { Search, Filter, Eye, Trash2, Printer } from 'lucide-react';
import { formatPrice } from '@/src/lib/utils';
import OptimizedImage from '@/src/components/ui/OptimizedImage';
import { useUser } from '@/src/context/UserContext';
import { Link } from '@/src/lib/navigation';
import toast from 'react-hot-toast';
import { TableSkeleton } from '@/src/components/ui/DataSkeletons';
import { printSkuLabel, printSkuLabelSheet } from '@/src/lib/skuLabel';

export const AdminProductsPage = () => {
  const { token } = useUser();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [focusedProductId, setFocusedProductId] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/products');
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load products');
      }
      setProducts(data);
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

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
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete product');
      }
      setDeleteConfirmId(null);
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete product');
    }
  };

  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        String(product.category || '').toLowerCase().includes(search.toLowerCase()) ||
        String(product.id).toLowerCase().includes(search.toLowerCase()) ||
        String(product.sku || '').toLowerCase().includes(search.toLowerCase()),
      ),
    [products, search],
  );

  useEffect(() => {
    if (!focusedProductId) return;

    const matched = filteredProducts.find((product) => String(product.id) === focusedProductId);
    if (!matched) return;

    const timeoutId = window.setTimeout(() => {
      document.getElementById(`admin-product-${matched.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [filteredProducts, focusedProductId]);

  if (loading) return (
    <TableSkeleton rows={6} columns={5} />
  );

  const handlePrintSkuLabel = (product: any) => {
    try {
      printSkuLabel(product);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to print SKU label');
    }
  };

  const handlePrintSkuLabelSheet = () => {
    try {
      printSkuLabelSheet(filteredProducts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to print SKU labels');
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Catalog</h1>
          <p className="text-sm text-gray-500">Review and moderate all marketplace listings</p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:space-x-3">
          <button
            onClick={handlePrintSkuLabelSheet}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-gray-50"
          >
            Print Labels
          </button>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 md:py-2"
            />
          </div>
          <button
            onClick={() => {
              setSearch('Signature');
              toast.success('Showing highlighted product matches.');
            }}
            className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
          >
            <Filter size={20} className="text-gray-500" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="space-y-3 p-4 md:hidden">
          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-gray-500">
              No products found.
            </div>
          ) : (
            filteredProducts.map((product) => (
              <div
                id={`admin-product-${product.id}`}
                key={product.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  String(product.id) === focusedProductId ? 'border-indigo-300 ring-2 ring-indigo-200 bg-indigo-50/30' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <OptimizedImage src={product.image} alt={product.name} widthHint={112} heightHint={112} className="h-14 w-14 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{product.name}</p>
                    <p className="mt-1 text-xs text-gray-500">SKU: {product.sku || 'Auto-generated'}</p>
                    <p className="mt-1 text-xs text-gray-500">{product.category}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Price</p>
                    <p className="font-bold text-primary">{formatPrice(product.price)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Stock</p>
                    <p className="font-bold text-slate-900">{product.stock}</p>
                  </div>
                </div>
                {deleteConfirmId === product.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-rose-700">Delete this product?</span>
                    <button onClick={() => handleDelete(product.id)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700">
                      Confirm
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Link to={`/product/${product.slug}`} target="_blank" className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-3 text-gray-500 transition hover:text-primary">
                      <Eye size={16} />
                    </Link>
                    <button onClick={() => handlePrintSkuLabel(product)} className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-3 text-gray-500 transition hover:text-emerald-600" title="Print SKU label">
                      <Printer size={16} />
                    </button>
                    <button onClick={() => setDeleteConfirmId(product.id)} className="inline-flex items-center justify-center rounded-xl border border-gray-200 p-3 text-gray-500 transition hover:text-accent" title="Delete product">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="table-responsive hidden md:block">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-4">Product</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Price</th>
              <th className="px-6 py-4">Stock</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No products found.
                </td>
              </tr>
            ) : filteredProducts.map((product) => (
              <tr
                id={`admin-product-${product.id}`}
                key={product.id}
                className={`text-sm transition-colors ${
                  String(product.id) === focusedProductId
                    ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <OptimizedImage src={product.image} alt={product.name} widthHint={80} heightHint={80} className="w-10 h-10 rounded object-cover" />
                    <div className="min-w-0">
                      <span className="block truncate max-w-[200px] font-medium">{product.name}</span>
                      <span className="text-xs text-gray-500">SKU: {product.sku || 'Auto-generated'}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-500">{product.category}</td>
                <td className="px-6 py-4 font-bold text-primary">{formatPrice(product.price)}</td>
                <td className="px-6 py-4">{product.stock}</td>
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
                    <div className="flex justify-end space-x-2">
                      <Link to={`/product/${product.slug}`} target="_blank" className="p-2 text-gray-400 hover:text-primary transition-colors">
                        <Eye size={18} />
                      </Link>
                      <button
                        onClick={() => handlePrintSkuLabel(product)}
                        className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
                        title="Print SKU label"
                      >
                        <Printer size={18} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(product.id)}
                        className="p-2 text-gray-400 hover:text-accent transition-colors"
                        title="Delete product"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};
