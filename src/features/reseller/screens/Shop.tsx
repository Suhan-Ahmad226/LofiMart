import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Plus, Search, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from '@/src/lib/navigation';
import { useUser } from '@/src/context/UserContext';
import { formatPrice } from '@/src/lib/utils';
import { ProductGridSkeleton } from '@/src/components/ui/DataSkeletons';
import type { Product } from '@/src/types';
import { useCart } from '@/src/context/CartContext';
import { copyText } from '@/src/lib/browser-actions';

interface ResellerProductLink {
  id: string;
  product_id: string;
  markup_amount: number;
  reseller_base_price?: number;
  reseller_sale_price?: number;
  product?: Product;
}

export const ResellerShop = () => {
  const { token } = useUser();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [myProducts, setMyProducts] = useState<ResellerProductLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [salePriceDrafts, setSalePriceDrafts] = useState<Record<string, string>>({});
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        const productsPromise = fetch('/api/products').then(async (response) => {
          if (!response.ok) {
            throw new Error('Failed to load marketplace products');
          }
          return (await response.json()) as Product[];
        });

        const linkedProductsPromise = token
          ? fetch('/api/reseller/my-products', {
              headers: { Authorization: `Bearer ${token}` },
            }).then(async (response) => {
              if (!response.ok) {
                throw new Error('Failed to load your reseller catalog');
              }
              return (await response.json()) as ResellerProductLink[];
            })
          : Promise.resolve([] as ResellerProductLink[]);

        const referralPromise = token
          ? fetch('/api/reseller/referral-link', {
              headers: { Authorization: `Bearer ${token}` },
            }).then(async (response) => {
              if (!response.ok) {
                throw new Error('Failed to load reseller referral code');
              }
              return (await response.json()) as { code?: string };
            })
          : Promise.resolve({ code: '' });

        const [allProducts, linkedProducts, referral] = await Promise.all([productsPromise, linkedProductsPromise, referralPromise]);
        setProducts(allProducts);
        setMyProducts(linkedProducts);
        setReferralCode(referral.code || '');

        if (!token) {
          setError('Log in as a reseller to add products to your catalog and generate referral links.');
        }
      } catch (fetchError) {
        setProducts([]);
        setMyProducts([]);
        setReferralCode('');
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Marketplace products could not be loaded right now. Please try again shortly.',
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [token]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.reseller_enabled &&
          product.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, search],
  );
  const getProductImageSrc = (product: Product) => product.image || '/icon.svg';

  const isProductInShop = (productId: number) =>
    myProducts.some((product) => Number(product.product_id) === productId);

  const handleAddProduct = async (product: Product) => {
    if (!token) {
      toast.error('Please log in as a reseller first.');
      navigate('/login?redirect=/reseller-dashboard/shop');
      return;
    }

    try {
      const basePrice = Number(product.reseller_base_price ?? 0);
      const draft = salePriceDrafts[String(product.id)];
      const resellerSalePrice = draft ? Number(draft) : Number(product.reseller_suggested_price ?? basePrice);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        throw new Error('Seller has not configured reseller base price for this product yet.');
      }
      if (!Number.isFinite(resellerSalePrice) || resellerSalePrice < basePrice) {
        throw new Error('Your resale price must be equal to or higher than the seller reseller price.');
      }

      const response = await fetch('/api/reseller/add-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: product.id,
          resellerSalePrice,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add product');
      }

      setMyProducts((current) => [
        ...current.filter((row) => Number(row.product_id) !== product.id),
        {
          id: `local-${product.id}`,
          product_id: String(product.id),
          markup_amount: Number((resellerSalePrice - basePrice).toFixed(2)),
          reseller_base_price: basePrice,
          reseller_sale_price: resellerSalePrice,
        },
      ]);
      toast.success('Product added to your reseller catalog.');
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to add product');
    }
  };

  const handleCopyReferralLink = async (product: Product) => {
    const productPath = product.slug ? `/product/${product.slug}` : '/shop';
    const referralUrl = `${window.location.origin}${productPath}?ref=${referralCode || ''}`;
    const copied = await copyText(referralUrl);
    if (copied) {
      toast.success('Referral link copied.');
      return;
    }
    toast.error('Could not copy the referral link on this device.');
  };

  const handleAddToCustomerCart = (product: Product) => {
    if (!referralCode) {
      toast.error('Referral code is not ready yet. Please refresh and try again.');
      return;
    }

    const selectedSalePrice = Number(
      salePriceDrafts[String(product.id)] || product.reseller_suggested_price || product.reseller_base_price || 0,
    );
    const basePrice = Number(product.reseller_base_price || 0);
    if (!Number.isFinite(selectedSalePrice) || selectedSalePrice < basePrice) {
      toast.error('Sale price must stay above the seller reseller price.');
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ref_code', referralCode || '');
    }

    addToCart({
      ...product,
      price: selectedSalePrice,
      reseller_ref_code: referralCode,
      reseller_sale_price: selectedSalePrice,
    });
    toast.success('Added to cart with reseller sale price locked for checkout.');
    navigate('/cart');
  };

  if (loading) {
    return <ProductGridSkeleton cards={8} />;
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reseller Product Catalog</h1>
          <p className="text-gray-500">
            Add only seller-approved reseller products, set your own sale price, and keep the extra margin you sell above base.
          </p>
        </div>

        <div className="relative w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-black/5 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 md:w-72 md:py-2"
          />
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white p-10 text-center text-gray-500">
          No products matched your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredProducts.map((product) => {
            const inShop = isProductInShop(product.id);

            return (
              <div
                key={product.id}
                className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative aspect-square overflow-hidden bg-gray-100">
                  <img
                    src={getProductImageSrc(product)}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  {inShop ? (
                    <div className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white">
                      IN CATALOG
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    {product.category}
                  </p>
                  <h3 className="line-clamp-2 text-sm font-bold leading-5">{product.name}</h3>
                  <div className="flex items-start justify-between gap-3 pt-1">
                    <div>
                      <p className="text-xs text-gray-400">Seller reseller price</p>
                      <p className="font-bold text-primary">{formatPrice(product.reseller_base_price || 0)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {inShop ? (
                        <>
                          <button
                            onClick={() => void handleCopyReferralLink(product)}
                            className="rounded-lg bg-gray-50 p-2 text-gray-600 hover:bg-gray-100"
                            title="Copy referral link"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            onClick={() => handleAddToCustomerCart(product)}
                            className="rounded-lg bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100"
                            title="Add to checkout cart"
                          >
                            <ShoppingCart size={16} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => void handleAddProduct(product)}
                          className="rounded-lg bg-primary p-2 text-white hover:bg-primary/90"
                          title="Add to reseller catalog"
                        >
                          <Plus size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(product.slug ? `/product/${product.slug}` : '/shop')}
                        className="rounded-lg border border-black/5 bg-white p-2 text-gray-600 hover:bg-gray-50"
                        title="Open product"
                      >
                        <ExternalLink size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your resale price</p>
                    <input
                      type="number"
                      min={product.reseller_base_price || 0}
                      step="0.01"
                      value={salePriceDrafts[String(product.id)] ?? String(product.reseller_suggested_price ?? product.reseller_base_price ?? '')}
                      onChange={(event) =>
                        setSalePriceDrafts((current) => ({
                          ...current,
                          [String(product.id)]: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="mt-2 text-xs text-emerald-600">
                      Margin:{' '}
                      {formatPrice(
                        Math.max(
                          (Number(salePriceDrafts[String(product.id)] || product.reseller_suggested_price || product.reseller_base_price || 0) || 0) -
                            Number(product.reseller_base_price || 0),
                          0,
                        ),
                      )}
                    </p>
                    {product.reseller_notes ? (
                      <p className="mt-2 text-[11px] text-slate-500">{product.reseller_notes}</p>
                    ) : null}
                    {!inShop ? (
                      <button
                        onClick={() => void handleAddProduct(product)}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
                      >
                        <Plus size={16} />
                        <span>Add to my catalog</span>
                      </button>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => void handleCopyReferralLink(product)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <Copy size={14} />
                          <span>Copy link</span>
                        </button>
                        <button
                          onClick={() => handleAddToCustomerCart(product)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          <ShoppingCart size={14} />
                          <span>Add to cart</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
