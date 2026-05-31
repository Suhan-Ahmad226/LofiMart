import React, { Suspense, lazy, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Heart, Info, Share2, ShoppingCart } from 'lucide-react';
import { Link, useNavigate, useParams } from '@/src/lib/navigation';
import { useCart } from '@/src/context/CartContext';
import { useWishlist } from '@/src/context/WishlistContext';
import { copyText } from '@/src/lib/browser-actions';
import { formatPrice } from '@/src/lib/utils';
import type { Product } from '@/src/types';
import toast from 'react-hot-toast';
import OptimizedImage from '@/src/components/ui/OptimizedImage';
const ProductViewer3D = lazy(() => import('@/src/components/3d/ProductViewer3D'));
const DemoPageLinks = dynamic(() => import('@/src/components/DemoPageLinks'), {
  loading: () => <div className="h-64 animate-pulse rounded-[2rem] bg-slate-100" />,
});

interface ImmersiveProduct extends Product {
  modelUrl: string;
  colors: Array<{ name: string; value: string }>;
  features: string[];
  productType: 'shoes' | 'furniture' | 'electronics';
}

const SAMPLE_3D_PRODUCTS: Record<string, ImmersiveProduct> = {
  shoe_nike: {
    id: 900101,
    name: 'Nike Air Max 90',
    slug: 'nike-air-max-90-3d',
    description: 'Classic Air Max comfort with an immersive preview workflow for color and fit exploration.',
    price: 12999,
    old_price: 15499,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&h=900&fit=crop',
    category: 'Footwear',
    stock: 12,
    rating: 4.8,
    reviews_count: 126,
    modelUrl: 'https://models.readyplayer.me/63c1d13ba4a07800087fa5d6.glb',
    colors: [
      { name: 'White', value: '#f8fafc' },
      { name: 'Black', value: '#111827' },
      { name: 'Blue', value: '#2563eb' },
    ],
    features: ['Air Max cushioning', 'Breathable mesh upper', 'Durable rubber sole', 'Lightweight design'],
    productType: 'shoes',
  },
  chair_office: {
    id: 900102,
    name: 'Modern Office Chair',
    slug: 'modern-office-chair-3d',
    description: 'Preview scale, angles, and finishes before adding this ergonomic chair to your workspace.',
    price: 28990,
    old_price: 32990,
    image: 'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?w=900&h=900&fit=crop',
    category: 'Furniture',
    stock: 8,
    rating: 4.6,
    reviews_count: 48,
    modelUrl: 'https://models.readyplayer.me/63c1d13ba4a07800087fa5d6.glb',
    colors: [
      { name: 'Black', value: '#111827' },
      { name: 'Gray', value: '#6b7280' },
      { name: 'Blue', value: '#2563eb' },
    ],
    features: ['Ergonomic design', 'Adjustable armrests', 'Lumbar support', 'Swivel and tilt function'],
    productType: 'furniture',
  },
  laptop_pro: {
    id: 900103,
    name: 'Premium Laptop',
    slug: 'premium-laptop-3d',
    description: 'Inspect the chassis, ports, and finishes through a richer 3D exploration experience.',
    price: 129990,
    old_price: 141990,
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&h=900&fit=crop',
    category: 'Electronics',
    stock: 5,
    rating: 4.9,
    reviews_count: 34,
    modelUrl: 'https://models.readyplayer.me/63c1d13ba4a07800087fa5d6.glb',
    colors: [
      { name: 'Silver', value: '#cbd5e1' },
      { name: 'Space Gray', value: '#4b5563' },
      { name: 'Gold', value: '#d4a373' },
    ],
    features: ['16-inch display', 'Intel Core i9', '32GB RAM', 'Fast SSD storage'],
    productType: 'electronics',
  },
};

export const Product3DDemoPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [viewerEnabled, setViewerEnabled] = useState(false);

  const product = useMemo(
    () => SAMPLE_3D_PRODUCTS[productId as keyof typeof SAMPLE_3D_PRODUCTS] || SAMPLE_3D_PRODUCTS.shoe_nike,
    [productId],
  );

  const activeColor = selectedColor || product.colors[0]?.value || 'default';
  const liked = isInWishlist(product.id);

  const relatedPages = [
    {
      href: '/product-3d',
      title: '3D Product Hub',
      description: 'Return to the immersive product gallery and explore additional 3D-ready items.',
    },
    {
      href: '/ar-tryon',
      title: 'AR Try-On',
      description: 'Move from viewer mode into live camera-based testing for supported products.',
    },
    {
      href: '/room-visualizer',
      title: 'Room Visualizer',
      description: 'Continue into a spatial planning flow for home and furniture products.',
    },
    {
      href: '/shop',
      title: 'Shop Catalog',
      description: 'Return to the main catalog and continue browsing the full storefront.',
    },
  ];

  const handleARView = () => {
    navigate('/ar-tryon', {
      state: { productName: product.name, productType: product.productType },
    });
  };

  const handleAddToCart = async () => {
    setAddingToCart(true);
    try {
      addToCart(product, quantity);
      toast.success(`${quantity} x ${product.name} added to your cart.`);
    } catch (cartError) {
      toast.error('Could not add this item right now. Please try again.');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleToggleWishlist = async () => {
    try {
      await toggleWishlist(product);
      toast.success(
        liked ? `${product.name} removed from your wishlist.` : `${product.name} saved to your wishlist.`,
      );
    } catch {
      toast.error('Could not update your wishlist right now.');
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: `Check out this immersive 3D view for ${product.name}.`,
          url: shareUrl,
        });
      } else {
        const copied = await copyText(shareUrl);
        if (!copied) {
          toast.error('Could not copy the product link on this device.');
          return;
        }
        toast.success('Product link copied to clipboard.');
      }
    } catch {
      toast.error('Sharing was cancelled or unavailable on this device.');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link to="/shop" className="flex items-center gap-2 text-blue-600 hover:text-blue-700">
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Shop</span>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">3D Product Viewer</h1>
          <div style={{ width: '120px' }} />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            {viewerEnabled ? (
              <Suspense
                fallback={
                  <div className="flex h-[500px] items-center justify-center rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 text-sm text-gray-500 shadow-2xl">
                    Loading 3D viewer...
                  </div>
                }
              >
                <ProductViewer3D
                  modelUrl={product.modelUrl}
                  enableAR
                  onViewInAR={handleARView}
                  onColorChange={setSelectedColor}
                  productName={product.name}
                  colors={product.colors}
                  backgroundColor="#f8f9fa"
                />
              </Suspense>
            ) : (
              <div className="flex h-[500px] flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-8 text-center shadow-2xl">
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-gray-900">Interactive 3D preview is ready</p>
                  <p className="max-w-md text-sm text-gray-600">
                    Load the immersive viewer only when you are ready to inspect details, colors, and camera angles.
                  </p>
                </div>
                <button
                  onClick={() => setViewerEnabled(true)}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Open 3D Viewer
                </button>
              </div>
            )}

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
                <div className="text-sm text-blue-800">
                  <p className="mb-1 font-semibold">Pro Tips</p>
                  <ul className="space-y-1 text-xs">
                    <li>Rotate the model, zoom in on details, and use quick camera angles for a faster review.</li>
                    <li>Open the AR view to continue the same product journey in live camera mode.</li>
                    <li>Add the item directly to your real cart, then continue to checkout from the main storefront.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-3xl font-bold text-gray-900">{product.name}</h2>
              <p className="text-lg text-gray-600">{product.description}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-gray-900">{formatPrice(product.price)}</span>
                <span className="text-lg text-gray-500 line-through">{formatPrice(product.old_price)}</span>
              </div>
              <p className="text-sm font-medium text-green-600">
                Better buying confidence with interactive 3D preview
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Available Colors</h3>
              <div className="flex flex-wrap gap-3">
                {product.colors.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color.value)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      activeColor === color.value
                        ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {color.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Quantity</h3>
              <div className="flex w-fit items-center gap-3 rounded-lg border border-gray-300">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  -
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, parseInt(event.target.value, 10) || 1))}
                  className="w-16 border-0 bg-transparent text-center focus:outline-none"
                  min="1"
                  max="10"
                />
                <button
                  onClick={() => setQuantity(Math.min(10, quantity + 1))}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Key Features</h3>
              <ul className="space-y-2">
                {product.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-gray-700">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3 pt-4">
              <button
                onClick={() => void handleAddToCart()}
                disabled={addingToCart}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ShoppingCart className="h-5 w-5" />
                {addingToCart ? 'Adding...' : 'Add to Cart'}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => void handleToggleWishlist()}
                  className={`flex items-center justify-center gap-2 rounded-lg py-3 font-semibold transition ${
                    liked
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  <Heart className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
                  {liked ? 'Saved' : 'Save'}
                </button>
                <button
                  onClick={() => void handleShare()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-gray-200 py-3 font-semibold text-gray-700 transition hover:bg-gray-300"
                >
                  <Share2 className="h-5 w-5" />
                  Share
                </button>
              </div>
            </div>

            <div className="space-y-2 rounded-lg bg-gray-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Stock Status</span>
                <span className="font-medium text-green-600">{product.stock} units available</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-gray-600">Returns</span>
                <span className="font-medium text-green-600">30-day return support</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-gray-600">Secure Checkout</span>
                <span className="font-medium text-green-600">SSL protected</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t pt-8">
          <h3 className="mb-6 text-2xl font-bold text-gray-900">More 3D Products</h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {Object.entries(SAMPLE_3D_PRODUCTS).map(([id, sample]) => (
              <Link
                key={id}
                to={`/product/3d-demo/${id}`}
                className="group rounded-lg border border-gray-200 p-4 transition hover:shadow-lg"
              >
                <div className="mb-4 overflow-hidden rounded-lg bg-gray-100">
                  <OptimizedImage src={sample.image} alt={sample.name} widthHint={720} heightHint={320} className="h-40 w-full object-cover" />
                </div>
                <h4 className="font-semibold text-gray-900 group-hover:text-blue-600">{sample.name}</h4>
                <p className="mt-1 line-clamp-2 text-sm text-gray-600">{sample.description}</p>
                <p className="mt-2 text-lg font-bold text-blue-600">{formatPrice(sample.price)}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-12">
          <DemoPageLinks
            eyebrow="Next Step"
            title="Keep Moving Through The Immersive Product Journey"
            description="After exploring the 3D view, continue into AR, room planning, or the broader storefront without losing momentum."
            links={relatedPages}
          />
        </div>
      </div>
    </div>
  );
};

export default Product3DDemoPage;
