import React, { useEffect, useMemo, useState } from 'react';
import { Copy, DollarSign, Filter, Search, Share2, Target, TrendingUp } from 'lucide-react';
import { useNavigate } from '../../../lib/navigation';
import NotificationContainer, { useNotification } from '../../../components/animations/NotificationContainer';
import type { Product } from '../../../types';
import OptimizedImage from '../../../components/ui/OptimizedImage';
import { CenteredLoader, EmptyState, FormNotice } from '../../../components/ui/FeedbackState';
import { copyText } from '../../../lib/browser-actions';

const AffiliateCatalog: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { notifications, removeNotification, success, info } = useNotification();

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/products');
        const payload = await response.json().catch(() => null);

        if (!response.ok || !Array.isArray(payload)) {
          throw new Error('Affiliate catalog could not be loaded right now.');
        }

        if (!cancelled) {
          setProducts(payload);
        }
      } catch (requestError) {
        if (!cancelled) {
          setProducts([]);
          setError(
            requestError instanceof Error ? requestError.message : 'Affiliate catalog could not be loaded right now.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.category.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [products, searchTerm],
  );

  const makeAffiliateLink = (product: Product) =>
    `${window.location.origin}/product/${product.slug}?affiliate=${product.id}`;

  const copyLink = async (product: Product) => {
    const copied = await copyText(makeAffiliateLink(product));
    if (!copied) {
      info('Could not copy the affiliate link on this device.', 2800);
      return;
    }
    success(`${product.name} affiliate link copied.`, 3000);
  };

  const shareLink = async (product: Product) => {
    const link = makeAffiliateLink(product);
    if (navigator.share) {
      await navigator.share({
        title: product.name,
        text: `Check out ${product.name} from the LofiMart affiliate catalog.`,
        url: link,
      });
      return;
    }

    const copied = await copyText(link);
    if (!copied) {
      info('Could not copy the share link on this device.', 2800);
      return;
    }

    info('Share link copied to clipboard.', 2800);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-12 py-8">
      <NotificationContainer notifications={notifications} onClose={removeNotification} />

      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center text-4xl font-black text-gray-900">
            <Target className="mr-4 h-10 w-10 text-blue-600" />
            Affiliate Catalog
          </h1>
          <p className="font-medium text-gray-500">
            Share live marketplace products and generate trackable referral links for your promotion flows.
          </p>
        </div>
        <div className="flex w-full gap-4 md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search products..."
              className="w-full rounded-[1.5rem] border-2 border-gray-100 bg-white py-4 pl-12 pr-4 text-sm font-medium outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => setSearchTerm('Electronics')}
            className="rounded-[1.5rem] border-2 bg-white p-4 text-gray-400 hover:text-blue-600"
          >
            <Filter className="h-6 w-6" />
          </button>
        </div>
      </div>

      {loading ? (
        <CenteredLoader label="Loading affiliate catalog..." className="rounded-[2.5rem] border border-gray-100 bg-white p-12 shadow-sm" />
      ) : error ? (
        <FormNotice tone="error">
          <div>
            <p className="font-semibold">Catalog unavailable</p>
            <p className="mt-1">{error}</p>
          </div>
        </FormNotice>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title={searchTerm ? 'No matching products found' : 'No affiliate-ready products available'}
          description={
            searchTerm
              ? 'Try a different keyword or category to find live products to promote.'
              : 'Publish more live products first, then they will appear here for sharing.'
          }
          className="rounded-[2.5rem] border border-dashed border-gray-200 bg-white p-12 shadow-sm"
        />
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.slice(0, 6).map((product) => (
            <div
              key={product.id}
              className="group overflow-hidden rounded-[2.5rem] border bg-white shadow-sm transition hover:shadow-2xl"
            >
              <div className="relative aspect-square overflow-hidden border-b bg-gray-50">
                <OptimizedImage
                  src={product.image}
                  alt={product.name}
                  widthHint={720}
                  heightHint={720}
                  className="h-full w-full object-cover transition group-hover:scale-110"
                />
                <span className="absolute left-4 top-4 rounded-full bg-emerald-500/90 px-3 py-1 text-[10px] font-black text-white shadow-sm">
                  <TrendingUp className="mr-1 inline h-3 w-3" />
                  Share Ready
                </span>
                <div className="absolute bottom-4 right-4 rounded-xl bg-gray-900/80 px-3 py-1 text-sm font-black text-white">
                  BDT {product.price.toFixed(2)}
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div>
                  <h3 className="line-clamp-1 text-lg font-black text-gray-900">{product.name}</h3>
                  <p className="text-[10px] uppercase text-gray-400">Vendor: {product.seller_name || 'lofimart'}</p>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-600">Estimated Commission</p>
                    <p className="text-xl font-black text-blue-900">BDT {(product.price * 0.05).toFixed(2)}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-blue-600" />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => void copyLink(product)}
                    className="flex flex-1 items-center justify-center rounded-2xl bg-gray-900 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-blue-600"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                  </button>
                  <button
                    onClick={() => void shareLink(product)}
                    className="rounded-2xl border bg-white p-3 text-gray-400 hover:text-blue-600"
                  >
                    <Share2 className="h-5 w-5" />
                  </button>
                </div>

                <button
                  onClick={() => navigate(`/product/${product.slug}`)}
                  className="w-full rounded-2xl border border-blue-100 bg-blue-50 py-3 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100"
                >
                  Open Product
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AffiliateCatalog;
