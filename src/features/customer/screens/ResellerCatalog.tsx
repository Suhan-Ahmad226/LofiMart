import React, { useEffect, useMemo, useState } from 'react';
import { Check, Info, Loader2, Plus, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from '@/lib/toast';
import { formatPrice } from '../../../lib/utils';
import { useUser } from '../../../features/shared/state/UserContext';
import type { Product } from '../../../types';

interface ResellerMarkupRow {
  product_id: string;
}

export const ResellerCatalog = () => {
  const { token } = useUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [addedItems, setAddedItems] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setError('Please log in as a reseller to manage your reseller catalog.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const [productsRes, myProductsRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/reseller/my-products', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!productsRes.ok || !myProductsRes.ok) {
          throw new Error('Failed to load reseller catalog');
        }

        const productsData = (await productsRes.json()) as Product[];
        const myProductsData = (await myProductsRes.json()) as ResellerMarkupRow[];

        setProducts(productsData.filter((product) => product.reseller_enabled));
        setAddedItems(myProductsData.map((product) => Number(product.product_id)));
      } catch (loadError) {
        setProducts([]);
        setAddedItems([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Catalog data could not be loaded right now. Please try again shortly.',
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [token]);

  const toggleItem = async (product: Product) => {
    const productId = product.id;
    const isAdded = addedItems.includes(productId);
    if (isAdded) {
      toast.error('This product is already in your shop.');
      return;
    }

    try {
      const response = await fetch('/api/reseller/markup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: productId,
          reseller_sale_price: Number(product.reseller_suggested_price ?? product.reseller_base_price ?? product.price),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to add product');
      }

      setAddedItems((current) => [...current, productId]);
      toast.success('Added to your shop.');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to add product');
    }
  };

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          product.category.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, search],
  );
  const getProductImageSrc = (product: Product) => product.image || '/icon.svg';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reseller Catalog</h1>
          <p className="text-gray-500">Find seller-approved products and earn the margin above the seller reseller price.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-3xl border border-indigo-100 bg-indigo-50 p-6">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold text-indigo-900">How it works</h3>
          <p className="text-xs leading-relaxed text-indigo-700">
            Seller controls the reseller base price. You can add approved products to your shop and earn the extra amount above that base.
          </p>
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No products matched your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="relative aspect-square overflow-hidden bg-gray-50">
                <img
                  src={getProductImageSrc(product)}
                  alt={product.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute right-4 top-4">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-indigo-600 shadow-sm backdrop-blur-md">
                    {product.stock} in stock
                  </span>
                </div>
              </div>

              <div className="p-5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {product.category}
                </p>
                <h3 className="mb-4 line-clamp-1 font-bold text-gray-900">{product.name}</h3>

                <div className="mb-6 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Seller reseller price</span>
                    <span className="font-bold">{formatPrice(product.reseller_base_price || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Suggested Retail</span>
                    <span className="font-bold">{formatPrice(product.reseller_suggested_price || product.price)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-50 pt-2 text-xs">
                    <span className="font-bold text-emerald-600">Potential Profit</span>
                    <span className="font-bold text-emerald-600">
                      {formatPrice(Math.max(Number(product.reseller_suggested_price || 0) - Number(product.reseller_base_price || 0), 0))}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => void toggleItem(product)}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all ${
                    addedItems.includes(product.id)
                      ? 'border border-emerald-100 bg-emerald-50 text-emerald-600'
                      : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700'
                  }`}
                >
                  {addedItems.includes(product.id) ? (
                    <>
                      <Check className="h-4 w-4" />
                      Added to Shop
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add to My Shop
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
