import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Heart, Loader2, Palette, Share2, ShoppingBag, Sparkles, Wand2 } from 'lucide-react';
import { useNavigate } from '../../../lib/navigation';
import { useAIStylist, type OutfitRecommendation, type StyleProfile } from '@/features/ai/hooks/useAIStylist';
import NotificationContainer, { useNotification } from '@/features/shared/animations/NotificationContainer';
import { ProductCard } from '@/features/shop/components/ProductCard';
import type { Product } from '../../../types';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { copyText } from '../../../lib/browser-actions';

interface AIStylistProps {
  onAddToCart?: (item: OutfitRecommendation) => void;
}

const styleOptions = {
  styles: ['Casual', 'Formal', 'Sporty', 'Bohemian', 'Minimalist', 'Vintage'],
  occasions: ['casual', 'formal', 'evening', 'sporty'],
  colors: ['Neutral', 'Warm', 'Cool', 'Vibrant'],
  bodyTypes: ['Apple', 'Pear', 'Hourglass', 'Rectangle', 'Inverted Triangle'],
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(value);

export const AIStylist: React.FC<AIStylistProps> = ({ onAddToCart }) => {
  const navigate = useNavigate();
  const { styleProfile, recommendations, isLoading, error, setStyleProfile, generateRecommendations } =
    useAIStylist();
  const [step, setStep] = useState<'profile' | 'recommendations'>(styleProfile ? 'recommendations' : 'profile');
  const [tempProfile, setTempProfile] = useState<StyleProfile>({
    preferences: [],
    colorPreferences: [],
    occasions: [],
    budget: 500,
    bodyType: '',
    style: '',
  });
  const [savedItems, setSavedItems] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const { notifications, removeNotification, success, info } = useNotification();

  useEffect(() => {
    fetch('/api/products')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]));
  }, []);

  const handleCreateProfile = () => {
    if (!tempProfile.style || !tempProfile.bodyType) {
      setValidationError('Please select both a style direction and a body type.');
      return;
    }
    if (tempProfile.occasions.length === 0) {
      setValidationError('Please select at least one occasion to guide the recommendations.');
      return;
    }

    setValidationError(null);
    setStyleProfile({
      ...tempProfile,
      preferences: [tempProfile.style],
      colorPreferences: tempProfile.colorPreferences.length > 0 ? tempProfile.colorPreferences : ['Neutral'],
    });
    setStep('recommendations');
  };

  const handleGetRecommendations = async () => {
    await generateRecommendations();
  };

  const toggleSave = (id: string) => {
    setSavedItems((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleAddRecommendation = (outfit: OutfitRecommendation) => {
    if (onAddToCart) {
      onAddToCart(outfit);
      success(`${outfit.name} added to the connected shopping flow.`, 3000);
      return;
    }

    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('amarshop_saved_outfits');
      const savedSelections = saved ? JSON.parse(saved) : [];
      savedSelections.push({
        id: outfit.id,
        name: outfit.name,
        price: outfit.price,
        occasion: outfit.occasion,
        items: outfit.items,
      });
      window.localStorage.setItem('amarshop_saved_outfits', JSON.stringify(savedSelections));
    }

    success(`${outfit.name} saved to your style picks.`, 3200);
  };

  const handleShareRecommendation = async (outfit: OutfitRecommendation) => {
    const summary = `${outfit.name} - ${outfit.items.join(', ')} for ${outfit.occasion}.`;
    if (navigator.share) {
      await navigator.share({
        title: outfit.name,
        text: summary,
        url: window.location.href,
      });
      return;
    }

    const copied = await copyText(summary);
    if (!copied) {
      info('Could not copy the recommendation summary on this device.', 3000);
      return;
    }

    info('Recommendation summary copied to clipboard.', 3000);
  };

  const handleShopRecommendation = (outfit: OutfitRecommendation) => {
    navigate(`/shop?q=${encodeURIComponent(outfit.shopQuery)}`);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const recommendationMatches = useMemo(
    () =>
      recommendations.reduce<Record<string, Product[]>>((acc, outfit) => {
        const queryParts = outfit.shopQuery.toLowerCase().split(' ').filter(Boolean);
        acc[outfit.id] = products
          .filter((product) => {
            const haystack = `${product.name} ${product.category} ${product.description}`.toLowerCase();
            return queryParts.some((part) => haystack.includes(part));
          })
          .slice(0, 3);
        return acc;
      }, {}),
    [products, recommendations],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 py-8">
      <NotificationContainer notifications={notifications} onClose={removeNotification} />
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-8 rounded-[2rem] border border-black/5 bg-white/85 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
                <Sparkles className="h-4 w-4" />
                Personalized outfit guidance
              </div>
              <h1 className="mt-4 text-4xl font-bold text-gray-900">AI Style Assistant</h1>
              <p className="mt-3 text-sm leading-7 text-gray-600">
                Build a style profile, describe your preferences, and generate curated outfit suggestions that feel closer to a guided shopping session.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Shopper Benefit</p>
                <p className="mt-2 text-sm leading-6 text-gray-700">Shortens the path from browsing to finding something that feels like the right look.</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Commercial Benefit</p>
                <p className="mt-2 text-sm leading-6 text-gray-700">Supports discovery across full outfits instead of relying on a single product click.</p>
              </div>
            </div>
          </div>
        </div>

        {step === 'profile' && (
          <motion.div
            className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-8 flex items-start gap-4">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Wand2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Create your style profile</h2>
                <p className="mt-2 text-sm leading-7 text-gray-600">
                  Pick the style direction, body type, color leaning, and use cases that best match what you want to shop for today.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-3 block text-lg font-medium text-gray-700">Your style direction</label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {styleOptions.styles.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setTempProfile({ ...tempProfile, style })}
                    className={`rounded-xl p-3 font-medium transition-all ${
                      tempProfile.style === style ? 'scale-[1.02] bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-3 block text-lg font-medium text-gray-700">Body type</label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {styleOptions.bodyTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTempProfile({ ...tempProfile, bodyType: type })}
                    className={`rounded-xl p-3 font-medium transition-all ${
                      tempProfile.bodyType === type ? 'scale-[1.02] bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-3 flex items-center gap-2 text-lg font-medium text-gray-700">
                <Palette className="h-5 w-5 text-indigo-500" />
                Color preference
              </label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {styleOptions.colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setTempProfile({ ...tempProfile, colorPreferences: [color] })}
                    className={`rounded-xl p-3 font-medium transition-all ${
                      tempProfile.colorPreferences.includes(color)
                        ? 'scale-[1.02] bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-3 block text-lg font-medium text-gray-700">Shopping occasions</label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {styleOptions.occasions.map((occasion) => (
                  <button
                    key={occasion}
                    type="button"
                    onClick={() =>
                      setTempProfile({
                        ...tempProfile,
                        occasions: tempProfile.occasions.includes(occasion)
                          ? tempProfile.occasions.filter((item) => item !== occasion)
                          : [...tempProfile.occasions, occasion],
                      })
                    }
                    className={`rounded-xl p-3 font-medium capitalize transition-all ${
                      tempProfile.occasions.includes(occasion)
                        ? 'scale-[1.02] bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {occasion}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8 rounded-2xl bg-gray-50 p-5">
              <label className="mb-3 block text-lg font-medium text-gray-700">
                Budget range: <span className="text-primary">{formatCurrency(tempProfile.budget * 100)}</span>
              </label>
              <input
                type="range"
                min="100"
                max="2000"
                step="50"
                value={tempProfile.budget}
                onChange={(e) => setTempProfile({ ...tempProfile, budget: Number(e.target.value) })}
                className="w-full"
              />
              <div className="mt-2 flex justify-between text-sm text-gray-500">
                <span>{formatCurrency(10000)}</span>
                <span>{formatCurrency(200000)}</span>
              </div>
            </div>

            {validationError ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {validationError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleCreateProfile}
              className="w-full rounded-xl bg-purple-600 py-3 font-semibold text-white transition-colors hover:bg-purple-700"
            >
              Create profile and continue
            </button>
          </motion.div>
        )}

        {step === 'recommendations' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="rounded-[2rem] bg-white p-6 shadow">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="mb-2 text-2xl font-semibold text-gray-900">
                    {styleProfile?.style} picks for {styleProfile?.bodyType}
                  </h2>
                  <p className="text-gray-600">
                    Focused on {styleProfile?.occasions.join(', ')} with a target budget of {formatCurrency((styleProfile?.budget ?? 0) * 100)}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('profile')}
                  className="rounded-xl bg-gray-200 px-4 py-2 font-medium transition-colors hover:bg-gray-300"
                >
                  Edit Profile
                </button>
              </div>

              {!recommendations.length ? (
                <button
                  type="button"
                  onClick={handleGetRecommendations}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white transition-colors disabled:bg-gray-400 hover:bg-purple-700"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  {isLoading ? 'Generating recommendations...' : 'Generate AI recommendations'}
                </button>
              ) : null}
            </div>

            {error ? <div className="rounded-lg border border-red-400 bg-red-100 px-6 py-4 text-red-700">{error}</div> : null}

            {recommendations.length > 0 ? (
              <motion.div
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {recommendations.map((outfit) => (
                  <motion.div
                    key={outfit.id}
                    variants={itemVariants}
                    className="overflow-hidden rounded-[2rem] bg-white shadow-lg transition-shadow hover:shadow-xl"
                  >
                    <div className="group relative h-64 overflow-hidden bg-gray-200">
                      <OptimizedImage src={outfit.image} alt={outfit.name} widthHint={720} heightHint={720} className="h-full w-full object-cover transition-transform group-hover:scale-110" />
                      <div className="absolute right-3 top-3 rounded-full bg-purple-600 px-3 py-1 text-sm font-semibold text-white">
                        {Math.round(outfit.matchScore * 100)}% Match
                      </div>
                    </div>

                    <div className="p-5">
                      <h3 className="text-lg font-semibold text-gray-900">{outfit.name}</h3>

                      <div className="mt-3">
                        <p className="mb-1 text-sm font-medium text-gray-600">Included pieces</p>
                        <div className="flex flex-wrap gap-2">
                          {outfit.items.map((item) => (
                            <span key={item} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="mb-1 text-sm font-medium text-gray-600">Color direction</p>
                        <div className="flex gap-2">
                          {outfit.colors.map((color) => (
                            <div key={color} className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
                              {color}
                            </div>
                          ))}
                        </div>
                      </div>

                      <p className="mt-4 text-sm italic text-gray-600">{outfit.reason}</p>

                      <div className="mt-4">
                        <p className="text-2xl font-bold text-purple-600">{formatCurrency(outfit.price * 100)}</p>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSave(outfit.id)}
                          className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 transition-colors ${
                            savedItems.includes(outfit.id) ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Heart className="h-4 w-4" fill={savedItems.includes(outfit.id) ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddRecommendation(outfit)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-purple-600 py-2 text-white transition-colors hover:bg-purple-700"
                        >
                          <ShoppingBag className="h-4 w-4" />
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareRecommendation(outfit)}
                          className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
                        >
                          <Share2 className="mx-auto h-4 w-4" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleShopRecommendation(outfit)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-semibold text-purple-700 transition-colors hover:bg-purple-100"
                      >
                        Shop similar products
                        <ArrowRight className="h-4 w-4" />
                      </button>

                      {recommendationMatches[outfit.id]?.length ? (
                        <div className="mt-4 space-y-3">
                          <p className="text-sm font-semibold text-gray-900">Matching products to explore</p>
                          <div className="grid gap-3">
                            {recommendationMatches[outfit.id].map((product) => (
                              <div key={product.id} className="overflow-hidden rounded-2xl border border-black/5 bg-white">
                                <ProductCard product={product} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : null}

            {recommendations.length > 0 ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleGetRecommendations}
                  disabled={isLoading}
                  className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition-colors disabled:bg-gray-400 hover:bg-purple-700"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  Refresh recommendations
                </button>
              </div>
            ) : null}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AIStylist;
