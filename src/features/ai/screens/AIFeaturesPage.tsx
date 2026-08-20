import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Mic,
  Ruler,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';
import { Link, useNavigate } from '../../../lib/navigation';
import AIStylist from '@/features/ai/components/AIStylist';
import SizePredictor from '@/features/ai/components/SizePredictor';
import VoiceSearch from '@/features/ai/components/VoiceSearch';
import VoiceCommerce from '@/features/ai/components/VoiceCommerce';
import DemoPageLinks from '@/features/shared/components/DemoPageLinks';

type FeatureTab = 'overview' | 'stylist' | 'size' | 'voice-search' | 'voice-commerce';

type FeatureConfig = {
  id: Exclude<FeatureTab, 'overview'>;
  icon: typeof Sparkles;
  eyebrow: string;
  title: string;
  description: string;
  shopperBenefit: string;
  sellerBenefit: string;
  accent: string;
  panelClass: string;
};

const features: FeatureConfig[] = [
  {
    id: 'stylist',
    icon: Sparkles,
    eyebrow: 'Personalization',
    title: 'AI Style Assistant',
    description: 'Turn broad preferences into outfit suggestions that feel curated, relevant, and easier to shop.',
    shopperBenefit: 'Cuts decision fatigue and helps shoppers discover complete looks faster.',
    sellerBenefit: 'Improves discovery for more products instead of relying on one-item browsing.',
    accent: 'from-amber-400 via-orange-400 to-rose-500',
    panelClass: 'border-amber-200/60 bg-[linear-gradient(135deg,#fff8ef_0%,#fff2e2_55%,#fffdf8_100%)]',
  },
  {
    id: 'size',
    icon: Ruler,
    eyebrow: 'Fit Confidence',
    title: 'Size Predictor',
    description: 'Guide customers toward more confident size choices before checkout with guided measurement inputs.',
    shopperBenefit: 'Reduces guesswork before buying apparel and footwear online.',
    sellerBenefit: 'Supports lower return risk and stronger trust for fashion categories.',
    accent: 'from-sky-400 via-cyan-400 to-blue-500',
    panelClass: 'border-sky-200/60 bg-[linear-gradient(135deg,#effbff_0%,#e7f6ff_55%,#f9fdff_100%)]',
  },
  {
    id: 'voice-search',
    icon: Mic,
    eyebrow: 'Faster Discovery',
    title: 'Voice Search',
    description: 'Let shoppers describe what they want naturally and move them directly into the search experience.',
    shopperBenefit: 'Great for mobile and hands-busy shopping moments.',
    sellerBenefit: 'Creates faster intent capture for high-conversion search traffic.',
    accent: 'from-emerald-400 via-green-400 to-teal-500',
    panelClass: 'border-emerald-200/60 bg-[linear-gradient(135deg,#effef7_0%,#ebfff6_55%,#f7fffb_100%)]',
  },
  {
    id: 'voice-commerce',
    icon: ShoppingBag,
    eyebrow: 'Hands-Free Flow',
    title: 'Voice Commerce',
    description: 'Experiment with conversational shopping actions like navigating, filtering, and checking out.',
    shopperBenefit: 'Makes browsing and command-based shopping feel faster and more accessible.',
    sellerBenefit: 'Opens a path for assisted shopping journeys and accessibility-focused growth.',
    accent: 'from-fuchsia-400 via-violet-400 to-indigo-500',
    panelClass: 'border-fuchsia-200/60 bg-[linear-gradient(135deg,#fbf4ff_0%,#f7efff_55%,#fffaff_100%)]',
  },
];

const relatedPages = [
  {
    href: '/ar-tryon',
    title: 'AR Try-On',
    description: 'Preview products in augmented reality and connect AI guidance with visual confidence.',
  },
  {
    href: '/room-visualizer',
    title: 'Room Visualizer',
    description: 'Help shoppers place products in context before purchase decisions are made.',
  },
  {
    href: '/product-3d',
    title: '3D Product Hub',
    description: 'Combine product storytelling, interaction, and AI-guided discovery in one journey.',
  },
  {
    href: '/animations',
    title: 'Motion Library',
    description: 'Explore motion patterns that pair well with modern AI commerce experiences.',
  },
];

const trustSignals = [
  {
    icon: ShieldCheck,
    title: 'Trust-Friendly Design',
    description: 'AI experiences are presented as helpers, not gimmicks, so the storefront still feels dependable.',
  },
  {
    icon: Zap,
    title: 'Faster Decisions',
    description: 'Each workflow focuses on reducing friction in product discovery, fit selection, and checkout intent.',
  },
  {
    icon: Wand2,
    title: 'Modular Rollout',
    description: 'Each feature can be promoted individually across campaigns, merchandising, and seller education.',
  },
];

const adoptionSteps = [
  'Help shoppers find the right product faster.',
  'Improve confidence before checkout with fit and styling guidance.',
  'Connect AI tools to existing search, cart, and immersive product journeys.',
];

export const AIFeaturesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FeatureTab>('overview');
  const navigate = useNavigate();
  const activeFeature = features.find((feature) => feature.id === activeTab);

  const handleVoiceSearch = (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.12),transparent_18%),radial-gradient(circle_at_80%_18%,rgba(34,197,94,0.12),transparent_18%),linear-gradient(180deg,#fffdf8_0%,#f8fafc_50%,#ffffff_100%)] text-gray-950">
      {activeTab === 'overview' ? (
        <div className="pb-20">
          <section className="relative overflow-hidden">
            <div className="absolute inset-0 opacity-80">
              <div className="absolute left-[-6rem] top-20 h-56 w-56 rounded-full bg-amber-200/60 blur-3xl" />
              <div className="absolute right-[-5rem] top-16 h-64 w-64 rounded-full bg-emerald-200/50 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-sky-200/40 blur-3xl" />
            </div>

            <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 md:pt-24">
              <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-8">
                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm backdrop-blur"
                  >
                    <Sparkles className="h-4 w-4" />
                    AI shopping experiences built for trust and conversion
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 26 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.05 }}
                    className="space-y-6"
                  >
                    <h1 className="max-w-4xl text-5xl font-bold leading-[1.05] md:text-7xl">
                      Smarter product discovery,
                      <span className="block bg-gradient-to-r from-amber-500 via-rose-500 to-sky-500 bg-clip-text text-transparent">
                        smoother shopping journeys.
                      </span>
                    </h1>
                    <p className="max-w-2xl text-lg leading-8 text-gray-600 md:text-xl">
                      Use AI to guide styling, improve fit confidence, support voice-led discovery, and move shoppers into action with less friction.
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.12 }}
                    className="flex flex-wrap gap-4"
                  >
                    <Link
                      to="/shop"
                      className="inline-flex items-center gap-2 rounded-2xl bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                    >
                      Browse Products
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => setActiveTab('stylist')}
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:border-primary hover:text-primary"
                    >
                      Explore AI Tools
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.18 }}
                    className="grid gap-4 sm:grid-cols-3"
                  >
                    {[
                      { value: '4', label: 'AI workflows ready to explore' },
                      { value: 'Lower', label: 'Fit confusion and browsing friction' },
                      { value: 'Faster', label: 'Search-to-product intent capture' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
                        <p className="text-2xl font-bold text-gray-950">{item.value}</p>
                        <p className="mt-1 text-sm leading-6 text-gray-500">{item.label}</p>
                      </div>
                    ))}
                  </motion.div>
                </div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.08 }}
                  className="rounded-[2rem] border border-black/5 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur"
                >
                  <div className="rounded-[1.6rem] bg-[linear-gradient(145deg,#111827_0%,#1f2937_55%,#0f766e_100%)] p-6 text-white">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/60">AI Commerce Hub</p>
                      <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                        Production Ready Direction
                      </div>
                    </div>

                    <div className="mt-8 grid gap-4">
                      {features.map((feature, index) => {
                        const Icon = feature.icon;
                        return (
                          <button
                            key={feature.id}
                            onClick={() => setActiveTab(feature.id)}
                            className="group rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition-all hover:border-white/20 hover:bg-white/10"
                          >
                            <div className="flex items-start gap-4">
                              <div className={`rounded-2xl bg-gradient-to-br ${feature.accent} p-3 text-white shadow-lg`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">{feature.eyebrow}</p>
                                    <h3 className="mt-2 text-lg font-semibold">{feature.title}</h3>
                                  </div>
                                  <span className="text-sm text-white/50">0{index + 1}</span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-white/70">{feature.description}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-10">
            <div className="grid gap-6 lg:grid-cols-3">
              {trustSignals.map((signal, index) => {
                const Icon = signal.icon;
                return (
                  <motion.div
                    key={signal.title}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.45, delay: index * 0.08 }}
                    className="rounded-[2rem] border border-black/5 bg-white p-7 shadow-sm"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h2 className="mt-5 text-xl font-bold">{signal.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-gray-600">{signal.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Feature Modules</p>
                <h2 className="mt-3 text-3xl font-bold md:text-4xl">Pick the AI workflow that removes the most friction.</h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-gray-600">
                Each module is designed around a concrete commerce problem: finding better products, improving fit confidence, or reducing the steps between intent and checkout.
              </p>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.button
                    key={feature.id}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.45, delay: index * 0.08 }}
                    onClick={() => setActiveTab(feature.id)}
                    className={`group overflow-hidden rounded-[2rem] border p-7 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl ${feature.panelClass}`}
                  >
                    <div className="flex items-start justify-between gap-5">
                      <div className={`rounded-3xl bg-gradient-to-br ${feature.accent} p-4 text-white shadow-lg`}>
                        <Icon className="h-7 w-7" />
                      </div>
                      <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        {feature.eyebrow}
                      </span>
                    </div>

                    <h3 className="mt-6 text-2xl font-bold">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-gray-600">{feature.description}</p>

                    <div className="mt-6 space-y-3">
                      <div className="rounded-2xl bg-white/75 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">For Shoppers</p>
                        <p className="mt-2 text-sm leading-6 text-gray-700">{feature.shopperBenefit}</p>
                      </div>
                      <div className="rounded-2xl bg-white/75 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">For Sellers</p>
                        <p className="mt-2 text-sm leading-6 text-gray-700">{feature.sellerBenefit}</p>
                      </div>
                    </div>

                    <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-900 transition-transform group-hover:translate-x-1">
                      Open experience
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-10">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[2rem] bg-[linear-gradient(135deg,#111827_0%,#172554_42%,#0f766e_100%)] p-8 text-white shadow-xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/50">Why this matters</p>
                <h2 className="mt-3 text-3xl font-bold">AI works best when it quietly improves decisions.</h2>
                <div className="mt-8 space-y-4">
                  {adoptionSteps.map((step) => (
                    <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-300" />
                      <p className="text-sm leading-7 text-white/80">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-black/5 bg-white p-8 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">Connected Experiences</p>
                <h2 className="mt-3 text-3xl font-bold">Extend AI into richer product storytelling.</h2>
                <p className="mt-4 text-sm leading-7 text-gray-600">
                  The strongest AI journeys do not stop at a recommendation. They continue into immersive product views, room context, and motion-rich decision support.
                </p>

                <div className="mt-8">
                  <DemoPageLinks
                    eyebrow="Next Steps"
                    title="Continue into immersive journeys"
                    description="Move from AI-assisted discovery into AR, 3D, and richer product experiences without breaking flow."
                    links={relatedPages}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="pb-16 pt-8">
          <div className="mx-auto max-w-7xl px-4">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <button
                onClick={() => setActiveTab('overview')}
                className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:border-primary hover:text-primary"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
                Back to AI Overview
              </button>

              <div className="flex flex-wrap gap-2">
                {features.map((feature) => (
                  <button
                    key={feature.id}
                    onClick={() => setActiveTab(feature.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      activeTab === feature.id
                        ? 'bg-gray-950 text-white'
                        : 'bg-white text-gray-600 shadow-sm hover:text-gray-900'
                    }`}
                  >
                    {feature.title}
                  </button>
                ))}
              </div>
            </div>

            {activeFeature && (
              <div className={`mb-8 rounded-[2rem] border p-7 shadow-sm ${activeFeature.panelClass}`}>
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">{activeFeature.eyebrow}</p>
                    <h1 className="mt-3 text-4xl font-bold">{activeFeature.title}</h1>
                    <p className="mt-4 text-sm leading-7 text-gray-700">{activeFeature.description}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:max-w-2xl">
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Shopper Impact</p>
                      <p className="mt-2 text-sm leading-6 text-gray-700">{activeFeature.shopperBenefit}</p>
                    </div>
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Commercial Impact</p>
                      <p className="mt-2 text-sm leading-6 text-gray-700">{activeFeature.sellerBenefit}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
            >
              {activeTab === 'stylist' && <AIStylist />}
              {activeTab === 'size' && <SizePredictor />}
              {activeTab === 'voice-search' && (
                <div className="mx-auto max-w-3xl rounded-[2rem] border border-black/5 bg-white p-8 shadow-sm">
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold">Search by speaking naturally</h2>
                    <p className="mt-3 text-sm leading-7 text-gray-600">
                      Try phrases like "show me black sneakers under 5000" or "find blue panjabi for Eid" and jump directly into storefront search results.
                    </p>
                  </div>
                  <VoiceSearch onSearch={handleVoiceSearch} placeholder="Say what you want to shop for..." />
                </div>
              )}
              {activeTab === 'voice-commerce' && <VoiceCommerce />}
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIFeaturesPage;
