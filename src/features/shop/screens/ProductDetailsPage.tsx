import React, { useEffect, useRef, useState, Suspense, lazy } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useNavigate, Link, useSearchParams } from '@/src/lib/navigation';
import { Star, ShieldCheck, Truck, RefreshCw, ShoppingCart, Heart, Share2, Loader2, Box, Maximize2, View, X, CreditCard, BadgeCheck, Clock3, Scale, ChevronRight, Sparkles, ScanSearch, Store } from 'lucide-react';
import { Product, ProductVariantValue } from '@/src/types';
import { formatPrice } from '@/src/lib/utils';
import OptimizedImage from '@/src/components/ui/OptimizedImage';
import { useCart } from '@/src/context/CartContext';
import { useCompare } from '@/src/context/CompareContext';
import { useWishlist } from '@/src/context/WishlistContext';
import { useUser } from '@/src/context/UserContext';
import { AnimatedIcon } from '@/src/components/ui/AnimatedIcon';
import { getCachedClientValue } from '@/src/lib/client-cache';
import toast from 'react-hot-toast';
import { ProductCard } from '@/src/components/ProductCard';
import { renderProductDescription } from '@/src/lib/product-description';

const ProductViewer3D = lazy(() => import('@/src/components/3d/ProductViewer3D'));
const ARTryOn = lazy(() => import('@/src/components/ar/ARTryOn'));
const AIRecommendation = dynamic(
  () => import('@/src/components/AIRecommendation').then((module) => module.AIRecommendation),
  {
    loading: () => <div className="mt-12 h-80 animate-pulse rounded-[2rem] bg-slate-100" />,
  },
);
const SocialShare = dynamic(
  () => import('@/src/components/SocialShare').then((module) => module.SocialShare),
  {
    ssr: false,
    loading: () => <div className="h-10 w-full animate-pulse rounded-2xl bg-slate-100" />,
  },
);
const FrequentlyBoughtTogether = dynamic(
  () => import('@/src/components/FrequentlyBoughtTogether').then((module) => module.FrequentlyBoughtTogether),
  {
    loading: () => <div className="h-72 animate-pulse rounded-[2rem] bg-slate-100" />,
  },
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
  const [viewMode, setViewMode] = useState<'image' | '3d'>('image');
  const { items, addToCart, setCartItemQuantity } = useCart();
  const { toggleCompare, isInCompare } = useCompare();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAR, setShowAR] = useState(false);
  const [showImageLightbox, setShowImageLightbox] = useState(false);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(2500);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const { user, token, isAuthenticated } = useUser();
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

  useEffect(() => {
    if (!referralCode || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('ref_code', referralCode || '');
  }, [referralCode]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    Promise.all([
      getCachedClientValue(`product-details:${slug}`, 5 * 60 * 1000, async () => {
        const res = await fetch(`/api/products/${slug}`, { cache: 'no-store', signal: controller.signal });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || 'Unable to load this product');
        }
        return payload;
      }),
      getCachedClientValue('commerce-config:public:v1', 10 * 60 * 1000, async () => {
        const res = await fetch('/api/public/commerce-config', { cache: 'no-store', signal: controller.signal });
        return res.ok ? res.json() : null;
      }).catch(() => null),
    ])
      .then(async ([productData, configData]) => {
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
        setReviewsLoaded(false);
        setRelatedProducts([]);
        setSellerProducts([]);
        setShowDeferredSections(false);
        setSelectedMediaIndex(0);
        setViewMode('image');

        if (configData?.free_shipping_threshold) {
          setFreeShippingThreshold(Number(configData.free_shipping_threshold));
        }
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name !== 'AbortError') {
          setProduct(null);
          setReviews([]);
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load this product right now.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [slug]);

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
    if (!product?.id || !showDeferredSections || reviewsLoaded) return;

    const controller = new AbortController();
    setReviewsLoading(true);

    getCachedClientValue(`product-reviews:${product.id}`, 2 * 60 * 1000, async () => {
      const reviewsResponse = await fetch(`/api/products/${product.id}/reviews`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!reviewsResponse.ok) {
        throw new Error('Failed to load reviews');
      }
      return reviewsResponse.json().catch(() => []);
    })
      .then((reviewsData) => {
        if (controller.signal.aborted) return;
        setReviews(Array.isArray(reviewsData) ? reviewsData : []);
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name !== 'AbortError') {
          setReviews([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setReviewsLoaded(true);
          setReviewsLoading(false);
        }
      });

    return () => controller.abort();
  }, [product?.id, reviewsLoaded, showDeferredSections]);

  useEffect(() => {
    if (!product?.id || !product.category || !showDeferredSections) return;

    const controller = new AbortController();
    setRelatedProductsLoading(true);

    getCachedClientValue(`related-products:${product.category}`, 5 * 60 * 1000, async () => {
      const response = await fetch(`/api/products?limit=12&category=${encodeURIComponent(product.category)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Failed to load related products');
      }
      return response.json().catch(() => []);
    })
      .then((productsData) => {
        if (controller.signal.aborted) return;

        const normalized = Array.isArray(productsData) ? productsData : [];
        const sameCategory = normalized.filter((entry) => entry?.slug !== product.slug).slice(0, 4);
        setRelatedProducts(sameCategory as Product[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRelatedProducts([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRelatedProductsLoading(false);
        }
      });

    return () => controller.abort();
  }, [product?.category, product?.id, product?.slug, showDeferredSections]);

  useEffect(() => {
    if (!product?.seller_id || !showDeferredSections) return;

    const controller = new AbortController();
    setSellerProductsLoading(true);

    getCachedClientValue(`seller-products:${product.seller_id}`, 5 * 60 * 1000, async () => {
      const response = await fetch(`/api/products?limit=8&seller_id=${encodeURIComponent(String(product.seller_id))}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Failed to load seller products');
      }
      return response.json().catch(() => []);
    })
      .then((productsData) => {
        if (controller.signal.aborted) return;
        const normalized = Array.isArray(productsData) ? productsData : [];
        const sameSeller = normalized.filter((entry) => entry?.slug !== product.slug).slice(0, 4);
        setSellerProducts(sameSeller as Product[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSellerProducts([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSellerProductsLoading(false);
        }
      });

    return () => controller.abort();
  }, [product?.seller_id, product?.slug, showDeferredSections]);

  const handlePostReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setSubmittingReview(true);
    setReviewError('');
    try {
      const response = await fetch(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newReview)
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to post your review');
      }
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
      const nextRating =
        ((product.rating ?? 0) * (product.reviews_count ?? 0) + Number(newReview.rating)) / Math.max(nextCount, 1);

      setReviews((current) => [nextReview, ...current]);
      setProduct((current) =>
        current
          ? {
              ...current,
              reviews_count: nextCount,
              rating: Number(nextRating.toFixed(1)),
            }
          : current,
      );
      setNewReview({ rating: 5, comment: '' });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Unable to post your review');
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    if (!product) {
      return;
    }

    const selectedVariantEntries = Array.isArray(product.variant_options)
      ? product.variant_options.map((option) => {
          const selectedLabel = selectedVariants[option.name] || getVariantValueLabel(option.values?.[0] as any);
          const selectedValue =
            option.values.find((value) => getVariantValueLabel(value as any) === selectedLabel) ?? option.values?.[0];
          return selectedValue;
        })
      : [];

    const variantStockCandidates = selectedVariantEntries
      .map((value) => getVariantValueStockOverride(value as any))
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const nextMaxSelectableQuantity = Math.max(
      0,
      variantStockCandidates.length > 0 ? Math.min(...variantStockCandidates) : product.stock,
    );

    if (nextMaxSelectableQuantity > 0 && quantity > nextMaxSelectableQuantity) {
      setQuantity(nextMaxSelectableQuantity);
    }
  }, [product, quantity, selectedVariants]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 animate-pulse">
          <div className="aspect-square rounded-3xl bg-gray-200" />
          <div className="space-y-5">
            <div className="h-8 w-2/3 rounded bg-gray-200" />
            <div className="h-5 w-1/3 rounded bg-gray-200" />
            <div className="h-24 rounded-3xl bg-gray-100" />
            <div className="h-28 rounded-3xl bg-gray-100" />
            <div className="h-14 rounded-2xl bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-950">This product is unavailable right now</h1>
          <p className="mt-3 text-sm text-slate-600">
            {error || 'The product could not be loaded. Please try again or continue browsing other items.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Try again
            </button>
            <Link
              to="/shop"
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
        const selectedValue = option.values.find((value) => getVariantValueLabel(value as any) === selectedLabel) ?? option.values?.[0];
        return {
          optionName: option.name,
          selectedLabel,
          selectedValue,
        };
      })
    : [];
  const variantPriceAdjustment = selectedVariantEntries.reduce(
    (sum, entry) => sum + getVariantValuePriceAdjustment(entry.selectedValue as any),
    0,
  );
  const variantStockCandidates = selectedVariantEntries
    .map((entry) => getVariantValueStockOverride(entry.selectedValue as any))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const effectiveStock = variantStockCandidates.length > 0 ? Math.min(...variantStockCandidates) : product.stock;
  const effectivePrice = Math.max(0, product.price + variantPriceAdjustment);
  const effectiveOldPrice =
    product.old_price > product.price
      ? Math.max(effectivePrice, product.old_price + variantPriceAdjustment)
      : product.old_price;
  const selectedVariantSummary = selectedVariantEntries
    .map((entry) => `${entry.optionName}: ${entry.selectedLabel}`)
    .join(' • ');
  const selectedVariantKey = selectedVariantEntries.map((entry) => `${entry.optionName}:${entry.selectedLabel}`).join('|');
  const selectedVariantSkuSuffix = selectedVariantEntries
    .map((entry) => getVariantValueSkuSuffix(entry.selectedValue as any))
    .filter((value): value is string => Boolean(value))
    .join('-');
  const selectedVariantSku = selectedVariantSkuSuffix
    ? `${String(product.sku || '').trim()}-${selectedVariantSkuSuffix}`
    : product.sku || undefined;
  const hasDiscount = effectiveOldPrice > effectivePrice;
  const discount = hasDiscount && effectiveOldPrice > 0
    ? Math.round(((effectiveOldPrice - effectivePrice) / effectiveOldPrice) * 100)
    : 0;
  const isWishlisted = isInWishlist(product.id);
  const isCompared = isInCompare(product.id);
  const isOutOfStock = effectiveStock <= 0;
  const lowStock = effectiveStock > 0 && effectiveStock <= 5;
  const maxSelectableQuantity = Math.max(0, effectiveStock);
  const estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-BD', {
    month: 'short',
    day: 'numeric',
  });
  const freeShippingRemaining = Math.max(0, freeShippingThreshold - effectivePrice);
  const freeShippingProgress = Math.min((effectivePrice / freeShippingThreshold) * 100, 100);
  const hasVariantOptions = variantOptions.length > 0;
  const hasSpecifications = specificationItems.length > 0;
  const sellerDisplayName = product.seller_name?.trim() || 'Verified marketplace seller';
  const sellerStoreLabel = product.store_name?.trim() || sellerDisplayName;
  const sellerInitial = sellerDisplayName.charAt(0).toUpperCase() || 'S';
  const productImageSrc = typeof product.image === 'string' ? product.image.trim() : '';
  const galleryImages = Array.isArray(product.gallery_images)
    ? product.gallery_images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const productMediaImages = [productImageSrc, ...galleryImages].filter((item, index, array) => item && array.indexOf(item) === index);
  const activeImageSrc = productMediaImages[selectedMediaIndex] || productImageSrc;
  const hasProductImage = activeImageSrc.length > 0;
  const hasProductVideo = Boolean(product.video_url && String(product.video_url).trim());
  const arSource = `${product.category || ''} ${product.name || ''}`.toLowerCase();
  const arProductType =
    arSource.includes('shoe') || arSource.includes('sneaker') || arSource.includes('sandal')
      ? 'shoes'
      : arSource.includes('shirt') ||
          arSource.includes('t-shirt') ||
          arSource.includes('tee') ||
          arSource.includes('pant') ||
          arSource.includes('trouser') ||
          arSource.includes('dress') ||
          arSource.includes('jacket') ||
          arSource.includes('hoodie') ||
          arSource.includes('clothing') ||
          arSource.includes('fashion')
        ? 'clothing'
        : arSource.includes('glass') ||
            arSource.includes('watch') ||
            arSource.includes('cap') ||
            arSource.includes('bag') ||
            arSource.includes('accessor')
          ? 'accessories'
          : null;
  const supportsARTryOn = Boolean(arProductType);
  const sellerResponseLabel = product.response_time_hours
    ? `Responds in ~${product.response_time_hours}h`
    : 'Fast response';
  const sellerRatingLabel = product.seller_rating ? product.seller_rating.toFixed(1) : null;
  const quickFacts = [
    { label: 'Category', value: product.category || 'General' },
    { label: 'SKU', value: selectedVariantSku || product.sku || 'Auto assigned' },
    { label: 'Selection', value: selectedVariantSummary || 'Standard edition' },
    { label: 'Availability', value: isOutOfStock ? 'Temporarily unavailable' : `${effectiveStock} ready to order` },
  ];
  const deliveryEstimateLabel =
    deliveryZone === 'dhaka'
      ? `Inside Dhaka: ${estimatedDelivery}`
      : `Outside Dhaka: ${new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-BD', {
          month: 'short',
          day: 'numeric',
        })}`;
  const serviceHighlights = [
    {
      title: 'Cash on delivery',
      description: 'Pay when the order reaches you.',
      icon: <CreditCard size={18} />,
    },
    {
      title: 'Fast delivery',
      description: `Expected by ${estimatedDelivery}.`,
      icon: <Truck size={18} />,
    },
    {
      title: 'Easy return',
      description: '7-day return support on eligible orders.',
      icon: <ShieldCheck size={18} />,
    },
  ];
  const landingHighlights = ['Cash on delivery', 'Fast delivery', 'Verified seller', 'Easy return'];
  const featureBullets = [
    selectedVariantSummary || 'Standard selection ready to order',
    `${effectiveStock > 0 ? effectiveStock : 0} item${effectiveStock === 1 ? '' : 's'} available`,
    `Delivery by ${estimatedDelivery}`,
  ];
  const mediaHighlights = [
    {
      title: 'Primary image',
      value: 'High-resolution product photo',
      icon: <Box className="h-4 w-4" />,
    },
    {
      title: 'Close inspection',
      value: 'Zoom-friendly sharp display',
      icon: <ScanSearch className="h-4 w-4" />,
    },
    {
      title: 'Seller coverage',
      value: sellerDisplayName,
      icon: <Store className="h-4 w-4" />,
    },
    {
      title: product.model_3d ? '3D view ready' : 'Purchase support',
      value: product.model_3d ? 'Explore this item in 3D' : 'Returns and delivery support included',
      icon: product.model_3d ? <View className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />,
    },
  ];
  const serviceTiles = [
    { label: 'Delivery', value: estimatedDelivery, icon: <Truck className="h-4 w-4" /> },
    { label: 'Return', value: '7 days', icon: <RefreshCw className="h-4 w-4" /> },
    { label: 'Payment', value: 'COD ready', icon: <CreditCard className="h-4 w-4" /> },
    { label: 'Seller', value: 'Verified', icon: <BadgeCheck className="h-4 w-4" /> },
  ];
  const reviewBreakdown = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((review) => Number(review.rating) === star).length;
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
    if (!product || isOutOfStock) {
      return;
    }

    if (isAlreadyInCart) {
      toast('This item is already in your cart.', { icon: '??' });
      return;
    }

    addToCart(productForCart, Math.min(quantity, maxSelectableQuantity || quantity));
  };

  const handleCompareToggle = () => {
    const result = toggleCompare(product);
    if (result.reason) {
      toast.error(result.reason);
      return;
    }
    toast.success(result.added ? 'Added to compare list' : 'Removed from compare list');
  };

  const handleImagePointerMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setImageZoomOrigin(`${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-28 md:py-12 md:pb-12">
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link to="/" className="font-medium transition hover:text-primary">
          Home
        </Link>
        <ChevronRight className="h-4 w-4 text-slate-300" />
        <Link to="/shop" className="font-medium transition hover:text-primary">
          Shop
        </Link>
        {product.category ? (
          <>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className="font-medium text-slate-600">{product.category}</span>
          </>
        ) : null}
        <ChevronRight className="h-4 w-4 text-slate-300" />
        <span className="line-clamp-1 font-semibold text-slate-900">{product.name}</span>
      </div>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] xl:gap-12">
        {/* Image Gallery / 3D Viewer */}
        <div className="order-1 space-y-3 sm:space-y-4 lg:order-1">
          <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-sm group">
            {viewMode === 'image' ? (
              hasProductImage ? (
                <button
                  type="button"
                  onClick={() => setShowImageLightbox(true)}
                  onMouseMove={handleImagePointerMove}
                  onMouseEnter={() => setIsImageZoomed(true)}
                  onMouseLeave={() => {
                    setIsImageZoomed(false);
                    setImageZoomOrigin('50% 50%');
                  }}
                  className="block h-full w-full cursor-zoom-in"
                  aria-label="Open product image"
                >
                  <div className="flex h-full w-full items-center justify-center p-4 sm:p-6 lg:p-8">
                    <OptimizedImage
                      src={activeImageSrc}
                      alt={product.name}
                      widthHint={1600}
                      heightHint={1600}
                      quality="auto:best"
                      fit="limit"
                      eager
                      showPlaceholder={false}
                      className="h-full w-full object-contain transition duration-300 ease-out"
                      style={{
                        transformOrigin: imageZoomOrigin,
                        transform: isImageZoomed ? 'scale(1.18)' : 'scale(1)',
                      }}
                    />
                  </div>
                </button>
              ) : (
                <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_top,#ffffff_0%,#f8fafc_45%,#e2e8f0_100%)] p-8 text-center">
                  <div className="max-w-xs">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-slate-400 shadow-sm">
                      <Box className="h-8 w-8" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-slate-700">Product photo is being prepared</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      This listing is live, but the main product image has not been added yet.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="w-full h-full">
                <Suspense fallback={<div className="h-full grid place-items-center text-sm text-gray-500">Loading 3D viewer...</div>}>
                  <ProductViewer3D modelUrl={product.model_3d || ''} />
                </Suspense>
              </div>
            )}
            
            {/* View Mode Toggles */}
            {product.model_3d && (
              <div className="absolute bottom-4 left-1/2 z-20 flex w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 gap-2 rounded-2xl border border-white/20 bg-white/90 p-1.5 shadow-xl backdrop-blur-md sm:bottom-6 sm:w-auto">
                <button
                  onClick={() => setViewMode('image')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    viewMode === 'image' 
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <AnimatedIcon loop="none"><Box className="w-4 h-4" /></AnimatedIcon>
                  Photo
                </button>
                <button
                  onClick={() => setViewMode('3d')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    viewMode === '3d' 
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <AnimatedIcon loop="none"><View className="w-4 h-4" /></AnimatedIcon>
                  3D View
                </button>
              </div>
            )}

            {/* Quick preview actions */}
            <div className="absolute right-4 top-4 flex flex-col gap-2 sm:right-5 sm:top-5">
              <button
                type="button"
                onClick={() => setShowImageLightbox(true)}
                disabled={!hasProductImage}
                className="rounded-xl bg-white/90 p-3 shadow-lg backdrop-blur transition-all hover:bg-slate-950 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 group/btn"
              >
                <AnimatedIcon loop="none"><Maximize2 className="w-5 h-5" /></AnimatedIcon>
                <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded opacity-0 group-hover/btn:opacity-100 whitespace-nowrap transition-opacity">
                  Enlarge
                </span>
              </button>
              {supportsARTryOn ? (
                <button
                  onClick={() => setShowAR(true)}
                  className="rounded-xl bg-white/90 p-3 shadow-lg backdrop-blur transition-all hover:bg-emerald-600 hover:text-white group/btn"
                >
                  <AnimatedIcon loop="pulse"><Maximize2 className="w-5 h-5" /></AnimatedIcon>
                  <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-zinc-900 text-white text-[10px] rounded opacity-0 group-hover/btn:opacity-100 whitespace-nowrap transition-opacity">
                    AR Try-on
                  </span>
                </button>
              ) : null}
            </div>
          </div>
          {(productMediaImages.length > 1 || hasProductVideo) && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {productMediaImages.map((imageUrl, index) => (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  onClick={() => {
                    setViewMode('image');
                    setSelectedMediaIndex(index);
                  }}
                  className={`aspect-square overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                    activeImageSrc === imageUrl && viewMode === 'image'
                      ? 'border-primary ring-2 ring-primary/15'
                      : 'border-slate-200 hover:border-slate-300'
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
              {hasProductVideo ? (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined' && product.video_url) {
                      window.open(product.video_url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="aspect-square rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Video</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">Watch demo</p>
                </button>
              ) : null}
            </div>
          )}
          <div className="hidden space-y-4 rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm lg:block">
            <div className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Delivery estimator</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">{deliveryEstimateLabel}</h3>
                  <p className="mt-1 text-sm text-slate-500">Pick your delivery zone to get a quick timing estimate before checkout.</p>
                </div>
                <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setDeliveryZone('dhaka')}
                    className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${deliveryZone === 'dhaka' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                  >
                    Inside Dhaka
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryZone('outside')}
                    className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${deliveryZone === 'outside' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                  >
                    Outside Dhaka
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm sm:grid-cols-2 2xl:grid-cols-4">
              {serviceTiles.map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 px-4 py-4">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                    {item.icon}
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">About this item</p>
                <h3 className="mt-2 text-xl font-bold text-slate-900">Product description</h3>
              </div>
            </div>
            <div
              className="space-y-4"
              dangerouslySetInnerHTML={{ __html: renderedDescription }}
            />
          </div>
        </div>

        {/* Product Info */}
        <div className="order-2 min-w-0 space-y-6 self-start sm:space-y-8 lg:order-2 lg:sticky lg:top-24">
          <div>
            <div className="mb-2 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold font-display leading-tight sm:text-3xl md:text-4xl">{product.name}</h1>
              <div className="relative">
                <button 
                  onClick={() => setShowShare(!showShare)}
                  className="p-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <AnimatedIcon loop="none"><Share2 className="w-5 h-5" /></AnimatedIcon>
                </button>
                {showShare && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Share Product</span>
                      <button onClick={() => setShowShare(false)}><AnimatedIcon loop="none"><X size={14} /></AnimatedIcon></button>
                    </div>
                    <SocialShare 
                      url={window.location.href} 
                      title={`Check out this ${product.name} on our store!`} 
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center text-yellow-400">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={18} fill={i < Math.floor(product.rating) ? "currentColor" : "none"} />
                ))}
                <span className="ml-2 text-sm font-bold text-gray-700">{product.rating}</span>
              </div>
              <span className="text-sm text-gray-400">|</span>
              <span className="text-sm text-gray-500">{product.reviews_count} Reviews</span>
              <span className="text-sm text-gray-400">|</span>
              <span className={effectiveStock > 0 ? "text-primary text-sm font-bold" : "text-accent text-sm font-bold"}>
                {effectiveStock > 0 ? "In Stock" : "Out of Stock"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {lowStock && (
                <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm font-semibold text-accent">
                  <AnimatedIcon loop="pulse"><Clock3 size={16} /></AnimatedIcon>
                  Only {effectiveStock} left in stock
                </div>
              )}
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                  <AnimatedIcon loop="none"><Truck size={16} /></AnimatedIcon>
                  Delivery by {estimatedDelivery}
                </div>
              </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {landingHighlights.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#fbd8c4] bg-[#fff7f2] p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-end gap-3">
              <span className="text-4xl font-bold text-[#f57224]">{formatPrice(effectivePrice)}</span>
              {effectiveOldPrice > effectivePrice && (
                <>
                  <span className="text-xl text-gray-400 line-through">{formatPrice(effectiveOldPrice)}</span>
                  <span className="rounded bg-[#f57224] px-2 py-1 text-xs font-bold text-white">-{discount}% OFF</span>
                </>
              )}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600">
              <p>Inclusive of VAT where applicable.</p>
              <p>
              {discount > 0
                ? `You save ${formatPrice(effectiveOldPrice - effectivePrice)} on this order.`
                : 'Competitive pricing from a verified seller.'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm sm:grid-cols-3">
            {featureBullets.map((item) => (
              <div key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {item}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {hasVariantOptions ? (
              <div className="space-y-4 rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Available options</p>
                  <h3 className="mt-2 text-xl font-bold text-gray-900">Choose the version that fits best</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    SKU: {selectedVariantSku || product.sku || 'Auto'}
                  </span>
                </div>
                <div className="space-y-4">
                  {variantOptions.map((option) => (
                    <div key={option.name} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{option.name}</p>
                        <span className="text-xs text-slate-500">
                          Selected: {selectedVariants[option.name] || getVariantValueLabel(option.values?.[0] as any) || 'Not selected'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {option.values.map((value) => {
                          const valueLabel = getVariantValueLabel(value as any);
                          const adjustment = getVariantValuePriceAdjustment(value as any);
                          const stockOverride = getVariantValueStockOverride(value as any);
                          const isActive = selectedVariants[option.name] === valueLabel;
                          return (
                            <button
                              key={`${option.name}-${valueLabel}`}
                              type="button"
                              onClick={() =>
                                setSelectedVariants((current) => ({
                                  ...current,
                                  [option.name]: valueLabel,
                                }))
                              }
                              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                isActive
                                  ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-primary/30 hover:bg-primary/5 hover:text-primary'
                              }`}
                            >
                              <span>{valueLabel}</span>
                              {adjustment !== 0 ? (
                                <span className={`ml-2 text-xs ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                                  {adjustment > 0 ? `+${formatPrice(adjustment)}` : formatPrice(adjustment)}
                                </span>
                              ) : null}
                              {stockOverride !== null ? (
                                <span className={`ml-2 text-xs ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                                  {stockOverride} stock
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex w-full items-center justify-between border border-gray-200 rounded-lg sm:w-auto sm:justify-start">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="px-4 py-2 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      -
                    </button>
                    <span className="px-6 py-2 text-center font-bold">{quantity}</span>
                    <button
                      onClick={() => setQuantity(q => Math.min(maxSelectableQuantity || 1, q + 1))}
                      disabled={isOutOfStock || quantity >= maxSelectableQuantity}
                      className="px-4 py-2 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    Qty {quantity} • Total {formatPrice(effectivePrice * quantity)}
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock}
                    className="rounded-2xl bg-[#ffd814] px-5 py-3.5 text-sm font-bold text-slate-900 transition hover:bg-[#f7ca00] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="inline-flex items-center justify-center space-x-2">
                      <AnimatedIcon loop="none"><ShoppingCart size={20} /></AnimatedIcon>
                      <span>{isOutOfStock ? 'Out of stock' : isAlreadyInCart ? 'Already in cart' : 'Add to cart'}</span>
                    </span>
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={isOutOfStock}
                    className="rounded-2xl bg-[#f57224] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#e26418] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isOutOfStock ? 'Unavailable' : 'Buy now'}
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => toggleWishlist(product)}
                      className={`rounded-2xl border p-3 transition-all ${isWishlisted ? 'border-accent text-accent bg-accent/5' : 'border-gray-200 hover:text-accent hover:border-accent'}`}
                    >
                      <AnimatedIcon loop={isWishlisted ? 'pulse' : 'float'} glow>
                        <Heart size={22} fill={isWishlisted ? "currentColor" : "none"} />
                      </AnimatedIcon>
                    </button>
                    <button
                      onClick={handleCompareToggle}
                      className={`rounded-2xl border p-3 transition-all ${isCompared ? 'border-primary text-primary bg-primary/5' : 'border-gray-200 hover:text-primary hover:border-primary'}`}
                    >
                      <AnimatedIcon loop={isCompared ? 'pulse' : 'none'}>
                        <Scale size={22} />
                      </AnimatedIcon>
                    </button>
                  </div>
                </div>
              <div className="grid gap-3 sm:grid-cols-3">
                  {serviceHighlights.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                        {item.icon}
                      </div>
                      <p className="text-sm font-bold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm sm:p-6 lg:hidden">
              <div className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Delivery estimator</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-900">{deliveryEstimateLabel}</h3>
                    <p className="mt-1 text-sm text-slate-500">Pick your delivery zone to get a quick timing estimate before checkout.</p>
                  </div>
                  <div className="grid grid-cols-1 rounded-2xl bg-slate-100 p-1 sm:inline-flex sm:grid-cols-none">
                    <button
                      type="button"
                      onClick={() => setDeliveryZone('dhaka')}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${deliveryZone === 'dhaka' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                    >
                      Inside Dhaka
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryZone('outside')}
                      className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${deliveryZone === 'outside' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                    >
                      Outside Dhaka
                    </button>
                  </div>
                </div>
              </div>

            <div className="grid gap-4 rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm sm:grid-cols-2">
                {serviceTiles.map((item) => (
                  <div key={`mobile-${item.label}`} className="rounded-2xl bg-slate-50 px-4 py-4">
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                      {item.icon}
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">About this item</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">Product description</h3>
                </div>
              </div>
              <div
                className="space-y-4"
                dangerouslySetInnerHTML={{ __html: renderedDescription }}
              />
            </div>

            <div className="grid gap-4 rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm xl:grid-cols-[1.1fr_0.9fr] sm:p-6">
              <div className="flex items-center space-x-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                  {sellerInitial}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Sold by</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900">{sellerStoreLabel}</p>
                    {product.verification_badge ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        Verified
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {sellerRatingLabel ? `${sellerRatingLabel}/5 seller rating` : 'Trusted marketplace seller'} • {sellerResponseLabel}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-500">Ships from</span>
                    <span className="text-right font-semibold text-slate-900">LofiMart network</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-500">Sold by</span>
                    <span className="text-right font-semibold text-slate-900">{sellerStoreLabel}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-500">Returns</span>
                    <span className="text-right font-semibold text-slate-900">7-day support</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-500">Reply time</span>
                    <span className="text-right font-semibold text-slate-900">{sellerResponseLabel}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {quickFacts.map((fact) => (
                        <div key={fact.label}>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{fact.label}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{fact.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {product.seller_id ? (
                  <Link
                    to={`/seller-profile/${product.seller_id}`}
                    className="mt-4 inline-flex text-sm font-bold text-primary hover:underline"
                  >
                    Visit seller
                  </Link>
                ) : null}
              </div>
            </div>

            {hasSpecifications ? (
              <div className="space-y-4 rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Specifications</p>
                  <h3 className="mt-2 text-xl font-bold text-gray-900">Important product details</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {specificationItems.map((specification, index) => (
                    <div key={`${specification.label}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{specification.label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{specification.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded-[2rem] border border-black/5 bg-white/90 p-5 shadow-sm sm:p-6">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Free delivery progress</p>
                  <h3 className="mt-2 text-xl font-bold text-gray-900">
                    {freeShippingRemaining > 0
                      ? `Add ${formatPrice(freeShippingRemaining)} more for free delivery`
                      : 'This item already qualifies for free delivery'}
                  </h3>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  Threshold {formatPrice(freeShippingThreshold)}
                </span>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#22c55e_100%)] transition-all"
                  style={{ width: `${freeShippingProgress}%` }}
                />
              </div>
            </div>

            {product.reseller_enabled ? (
              <div className="rounded-[2rem] border border-emerald-100 bg-[linear-gradient(180deg,#ecfdf5_0%,#ffffff_100%)] p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-700/80">Reseller ready</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-950">This product is available for reseller growth</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Marketplace-ready pricing and seller approval settings are already configured for reseller workflows.
                    </p>
                  </div>
                  {product.reseller_base_price || product.reseller_suggested_price ? (
                    <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
                      Base {formatPrice(product.reseller_base_price || effectivePrice)}
                      {product.reseller_suggested_price ? ` • Suggest ${formatPrice(product.reseller_suggested_price)}` : ''}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

        </div>
      </div>
      </div>

      {/* Reviews Section */}
      <div className="mt-20 space-y-12">
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold">Customer Reviews ({reviews.length})</h2>
          <div className="flex flex-wrap items-center gap-3 sm:space-x-4">
            <div className="flex items-center text-yellow-400">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={20} fill={i < Math.floor(product.rating || 0) ? "currentColor" : "none"} />
              ))}
            </div>
            <span className="text-lg font-bold sm:text-xl">{(product.rating || 0).toFixed(1)} out of 5</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(17rem,0.9fr)_minmax(17rem,0.9fr)_minmax(0,1.1fr)] xl:gap-12">
          {/* Review Form */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Customer rating</p>
              <div className="mt-4 flex items-center gap-4">
                <span className="text-4xl font-bold text-slate-950">{(product.rating || 0).toFixed(1)}</span>
                <div>
                  <div className="flex items-center text-yellow-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={`summary-${i}`} size={18} fill={i < Math.floor(product.rating || 0) ? 'currentColor' : 'none'} />
                    ))}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{reviews.length} customer review{reviews.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {reviewBreakdown.map((item) => (
                  <div key={`breakdown-${item.star}`} className="grid grid-cols-[48px_1fr_32px] items-center gap-3 text-sm">
                    <span className="font-medium text-slate-600">{item.star} star</span>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#f59e0b] transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <span className="text-right text-slate-500">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-bg-light rounded-3xl p-6 space-y-6 sm:p-8">
              <h3 className="font-bold text-lg">Write a Review</h3>
              {isAuthenticated ? (
                <form onSubmit={handlePostReview} className="space-y-4">
                  {reviewError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {reviewError}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Rating</label>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setNewReview({ ...newReview, rating: star })}
                          className={`p-1 transition-colors ${star <= newReview.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                        >
                          <Star size={24} fill={star <= newReview.rating ? "currentColor" : "none"} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Comment</label>
                    <textarea
                      required
                      value={newReview.comment}
                      onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                      className="w-full bg-white border-none rounded-xl py-3 px-4 h-32 focus:ring-2 focus:ring-primary/20"
                      placeholder="What did you like or dislike?"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="w-full btn-primary py-3 flex items-center justify-center space-x-2"
                  >
                    {submittingReview && <Loader2 size={18} className="animate-spin" />}
                    <span>Post Review</span>
                  </button>
                </form>
              ) : (
                <div className="text-center space-y-4">
                  <p className="text-sm text-gray-500">Please login to write a review.</p>
                  <Link to="/login" className="btn-primary inline-block px-8 py-2 text-sm">Login</Link>
                </div>
              )}
            </div>
          </div>

          {/* Review List */}
          <div className="lg:col-span-2 space-y-8">
            {reviewsLoading ? (
              <div className="rounded-3xl border border-gray-100 bg-gray-50 p-8">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <Loader2 size={18} className="animate-spin" />
                  <span>Loading customer reviews...</span>
                </div>
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                <p className="text-gray-500">No reviews yet. Be the first to review this product!</p>
              </div>
            ) : (
              reviews.map((review, i) => (
                <div key={review.id} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-500">
                        {review.user_name[0]}
                      </div>
                      <div>
                        <p className="font-bold text-sm">{review.user_name}</p>
                        <div className="flex items-center text-yellow-400">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={12} fill={i < review.rating ? "currentColor" : "none"} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(review.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="pl-0 text-sm leading-relaxed text-gray-600 sm:pl-[3.25rem]">
                    {review.comment}
                  </p>
                  {i < reviews.length - 1 && <div className="border-b border-gray-100 pt-4" />}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-16 grid gap-4 rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
        {mediaHighlights.map((item) => (
          <div key={`bottom-${item.title}`} className="rounded-2xl bg-slate-50 px-4 py-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
              {item.icon}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{item.title}</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      {/* AI Recommendations */}
      {showDeferredSections ? (
        <AIRecommendation productId={product.id} title="You Might Also Like" />
      ) : (
        <div className="mt-12 h-80 animate-pulse rounded-[2rem] bg-slate-100" />
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 p-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-base font-bold text-primary">{formatPrice(effectivePrice)}</span>
              {hasDiscount ? (
                <span className="text-xs text-slate-400 line-through">{formatPrice(effectiveOldPrice)}</span>
              ) : null}
            </div>
            <p className={`mt-1 text-xs font-medium ${isOutOfStock ? 'text-rose-600' : 'text-slate-500'}`}>
              {isOutOfStock ? 'Unavailable right now' : `${quantity} selected • delivery by ${estimatedDelivery}`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className="rounded-2xl border border-primary/15 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cart
          </button>
          <button
            type="button"
            onClick={handleBuyNow}
            disabled={isOutOfStock}
            className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Buy now
          </button>
        </div>
      </div>

      <div ref={deferredSectionsRef} className="mt-16 space-y-16">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">Complete the look</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                {product.category ? `More in ${product.category}` : 'More products shoppers also explore'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Similar picks help buyers compare faster and keep browsing without losing momentum.
              </p>
            </div>
            <Link to="/shop" className="text-sm font-bold text-primary hover:underline">
              View all products
            </Link>
          </div>

          {relatedProductsLoading ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-80 animate-pulse rounded-[2rem] bg-slate-100" />
              ))}
            </div>
          ) : relatedProducts.length > 0 ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[2rem] bg-slate-50 px-5 py-6 text-sm text-slate-600">
              More products from this category will appear here as your catalog grows.
            </div>
          )}
        </section>

        {showDeferredSections ? (
          <FrequentlyBoughtTogether productId={product.id} />
        ) : (
          <div className="h-72 animate-pulse rounded-[2rem] bg-slate-100" />
        )}

        {hasSellerOfferBlock || sellerProductsLoading ? (
          <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary/70">More from this seller</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">{sellerDisplayName} storefront picks</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Compare more products from the same seller before you checkout.
                </p>
              </div>
              {product.seller_id ? (
                <Link to={`/seller-profile/${product.seller_id}`} className="text-sm font-bold text-primary hover:underline">
                  Visit seller store
                </Link>
              ) : null}
            </div>

            {sellerProductsLoading ? (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((item) => (
                  <div key={`seller-skeleton-${item}`} className="h-80 animate-pulse rounded-[2rem] bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {sellerProducts.map((sellerProduct) => (
                  <ProductCard key={`seller-${sellerProduct.id}`} product={sellerProduct} />
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {showImageLightbox && hasProductImage && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/85 p-3 sm:items-center sm:p-4">
          <button
            type="button"
            onClick={() => setShowImageLightbox(false)}
            className="fixed right-3 top-3 z-[71] rounded-full bg-white/10 p-3 text-white backdrop-blur transition hover:bg-white/20 sm:right-4 sm:top-4"
            aria-label="Close image preview"
          >
            <X size={20} />
          </button>
          <div className="my-14 w-full max-w-6xl overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950 shadow-2xl sm:my-6 sm:rounded-[2rem]">
            <OptimizedImage
              src={activeImageSrc}
              alt={product.name}
              widthHint={1800}
              heightHint={1800}
              quality="auto:best"
              fit="limit"
              eager
              showPlaceholder={false}
              className="max-h-[calc(100vh-7rem)] min-h-[16rem] w-full object-contain bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_58%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] sm:max-h-[90vh]"
            />
          </div>
        </div>
      )}

      {showAR && (
        <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-black/70 text-white z-50">Loading AR Try-On...</div>}>
          <ARTryOn
            productName={product.name}
            productType={arProductType || 'accessories'}
            onClose={() => setShowAR(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

