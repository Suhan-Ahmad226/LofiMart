import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useNavigate, Link, useSearchParams } from '../../../lib/navigation';
import { ArrowRight, Star, Store, Truck, RefreshCw, ShoppingCart, Heart, Share2, Loader2, Box, Maximize2, CreditCard, BadgeCheck, Clock3, Scale, ChevronRight, Lock, ThumbsUp, PackageCheck, MessageCircle } from 'lucide-react';
import { Product, ProductVariantValue } from '../../../types';
import { formatPrice } from '../../../lib/utils';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { useCart } from '../../../features/shop/state/CartContext';
import { useCompare } from '../../../features/shop/state/CompareContext';
import { useWishlist } from '../../../features/shop/state/WishlistContext';
import { useUser } from '../../../features/shared/state/UserContext';
import { useCommerceConfig } from '../../../features/shared/state/CommerceConfigContext';
import { getCachedClientValue } from '../../../lib/client-cache';
import { ProductCard } from '@/features/shared/ui/product/ProductCard';
import { renderProductDescription, serializeJsonLd } from '../../../lib/product-description';
import { ProductLightbox } from '../../../features/shop/components/ProductLightbox';
import toast from '@/lib/toast';

const FrequentlyBoughtTogether = dynamic(
  () => import('@/features/shop/components/FrequentlyBoughtTogether').then((module) => module.FrequentlyBoughtTogether),
  {
    loading: () => <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />,
  }
);

function getVariantValueLabel(value: ProductVariantValue | string) {
  return typeof value === 'string' ? value : value.label;
}

function getVariantValuePriceAdjustment(value: ProductVariantValue | string) {
  return typeof value === 'string' ? 0 : Number(value.price_adjustment ?? 0) || 0;
}

function getVariantValueStockOverride(value: ProductVariantValue | string) {
  if (typeof value === 'string') return null;
  return value.stock_override === null || typeof value.stock_override === 'undefined'
    ? null
    : Number(value.stock_override);
}

function getVariantValueSkuSuffix(value: ProductVariantValue | string) {
  if (typeof value === 'string') return null;
  return value.sku_suffix ? String(value.sku_suffix).trim().toUpperCase() : null;
}

export const ProductDetailsPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [quantity, setQuantity] = useState(1);

  const { items, addToCart, setCartItemQuantity } = useCart();
  const { toggleCompare, isInCompare } = useCompare();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);

  const [showImageLightbox, setShowImageLightbox] = useState(false);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(2500);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const { user, token, isAuthenticated } = useUser();
  const commerceConfig = useCommerceConfig();
  const referralCode = searchParams.get('ref');
  const deferredSectionsRef = useRef<HTMLDivElement | null>(null);
  const [showDeferredSections, setShowDeferredSections] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [relatedProductsLoading, setRelatedProductsLoading] = useState(false);
  const [sellerProducts, setSellerProducts] = useState<Product[]>([]);
  const [sellerProductsLoading, setSellerProductsLoading] = useState(false);
  const [deliveryZone, setDeliveryZone] = useState<'dhaka' | 'outside'>('dhaka');
  const [imageZoomOrigin, setImageZoomOrigin] = useState('50% 50%');
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'shipping' | 'reviews'>('description');
  const [sellerChatOpen, setSellerChatOpen] = useState(false);
  const [sellerMessage, setSellerMessage] = useState('');
  const [sendingSellerMessage, setSendingSellerMessage] = useState(false);

  useEffect(() => {
    if (!referralCode || typeof window === 'undefined') return;
    window.localStorage.setItem('ref_code', referralCode || '');
  }, [referralCode]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    getCachedClientValue(`product-details:${slug}`, 5 * 60 * 1000, async () => {
      const res = await fetch(`/api/products/${slug}`, { cache: 'no-store', signal: controller.signal });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Unable to load this product');
      return payload;
    })
      .then(async (productData) => {
        if (controller.signal.aborted) return;
        setProduct(productData);
        if (Array.isArray(productData?.variant_options)) {
          const defaults = productData.variant_options.reduce((acc: Record<string, string>, option: any) => {
            if (option?.name && Array.isArray(option?.values) && option.values.length > 0) {
              acc[String(option.name)] = getVariantValueLabel(option.values[0]);
            }
            return acc;
          }, {});
          setSelectedVariants(defaults);
        } else {
          setSelectedVariants({});
        }
        setReviews([]);
        setRelatedProducts([]);
        setSellerProducts([]);
        setShowDeferredSections(false);
        setSelectedMediaIndex(0);
        setActiveTab('description');
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name !== 'AbortError') {
          setProduct(null);
          setReviews([]);
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load this product right now.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    if (typeof commerceConfig?.free_shipping_threshold === 'number') {
      setFreeShippingThreshold(commerceConfig.free_shipping_threshold);
    }
  }, [commerceConfig]);

  useEffect(() => {
    if (!product || showDeferredSections || typeof window === 'undefined') return;
    const target = deferredSectionsRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShowDeferredSections(true);
          observer.disconnect();
        }
      },
      { rootMargin: '480px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [product, showDeferredSections]);

  useEffect(() => {
    if (!product?.id || !showDeferredSections || typeof window === 'undefined') return;
    const reviewsController = new AbortController();
    const relatedController = new AbortController();
    const sellerController = new AbortController();
    setReviewsLoading(true);
    setRelatedProductsLoading(true);
    setSellerProductsLoading(true);

    const reviewsPromise = getCachedClientValue(`product-reviews:${product.id}`, 2 * 60 * 1000, async () => {
      const r = await fetch(`/api/products/${product.id}/reviews`, { cache: 'no-store', signal: reviewsController.signal });
      if (!r.ok) throw new Error('Failed to load reviews');
      return r.json().catch(() => []);
    });
    const relatedCategory = product.category ?? '';
    const relatedPromise = getCachedClientValue(`related-products:${relatedCategory}`, 5 * 60 * 1000, async () => {
      const r = await fetch(`/api/products?limit=12&category=${encodeURIComponent(relatedCategory)}`, { cache: 'no-store', signal: relatedController.signal });
      if (!r.ok) throw new Error('Failed to load related products');
      return r.json().catch(() => []);
    });
    const sellerPromise = getCachedClientValue(`seller-products:${product.seller_id}`, 5 * 60 * 1000, async () => {
      const r = await fetch(`/api/products?limit=8&seller_id=${encodeURIComponent(String(product.seller_id))}`, { cache: 'no-store', signal: sellerController.signal });
      if (!r.ok) throw new Error('Failed to load seller products');
      return r.json().catch(() => []);
    });

    Promise.allSettled([reviewsPromise, relatedPromise, sellerPromise])
      .then(([reviewsResult, relatedResult, sellerResult]) => {
        if (!reviewsController.signal.aborted) {
          const d = reviewsResult.status === 'fulfilled' ? reviewsResult.value : [];
          setReviews(Array.isArray(d) ? d : []);
          setReviewsLoading(false);
        }
        if (!relatedController.signal.aborted) {
          const d = relatedResult.status === 'fulfilled' ? relatedResult.value : [];
          const n = Array.isArray(d) ? d : [];
          setRelatedProducts(n.filter((e) => e?.slug !== product.slug).slice(0, 4) as Product[]);
          setRelatedProductsLoading(false);
        }
        if (!sellerController.signal.aborted) {
          const d = sellerResult.status === 'fulfilled' ? sellerResult.value : [];
          const n = Array.isArray(d) ? d : [];
          setSellerProducts(n.filter((e) => e?.slug !== product.slug).slice(0, 4) as Product[]);
          setSellerProductsLoading(false);
        }
      })
      .catch(() => {
        if (!reviewsController.signal.aborted) { setReviews([]); setReviewsLoading(false); }
        if (!relatedController.signal.aborted) { setRelatedProducts([]); setRelatedProductsLoading(false); }
        if (!sellerController.signal.aborted) { setSellerProducts([]); setSellerProductsLoading(false); }
      });

    return () => {
      reviewsController.abort();
      relatedController.abort();
      sellerController.abort();
    };
  }, [product?.id, product?.category, product?.seller_id, product?.slug, showDeferredSections]);

  const handlePostReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setSubmittingReview(true);
    setReviewError('');
    try {
      const response = await fetch(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newReview),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to post your review');
      const nextReview = {
        id: `local-${Date.now()}`,
        product_id: product.id,
        user_id: user?.id,
        rating: newReview.rating,
        comment: newReview.comment,
        created_at: new Date().toISOString(),
        user_name: user?.name || 'You',
      };
      const nextCount = (product.reviews_count ?? 0) + 1;
      const nextRating = ((product.rating ?? 0) * (product.reviews_count ?? 0) + Number(newReview.rating)) / Math.max(nextCount, 1);
      setReviews((current) => [nextReview, ...current]);
      setProduct((current) =>
        current ? { ...current, reviews_count: nextCount, rating: Number(nextRating.toFixed(1)) } : current,
      );
      setNewReview({ rating: 5, comment: '' });
      toast.success('Review posted successfully');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Unable to post your review');
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    if (!product) return;
    const selectedVariantEntries = Array.isArray(product.variant_options)
      ? product.variant_options.map((option) => {
          const selectedLabel = selectedVariants[option.name] || getVariantValueLabel(option.values?.[0] as any);
          const selectedValue = option.values.find((v) => getVariantValueLabel(v as any) === selectedLabel) ?? option.values?.[0];
          return selectedValue;
        })
      : [];
    const variantStockCandidates = selectedVariantEntries
      .map((v) => getVariantValueStockOverride(v as any))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const nextMax = Math.max(0, variantStockCandidates.length > 0 ? Math.min(...variantStockCandidates) : product.stock);
    if (nextMax > 0 && quantity > nextMax) setQuantity(nextMax);
  }, [product, quantity, selectedVariants]);

  if (loading) {
    return (
      <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 animate-pulse">
          <div className="lg:col-span-5 space-y-4">
            <div className="aspect-square rounded-2xl bg-slate-100" />
            <div className="grid grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="aspect-square rounded-xl bg-slate-100" />)}
            </div>
          </div>
          <div className="lg:col-span-7 space-y-4">
            <div className="h-4 w-1/3 rounded bg-slate-100" />
            <div className="h-8 w-2/3 rounded bg-slate-100" />
            <div className="h-6 w-1/4 rounded bg-slate-100" />
            <div className="h-20 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-950">This product is unavailable right now</h1>
          <p className="mt-3 text-sm text-slate-600">
            {error || 'The product could not be loaded. Please try again or continue browsing other items.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Try again
            </button>
            <Link
              to="/shop"
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const variantOptions = Array.isArray(product.variant_options) ? product.variant_options : [];
  const specificationItems = Array.isArray(product.specifications) ? product.specifications : [];
  const selectedVariantEntries = variantOptions.length > 0
    ? variantOptions.map((option) => {
        const selectedLabel = selectedVariants[option.name] || getVariantValueLabel(option.values?.[0] as any);
        const selectedValue = option.values.find((v) => getVariantValueLabel(v as any) === selectedLabel) ?? option.values?.[0];
        return { optionName: option.name, selectedLabel, selectedValue };
      })
    : [];
  const variantPriceAdjustment = selectedVariantEntries.reduce(
    (sum, entry) => sum + getVariantValuePriceAdjustment(entry.selectedValue as any), 0,
  );
  const variantStockCandidates = selectedVariantEntries
    .map((entry) => getVariantValueStockOverride(entry.selectedValue as any))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const effectiveStock = variantStockCandidates.length > 0 ? Math.min(...variantStockCandidates) : product.stock;
  const effectivePrice = Math.max(0, product.price + variantPriceAdjustment);
  const baseOldPrice = product.old_price ?? 0;
  const effectiveOldPrice = baseOldPrice > product.price ? Math.max(effectivePrice, baseOldPrice + variantPriceAdjustment) : 0;
  const selectedVariantSummary = selectedVariantEntries.map((e) => `${e.optionName}: ${e.selectedLabel}`).join(' • ');
  const selectedVariantKey = selectedVariantEntries.map((e) => `${e.optionName}:${e.selectedLabel}`).join('|');
  const selectedVariantSkuSuffix = selectedVariantEntries
    .map((e) => getVariantValueSkuSuffix(e.selectedValue as any))
    .filter((v): v is string => Boolean(v)).join('-');
  const selectedVariantSku = selectedVariantSkuSuffix
    ? `${String(product.sku || '').trim()}-${selectedVariantSkuSuffix}`
    : product.sku || undefined;
  const hasDiscount = effectiveOldPrice > effectivePrice;
  const discount = hasDiscount && effectiveOldPrice > 0
    ? Math.round(((effectiveOldPrice - effectivePrice) / effectiveOldPrice) * 100) : 0;
  const isWishlisted = isInWishlist(product.id);
  const isCompared = isInCompare(product.id);
  const isOutOfStock = effectiveStock <= 0;
  const lowStock = effectiveStock > 0 && effectiveStock <= 5;
  const maxSelectableQuantity = Math.max(0, effectiveStock);
  const estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-BD', {
    month: 'short', day: 'numeric',
  });
  const freeShippingRemaining = Math.max(0, freeShippingThreshold - effectivePrice);
  const freeShippingProgress = Math.min((effectivePrice / freeShippingThreshold) * 100, 100);
  const hasVariantOptions = variantOptions.length > 0;
  const hasSpecifications = specificationItems.length > 0;
  const sellerDisplayName = product.seller_name?.trim() || 'Verified marketplace seller';
  const sellerStoreLabel = product.store_name?.trim() || sellerDisplayName;
  const sellerInitial = sellerDisplayName.charAt(0).toUpperCase() || 'S';
  const sellerAvatarUrl = product.seller_avatar_url?.trim() || '';
  const productImageSrc = typeof product.image === 'string' ? product.image.trim() : '';
  const galleryImages = Array.isArray(product.gallery_images)
    ? product.gallery_images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  const productMediaImages = [productImageSrc, ...galleryImages].filter((item, index, array) => item && array.indexOf(item) === index);
  const activeImageSrc = productMediaImages[selectedMediaIndex] || productImageSrc;
  const hasProductImage = activeImageSrc.length > 0;
  const hasProductVideo = Boolean(product.video_url && String(product.video_url).trim());
  const sellerRatingLabel = product.seller_rating ? product.seller_rating.toFixed(1) : null;
  const sellerResponseLabel = product.response_time_hours ? `Responds in ~${product.response_time_hours}h` : 'Fast response';
  const reviewBreakdown = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => Number(r.rating) === star).length;
    const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
    return { star, count, percentage };
  });
  const hasSellerOfferBlock = Boolean(product.seller_id && sellerProducts.length > 0);
  const renderedDescription = renderProductDescription(product.description);

  const productForCart: Product = {
    ...product,
    price: effectivePrice,
    old_price: effectiveOldPrice,
    stock: effectiveStock,
    reseller_ref_code: referralCode || product.reseller_ref_code,
    selected_variant_key: selectedVariantKey || undefined,
    selected_variant_summary: selectedVariantSummary || undefined,
    selected_variant_sku: selectedVariantSku || undefined,
  };

  const existingCartItem = items.find(
    (item) => item.id === productForCart.id && (item.selected_variant_key || '') === (productForCart.selected_variant_key || ''),
  );
  const isAlreadyInCart = Boolean(existingCartItem);

  const handleBuyNow = () => {
    if (product && !isOutOfStock) {
      setCartItemQuantity(productForCart, Math.min(quantity, maxSelectableQuantity || quantity));
      navigate('/cart');
    }
  };

  const handleAddToCart = () => {
    if (!product || isOutOfStock) return;
    addToCart(productForCart, Math.min(quantity, maxSelectableQuantity || quantity));
  };

  const handleCompareToggle = () => {
    toggleCompare(product);
  };

  const handleImagePointerMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setImageZoomOrigin(`${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`);
  };

  const handleCopyShare = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Product link copied!');
    }
  };

  const handleSellerMessage = async () => {
    if (!product?.storefront_slug || !sellerMessage.trim()) return;
    if (!isAuthenticated || !token) {
      toast.error('Please sign in to message this seller.');
      return;
    }

    setSendingSellerMessage(true);
    try {
      const response = await fetch(`/api/storefronts/${encodeURIComponent(product.storefront_slug)}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId: String(product.id), message: sellerMessage.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to send your message.');
      setSellerMessage('');
      setSellerChatOpen(false);
      toast.success('Your inquiry was sent to the seller.');
    } catch (messageError) {
      toast.error(messageError instanceof Error ? messageError.message : 'Unable to send your message.');
    } finally {
      setSendingSellerMessage(false);
    }
  };

  return (
    <div className="max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-28 md:pb-12">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            description: product.description || undefined,
            image: activeImageSrc || undefined,
            sku: product.sku || undefined,
            brand: product.store_name ? { '@type': 'Brand', name: product.store_name } : undefined,
            offers: {
              '@type': 'Offer',
              priceCurrency: 'BDT',
              price: String(product.price),
              availability: (product.stock ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              url: typeof window !== 'undefined' ? window.location.href : undefined,
            },
            aggregateRating: product.reviews_count
              ? { '@type': 'AggregateRating', ratingValue: String(product.rating || 0), reviewCount: String(product.reviews_count) }
              : undefined,
          }),
        }}
      />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-slate-400 overflow-x-auto whitespace-nowrap">
        <Link to="/" className="font-medium transition hover:text-slate-900">Home</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <Link to="/shop" className="font-medium transition hover:text-slate-900">Shop</Link>
        {product.category ? (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-slate-500">{product.category}</span>
          </>
        ) : null}
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="line-clamp-1 font-semibold text-slate-800">{product.name}</span>
      </nav>

      {/* Hero Section: 2-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:gap-10 xl:grid-cols-12">

        {/* LEFT: Gallery (45% ≈ 5 cols on 12-col grid) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Main Image Stage */}
          <div className="relative w-full aspect-square bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 shadow-sm flex items-center justify-center group cursor-crosshair">
            {/* Badges */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
              {hasDiscount && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary text-white shadow-sm tracking-wide">
                  Sale -{discount}%
                </span>
              )}
              {product.verification_badge && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/80 text-white text-[10px] font-bold backdrop-blur-md tracking-wide">
                  <BadgeCheck size={11} /> Genuine
                </span>
              )}
            </div>

            {/* Wishlist Heart */}
            <button
              type="button"
              onClick={() => toggleWishlist(product)}
              className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/80 backdrop-blur-md border border-slate-200/60 flex items-center justify-center shadow-sm transition-all hover:scale-110 ${
                isWishlisted ? 'text-rose-500 border-rose-200' : 'text-slate-400 hover:text-rose-500'
              }`}
              aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Heart size={16} fill={isWishlisted ? 'currentColor' : 'none'} />
            </button>

            {/* Main Image */}
            {hasProductImage ? (
              <button
                type="button"
                onClick={() => setShowImageLightbox(true)}
                onMouseMove={handleImagePointerMove}
                onMouseEnter={() => setIsImageZoomed(true)}
                onMouseLeave={() => { setIsImageZoomed(false); setImageZoomOrigin('50% 50%'); }}
                className="block h-full w-full cursor-zoom-in"
                aria-label="Open product image"
              >
                <div className="flex h-full w-full items-center justify-center p-6 lg:p-8">
                  <OptimizedImage
                    src={activeImageSrc}
                    alt={product.name}
                    widthHint={1600}
                    heightHint={1600}
                    quality="auto:best"
                    fit="limit"
                    eager
                    showPlaceholder={false}
                    className="h-full w-full object-contain transition-transform duration-300 ease-out"
                    style={{
                      transformOrigin: imageZoomOrigin,
                      transform: isImageZoomed ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                </div>
              </button>
            ) : (
              <div className="grid h-full w-full place-items-center p-8 text-center">
                <div className="max-w-xs">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
                    <Box className="h-7 w-7" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-600">Product photo coming soon</p>
                </div>
              </div>
            )}

            {/* Zoom Hint */}
            {hasProductImage && (
              <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-semibold text-slate-500 flex items-center gap-1 shadow-sm pointer-events-none">
                <Maximize2 size={11} /> Zoom
              </div>
            )}
          </div>

          {/* Thumbnail Strip */}
          {productMediaImages.length > 1 && (
            <div className="grid grid-cols-4 lg:grid-cols-5 gap-2">
              {productMediaImages.map((imageUrl, index) => (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  onClick={() => {
                    setSelectedMediaIndex(index);
                  }}
                  className={`aspect-square overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${
                    activeImageSrc === imageUrl
                      ? 'border-slate-900 ring-2 ring-slate-900/10'
                      : 'border-slate-100 hover:border-slate-300'
                  }`}
                >
                  <OptimizedImage
                    src={imageUrl}
                    alt={`${product.name} view ${index + 1}`}
                    widthHint={240}
                    heightHint={240}
                    quality="auto:good"
                    fit="fill"
                    showPlaceholder={false}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
              {hasProductVideo && (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined' && product.video_url) {
                      window.open(product.video_url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="aspect-square rounded-xl border border-slate-100 bg-white p-2.5 text-left shadow-sm transition hover:border-slate-300 flex flex-col justify-between"
                >
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Video</span>
                  <span className="text-xs font-bold text-slate-800">Watch</span>
                </button>
              )}
            </div>
          )}

          {/* Action Buttons Under Gallery */}
          <div className="hidden lg:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImageLightbox(true)}
              disabled={!hasProductImage}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white border border-slate-100 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Maximize2 size={14} /> High-Res
            </button>
            <button
              type="button"
              onClick={handleCopyShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white border border-slate-100 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm"
            >
              <Share2 size={14} /> Share
            </button>
          </div>
        </div>

        {/* RIGHT: Product Info (55% ≈ 7 cols on 12-col grid) */}
        <div className="lg:col-span-7 flex flex-col justify-start">
          <div className="flex flex-col gap-3">
            {/* Store/Brand + SKU */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {product.storefront_slug ? (
                  <Link
                    to={`/store/${product.storefront_slug}`}
                    className="text-xs font-bold uppercase tracking-wider text-primary hover:underline"
                  >
                    {sellerStoreLabel}
                  </Link>
                ) : (
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">{sellerStoreLabel}</span>
                )}
                {product.verification_badge && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                    <BadgeCheck size={11} /> Verified
                  </span>
                )}
              </div>
              {(selectedVariantSku || product.sku) && (
                <span className="text-xs text-slate-400 font-medium">SKU: {selectedVariantSku || product.sku}</span>
              )}
            </div>

            {/* Product Title */}
            <h1 className="text-xl sm:text-2xl lg:text-[1.75rem] font-bold text-slate-950 leading-tight tracking-tight">
              {product.name}
            </h1>

            {/* Rating & Social Proof */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5">
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg">
                <div className="flex items-center text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={14} fill={i < Math.floor(product.rating) ? 'currentColor' : 'none'} />
                  ))}
                </div>
                <span className="text-xs font-bold text-slate-800">{product.rating}</span>
              </div>
              <span className="text-slate-200 text-xs">|</span>
              <span className="text-xs text-slate-500">
                <Link to="#customer-reviews" className="hover:underline">{product.reviews_count} Reviews</Link>
              </span>
              <span className="text-slate-200 text-xs">|</span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock3 size={12} className="text-primary" /> In Stock
              </span>
            </div>

            {/* Price Block */}
            <div className="bg-slate-50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                  {formatPrice(effectivePrice)}
                </span>
                {effectiveOldPrice > effectivePrice && (
                  <>
                    <span className="text-base text-slate-400 line-through">{formatPrice(effectiveOldPrice)}</span>
                    <span className="px-2 py-0.5 rounded-md bg-primary text-white text-[10px] font-bold">
                      {discount}% OFF
                    </span>
                  </>
                )}
              </div>
              <span className="text-xs text-slate-400">Inclusive of VAT</span>
            </div>

            {/* Availability & Shipping */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2.5 flex items-center gap-2.5 shadow-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-xs font-semibold text-slate-800">
                  <strong>In Stock</strong> · {effectiveStock} unit{effectiveStock !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex-1 bg-white border border-slate-100 rounded-xl px-3 py-2.5 flex items-center gap-2.5 shadow-sm">
                <Truck size={14} className="text-primary shrink-0" />
                <span className="text-xs text-slate-600">
                  <strong>Free Delivery</strong> · by <span className="font-bold text-primary">{estimatedDelivery}</span>
                </span>
              </div>
            </div>

            {/* Low Stock Warning */}
            {lowStock && (
              <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs font-semibold text-amber-700 w-fit">
                <Clock3 size={13} /> Only {effectiveStock} left in stock — order soon
              </div>
            )}

            {/* Color Selector */}
            {hasVariantOptions && variantOptions.some(opt => /color|colour|বর্ণ|রং/i.test(opt.name)) && (
              <div className="flex flex-col gap-2">
                {variantOptions.filter(opt => /color|colour|বর্ণ|রং/i.test(opt.name)).map((option) => (
                  <div key={option.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {option.name}: <span className="text-slate-800">{selectedVariants[option.name] || getVariantValueLabel(option.values?.[0] as any)}</span>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {option.values.map((value) => {
                        const valueLabel = getVariantValueLabel(value as any);
                        const isActive = selectedVariants[option.name] === valueLabel;
                        return (
                          <button
                            key={`${option.name}-${valueLabel}`}
                            type="button"
                            onClick={() => setSelectedVariants((c) => ({ ...c, [option.name]: valueLabel }))}
                            className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                              isActive
                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                            }`}
                          >
                            {valueLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Other Variant Options (non-color) */}
            {hasVariantOptions && variantOptions.filter(opt => !/color|colour|বর্ণ|রং/i.test(opt.name)).length > 0 && (
              <div className="flex flex-col gap-2">
                {variantOptions.filter(opt => !/color|colour|বর্ণ|রং/i.test(opt.name)).map((option) => (
                  <div key={option.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {option.name}
                      </label>
                      <a href="#" className="text-[11px] font-semibold text-primary hover:underline">Guide</a>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {option.values.map((value) => {
                        const valueLabel = getVariantValueLabel(value as any);
                        const adjustment = getVariantValuePriceAdjustment(value as any);
                        const isActive = selectedVariants[option.name] === valueLabel;
                        return (
                          <button
                            key={`${option.name}-${valueLabel}`}
                            type="button"
                            onClick={() => setSelectedVariants((c) => ({ ...c, [option.name]: valueLabel }))}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              isActive
                                ? 'border-slate-900 bg-slate-50 shadow-sm'
                                : 'border-slate-100 bg-white hover:border-slate-300'
                            }`}
                          >
                            <p className="text-xs font-bold text-slate-800">{valueLabel}</p>
                            {adjustment !== 0 && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {adjustment > 0 ? `+${formatPrice(adjustment)}` : formatPrice(adjustment)}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity + CTA Row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              {/* Quantity Selector */}
              <div className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-1 py-1 shadow-sm w-full sm:w-32">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-30"
                  aria-label="Decrease quantity"
                >
                  <span className="text-lg font-bold">−</span>
                </button>
                <span className="text-sm font-bold text-slate-900 min-w-[2rem] text-center">{String(quantity).padStart(2, '0')}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.min(maxSelectableQuantity || 1, q + 1))}
                  disabled={isOutOfStock || quantity >= maxSelectableQuantity}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-30"
                  aria-label="Increase quantity"
                >
                  <span className="text-lg font-bold">+</span>
                </button>
              </div>

              {/* Add to Cart (Primary - Black) */}
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className="flex-1 h-12 px-6 bg-slate-950 text-white hover:bg-slate-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart size={18} />
                {isOutOfStock ? 'Out of Stock' : isAlreadyInCart ? 'Update Cart' : 'Add to Cart'}
              </button>

              {/* Buy Now (Accent - Blue) */}
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={isOutOfStock}
                className="flex-1 h-12 px-6 bg-primary text-white hover:bg-primary-dark rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CreditCard size={18} />
                {isOutOfStock ? 'Unavailable' : 'Instant Checkout'}
              </button>
            </div>

            {/* Secondary Actions */}
            <div className="flex items-center gap-4 pt-1 text-slate-400">
              <button
                type="button"
                onClick={() => toggleWishlist(product)}
                className="flex items-center gap-1.5 text-xs font-semibold hover:text-rose-500 transition-colors"
              >
                <Heart size={14} fill={isWishlisted ? 'currentColor' : 'none'} className={isWishlisted ? 'text-rose-500' : ''} />
                {isWishlisted ? 'Saved' : 'Save to Wishlist'}
              </button>
              <button
                type="button"
                onClick={handleCompareToggle}
                className="flex items-center gap-1.5 text-xs font-semibold hover:text-primary transition-colors"
              >
                <Scale size={14} />
                {isCompared ? 'Comparing' : 'Compare'}
              </button>
              <button
                type="button"
                onClick={handleCopyShare}
                className="flex items-center gap-1.5 text-xs font-semibold hover:text-primary transition-colors"
              >
                <Share2 size={14} />
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Trust / Service Bar */}
      <div className="mt-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-slate-100">
          {[
            { icon: <Truck size={18} />, label: 'Fast Delivery', desc: 'Nationwide express' },
            { icon: <RefreshCw size={18} />, label: 'Easy Returns', desc: '7-day hassle-free' },
            { icon: <Lock size={18} />, label: 'Secure Checkout', desc: '256-bit SSL' },
            { icon: <BadgeCheck size={18} />, label: '100% Genuine', desc: 'Authorized channel' },
            { icon: <CreditCard size={18} />, label: 'COD Available', desc: 'Cash on delivery' },
            { icon: <MessageCircle size={18} />, label: '24/7 Support', desc: 'Live chat help' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-3.5">
              <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center text-primary shrink-0">
                {item.icon}
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-800 leading-tight">{item.label}</p>
                <p className="text-[10px] text-slate-400 leading-tight">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seller / Store Card */}
      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Seller information">
        <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-900 text-lg font-bold text-white">
              {sellerAvatarUrl ? (
                <img
                  src={sellerAvatarUrl}
                  alt={`${sellerStoreLabel} logo`}
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : sellerInitial}
            </div>
            <div className="min-w-0">
              <p className="mb-0.5 text-[10px] font-bold uppercase text-slate-500">Sold by</p>
              <div className="flex min-w-0 items-center gap-1.5">
                <h2 className="truncate text-sm font-bold text-slate-950 sm:text-base">{sellerStoreLabel}</h2>
                {product.verification_badge ? <BadgeCheck size={16} className="shrink-0 text-primary" aria-label="Verified seller" /> : null}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Store size={13} className="shrink-0" />
                <span>{product.verification_badge ? 'Verified marketplace seller' : 'Marketplace seller'}</span>
              </p>
            </div>
          </div>

          {product.storefront_slug ? (
            <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
              <Link
                to={`/store/${product.storefront_slug}`}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-200"
              >
                Visit Store
                <ArrowRight size={15} />
              </Link>
              <button
                type="button"
                onClick={() => setSellerChatOpen(true)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-dark"
              >
                <MessageCircle size={15} />
                Chat Seller
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 border-t border-slate-100">
          <div className="flex min-w-0 items-center gap-2 border-r border-slate-100 px-4 py-3 sm:px-5">
            <Star size={15} className="shrink-0 fill-amber-400 text-amber-400" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">{sellerRatingLabel || 'New seller'}</p>
              <p className="truncate text-[10px] text-slate-500">Seller rating</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 px-4 py-3 sm:px-5">
            <MessageCircle size={15} className="shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900">{sellerResponseLabel}</p>
              <p className="truncate text-[10px] text-slate-500">Response time</p>
            </div>
          </div>
        </div>
      </section>

      {sellerChatOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={`Message ${sellerStoreLabel}`}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Message seller</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">{sellerStoreLabel}</h2>
              </div>
              <button type="button" onClick={() => setSellerChatOpen(false)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close seller chat">x</button>
            </div>
            <textarea
              value={sellerMessage}
              onChange={(event) => setSellerMessage(event.target.value)}
              maxLength={1000}
              placeholder={`Ask about ${product.name}`}
              className="mt-4 min-h-28 w-full resize-y rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setSellerChatOpen(false)} className="min-h-10 flex-1 rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={handleSellerMessage} disabled={sendingSellerMessage || sellerMessage.trim().length < 3} className="min-h-10 flex-1 rounded-md bg-primary px-4 text-sm font-bold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50">{sendingSellerMessage ? 'Sending...' : 'Send message'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tabbed Product Information Section */}
      <div className="mt-6 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[
            { id: 'description' as const, label: 'Description' },
            { id: 'specs' as const, label: 'Specifications' },
            { id: 'shipping' as const, label: 'Delivery & Returns' },
            { id: 'reviews' as const, label: `Reviews (${reviews.length || product.reviews_count})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-slate-950 border-primary'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Panels */}
        <div className="p-5 sm:p-6 lg:p-8">

          {/* Description Panel */}
          {activeTab === 'description' && (
            <div className="max-w-3xl space-y-5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">About this product</span>
                <h3 className="mt-1 text-lg font-bold text-slate-950">Product description</h3>
              </div>
              <div
                className="prose prose-sm prose-slate max-w-none text-slate-600 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderedDescription }}
              />
              {/* Feature Highlights from specs if available */}
              {hasSpecifications && specificationItems.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {specificationItems.slice(0, 4).map((spec, i) => (
                    <div key={`feature-${i}`} className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl">
                      <BadgeCheck size={16} className="text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">{spec.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{spec.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Specifications Panel */}
          {activeTab === 'specs' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-950">Technical Specifications</h3>
                <p className="text-xs text-slate-400 mt-0.5">Detailed product attributes and measurements.</p>
              </div>
              {hasSpecifications ? (
                <div className="w-full rounded-xl overflow-hidden border border-slate-100">
                  <table className="w-full text-left">
                    <tbody>
                      {specificationItems.map((spec, index) => (
                        <tr key={`spec-${index}`} className={index % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                          <th className="py-2.5 px-4 text-xs font-semibold text-slate-500 w-1/3">{spec.label}</th>
                          <td className="py-2.5 px-4 text-xs font-semibold text-slate-800">{spec.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-400">No specifications available for this product.</p>
                </div>
              )}
            </div>
          )}

          {/* Delivery & Returns Panel */}
          {activeTab === 'shipping' && (
            <div className="space-y-5">
              {/* Delivery Zone Picker */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 rounded-xl gap-3">
                <div className="flex items-center gap-2.5">
                  <Truck size={18} className="text-primary" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Shipping Destination</p>
                    <p className="text-sm font-bold text-slate-900">
                      {deliveryZone === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}
                    </p>
                  </div>
                </div>
                <div className="flex rounded-lg bg-white p-0.5 border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDeliveryZone('dhaka')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      deliveryZone === 'dhaka' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Inside Dhaka
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryZone('outside')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      deliveryZone === 'outside' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Outside Dhaka
                  </button>
                </div>
              </div>

              {/* Delivery Options */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                  <Truck size={16} className="text-primary mb-2" />
                  <p className="text-xs font-bold text-slate-800">Standard Delivery</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    2-4 business days nationwide.
                  </p>
                  <p className="text-xs font-bold text-slate-900 mt-2">
                    {deliveryZone === 'dhaka' ? '৳ 80' : '৳ 130'}
                  </p>
                </div>
                <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                  <RefreshCw size={16} className="text-primary mb-2" />
                  <p className="text-xs font-bold text-slate-800">Return Policy</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    7-day hassle-free returns on eligible orders.
                  </p>
                </div>
                <div className="p-4 bg-slate-900 text-white rounded-xl shadow-sm">
                  <PackageCheck size={16} className="mb-2" />
                  <p className="text-xs font-bold">Free Delivery</p>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    {freeShippingRemaining > 0
                      ? `Add ${formatPrice(freeShippingRemaining)} more`
                      : 'Applied automatically!'}
                  </p>
                </div>
              </div>

              {/* Free Shipping Progress */}
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-600">Free delivery progress</p>
                  <span className="text-[10px] font-bold text-primary">Threshold {formatPrice(freeShippingThreshold)}</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-900 rounded-full transition-all"
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Reviews Panel */}
          {activeTab === 'reviews' && (
            <div className="space-y-6" id="customer-reviews">
              {/* Score Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 p-5 bg-slate-50 rounded-xl items-center">
                <div className="sm:col-span-4 flex flex-col items-center sm:items-start text-center sm:text-left gap-1">
                  <span className="text-4xl font-extrabold text-slate-950 leading-none">{(product.rating || 0).toFixed(1)}</span>
                  <div className="flex items-center text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={`summary-${i}`} size={16} fill={i < Math.floor(product.rating || 0) ? 'currentColor' : 'none'} />
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">Based on {reviews.length || product.reviews_count} verified reviews</p>
                </div>
                {/* Star Distribution */}
                <div className="sm:col-span-8 flex flex-col gap-1.5">
                  {reviewBreakdown.map((item) => (
                    <div key={`breakdown-${item.star}`} className="grid grid-cols-[40px_1fr_50px] items-center gap-2 text-xs">
                      <span className="font-medium text-slate-600">{item.star} ★</span>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                      <span className="text-right text-slate-400 text-[11px]">
                        {item.count > 0 ? `${Math.round(item.percentage)}% (${item.count})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Form */}
              <div className="bg-slate-50 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-800">Write a Review</h3>
                {isAuthenticated ? (
                  <form onSubmit={handlePostReview} className="space-y-3">
                    {reviewError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{reviewError}</div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Rating</label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setNewReview({ ...newReview, rating: star })}
                            className="p-0.5 transition-colors"
                          >
                            <Star size={22} fill={star <= newReview.rating ? '#F59E0B' : 'none'} className={star <= newReview.rating ? 'text-amber-400' : 'text-slate-200'} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600">Your Review</label>
                      <textarea
                        required
                        value={newReview.comment}
                        onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm h-24 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition"
                        placeholder="What did you like or dislike?"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="w-full h-10 bg-slate-950 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      {submittingReview && <Loader2 size={16} className="animate-spin" />}
                      Post Review
                    </button>
                  </form>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-xs text-slate-400 mb-2">Please login to write a review.</p>
                    <Link to="/login" className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-dark transition">
                      Login
                    </Link>
                  </div>
                )}
              </div>

              {/* Review Cards */}
              {reviewsLoading ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 flex items-center gap-3 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin" />
                  Loading reviews...
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-sm text-slate-400">No reviews yet. Be the first to review this product!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500">
                            {(review.user_name || 'U')[0]}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">{review.user_name}</p>
                            <div className="flex items-center text-amber-400">
                              {[...Array(5)].map((_, j) => (
                                <Star key={j} size={11} fill={j < review.rating ? 'currentColor' : 'none'} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400">{new Date(review.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{review.comment}</p>
                      <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-slate-50">
                        <button type="button" className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-primary transition">
                          <ThumbsUp size={11} /> Helpful
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Frequently Bought Together */}
      {showDeferredSections ? (
        <div className="mt-6">
          <FrequentlyBoughtTogether productId={product.id} />
        </div>
      ) : (
        <div className="mt-6 h-72 animate-pulse rounded-2xl bg-slate-100" />
      )}

      {/* Mobile Sticky Bottom CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-slate-900">{product.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-sm font-extrabold text-slate-950">{formatPrice(effectivePrice)}</span>
              {hasDiscount && (
                <span className="text-[10px] text-slate-400 line-through">{formatPrice(effectiveOldPrice)}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className="h-11 px-4 bg-slate-950 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
          >
            <ShoppingCart size={15} /> Cart
          </button>
          <button
            type="button"
            onClick={handleBuyNow}
            disabled={isOutOfStock}
            className="h-11 px-4 bg-primary text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
          >
            Buy
          </button>
        </div>
      </div>

      {/* Deferred Sections */}
      <div ref={deferredSectionsRef} className="mt-6 space-y-6">
        {/* Related Products */}
        <section className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Recommendations</span>
              <h2 className="text-base font-bold text-slate-950 mt-0.5">
                {product.category ? `More in ${product.category}` : 'You May Also Like'}
              </h2>
            </div>
            <Link to="/shop" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
              Browse All <ChevronRight size={13} />
            </Link>
          </div>
          {relatedProductsLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-72 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : relatedProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-5 text-xs text-slate-500">
              More products will appear here as the catalog grows.
            </div>
          )}
        </section>

        {/* Seller Products */}
        {(hasSellerOfferBlock || sellerProductsLoading) && (
          <section className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">From this seller</span>
                <h2 className="text-base font-bold text-slate-950 mt-0.5">
                  {sellerDisplayName} store picks
                </h2>
              </div>
              {product.storefront_slug && (
                <Link
                  to={`/store/${product.storefront_slug}`}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  Visit Store <ChevronRight size={13} />
                </Link>
              )}
            </div>
            {sellerProductsLoading ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {[1, 2, 3, 4].map((item) => (
                  <div key={`seller-skeleton-${item}`} className="h-72 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {sellerProducts.map((p) => (
                  <ProductCard key={`seller-${p.id}`} product={p} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Product Lightbox */}
      <ProductLightbox
        images={productMediaImages}
        initialIndex={selectedMediaIndex}
        productName={product.name}
        isOpen={showImageLightbox && hasProductImage}
        onClose={() => setShowImageLightbox(false)}
      />
    </div>
  );
};
