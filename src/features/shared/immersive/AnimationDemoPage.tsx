import React from 'react';
import { motion } from 'framer-motion';
import {
  BellRing,
  CheckCircle2,
  LoaderCircle,
  MousePointerClick,
  MoveUpRight,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import MicroInteraction from '../../../components/animations/MicroInteraction';
import ScrollAnimation from '../../../components/animations/ScrollAnimation';
import LoadingAnimation from '../../../components/animations/LoadingAnimation';
import NotificationContainer, { useNotification } from '../../../components/animations/NotificationContainer';
import DemoPageLinks from '../../../components/DemoPageLinks';

const microInteractionItems = [
  { label: 'Bounce', helper: 'Hover to see attention-grabbing movement.', type: 'bounce' as const, trigger: 'hover' as const, color: 'bg-blue-600' },
  { label: 'Pulse', helper: 'Useful for always-on active states and callouts.', type: 'pulse' as const, trigger: 'hover' as const, color: 'bg-emerald-600' },
  { label: 'Scale', helper: 'Subtle lift for clickable, high-priority actions.', type: 'scale' as const, trigger: 'hover' as const, color: 'bg-violet-600' },
  { label: 'Lift', helper: 'Card-style hover feedback for product surfaces.', type: 'lift' as const, trigger: 'hover' as const, color: 'bg-amber-600' },
  { label: 'Shake', helper: 'Best reserved for invalid or rejected actions.', type: 'shake' as const, trigger: 'click' as const, color: 'bg-rose-600' },
  { label: 'Glow', helper: 'Works for premium focus states and featured actions.', type: 'glow' as const, trigger: 'hover' as const, color: 'bg-indigo-600' },
];

const scrollItems = [
  { title: 'Fade Up', description: 'Brings sections into view with calm upward motion.', animation: 'fadeUp' as const, className: 'from-blue-500 to-cyan-500' },
  { title: 'Fade Left', description: 'Useful for media panels or alternating layouts.', animation: 'fadeLeft' as const, className: 'from-emerald-500 to-teal-500' },
  { title: 'Zoom', description: 'Adds emphasis to featured promotions or key metrics.', animation: 'zoom' as const, className: 'from-violet-500 to-fuchsia-500' },
  { title: 'Rotate', description: 'A stronger reveal pattern for creative highlight blocks.', animation: 'rotate' as const, className: 'from-rose-500 to-orange-500' },
];

const loadingItems = [
  { label: 'Spinner', type: 'spinner' as const, helper: 'General loading and route-level waits.' },
  { label: 'Dots', type: 'dots' as const, helper: 'Compact inline progress indicators.' },
  { label: 'Bars', type: 'bars' as const, helper: 'Good for analytics, media, or live activity.' },
  { label: 'Pulse', type: 'pulse' as const, helper: 'Soft placeholder state for lightweight waiting.' },
];

const relatedPages = [
  {
    href: '/ai-features',
    title: 'AI Features',
    description: 'Pair motion patterns with conversational and recommendation-driven product journeys.',
  },
  {
    href: '/pwa',
    title: 'PWA Experience',
    description: 'Review install prompts, offline behaviors, and mobile-first transitions together.',
  },
  {
    href: '/ar-tryon',
    title: 'AR Try-On',
    description: 'See how feedback and movement support camera-based shopping flows.',
  },
  {
    href: '/explore',
    title: 'Explore All Pages',
    description: 'Return to the broader storefront index and compare motion use across pages.',
  },
];

export const AnimationDemoPage: React.FC = () => {
  const { notifications, removeNotification, success, error, info, warning } = useNotification();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.1),transparent_18%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.1),transparent_18%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_50%,#ffffff_100%)] px-4 py-12">
      <NotificationContainer notifications={notifications} onClose={removeNotification} />

      <div className="mx-auto max-w-6xl">
        <section className="mb-10 overflow-hidden rounded-[2rem] border border-black/5 bg-white/90 p-8 shadow-sm backdrop-blur">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
                <Sparkles className="h-4 w-4" />
                Production motion patterns
              </div>
              <h1 className="mt-5 text-4xl font-bold text-gray-900 md:text-5xl">Motion & Interaction Library</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-600 md:text-base">
                Explore the transition patterns, loading states, notifications, and micro-interactions that make the storefront feel responsive without becoming noisy.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Purpose</p>
                  <p className="mt-2 text-sm leading-6 text-gray-700">Guide attention and reinforce feedback across shopping flows.</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Focus</p>
                  <p className="mt-2 text-sm leading-6 text-gray-700">Use motion where it clarifies action, not just where it looks flashy.</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Outcome</p>
                  <p className="mt-2 text-sm leading-6 text-gray-700">Create a smoother storefront experience that still feels trustworthy.</p>
                </div>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="rounded-[1.75rem] bg-[linear-gradient(145deg,#0f172a_0%,#1e293b_60%,#0f766e_100%)] p-6 text-white shadow-xl"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/50">Motion Principles</p>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <MousePointerClick className="h-5 w-5 text-sky-300" />
                    <p className="font-semibold">Interactive feedback</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/75">Hover, press, and reveal states should make controls feel obvious and alive.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <ScrollText className="h-5 w-5 text-emerald-300" />
                    <p className="font-semibold">Scroll rhythm</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/75">Sections should reveal progressively so large pages feel lighter to explore.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <BellRing className="h-5 w-5 text-amber-300" />
                    <p className="font-semibold">Clear feedback</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/75">Loading and notification states should reassure the user that the system is responding.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mb-8 rounded-[2rem] bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <MousePointerClick className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Micro Interactions</h2>
              <p className="text-sm text-gray-600">Small movements that make actions feel tactile and responsive.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {microInteractionItems.map((item) => (
              <div key={item.label} className="rounded-2xl border border-black/5 bg-gray-50 p-6 text-center">
                <MicroInteraction type={item.type} trigger={item.trigger}>
                  <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl text-sm font-bold text-white ${item.color}`}>
                    {item.label}
                  </div>
                </MicroInteraction>
                <h3 className="text-lg font-semibold text-gray-900">{item.label}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.helper}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-[2rem] bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <MoveUpRight className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Scroll Animations</h2>
              <p className="text-sm text-gray-600">Reveal patterns that give longer pages a calmer sense of progression.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {scrollItems.map((item, index) => (
              <ScrollAnimation key={item.title} animation={item.animation} delay={index}>
                <div className={`rounded-2xl bg-gradient-to-r ${item.className} p-6 text-white shadow-sm`}>
                  <h3 className="text-xl font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/85">{item.description}</p>
                </div>
              </ScrollAnimation>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-[2rem] bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <LoaderCircle className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Loading States</h2>
              <p className="text-sm text-gray-600">Use the right waiting pattern for the right amount of user attention.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start justify-items-center gap-6 md:grid-cols-4">
            {loadingItems.map((item) => (
              <div key={item.label} className="w-full rounded-2xl border border-black/5 bg-gray-50 p-6 text-center">
                <div className="flex h-20 items-center justify-center">
                  <LoadingAnimation type={item.type} size="medium" />
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.helper}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-[2rem] bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center gap-3">
            <BellRing className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Interactive Feedback</h2>
              <p className="text-sm text-gray-600">Test common storefront feedback moments such as confirmation, info, warnings, and errors.</p>
            </div>
          </div>

          <div className="mb-8 rounded-2xl bg-gray-50 p-5">
            <h3 className="text-lg font-semibold text-gray-900">Action Feedback</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              This button simulates a successful product action and confirms that the notification layer is working.
            </p>
            <div className="mt-4">
              <MicroInteraction type="lift" trigger="hover">
                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
                  onClick={() => success('Product added to cart successfully.', 2600)}
                >
                  Simulate Add to Cart
                </button>
              </MicroInteraction>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <button
              type="button"
              onClick={() => success('Success! Operation completed smoothly.', 2800)}
              className="rounded-xl bg-green-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-green-700"
            >
              Success
            </button>
            <button
              type="button"
              onClick={() => error('Error! Please review the request and try again.', 3200)}
              className="rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-red-700"
            >
              Error
            </button>
            <button
              type="button"
              onClick={() => info('Info: This action is still in progress.', 3000)}
              className="rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Info
            </button>
            <button
              type="button"
              onClick={() => warning('Warning: Review the current input before continuing.', 3200)}
              className="rounded-xl bg-yellow-500 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-yellow-600"
            >
              Warning
            </button>
          </div>
        </section>

        <section className="mb-8 rounded-[2rem] border-l-4 border-blue-600 bg-blue-50 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-blue-700" />
            <div>
              <h2 className="text-xl font-bold text-blue-900">Quick Usage Guide</h2>
              <div className="mt-4 grid gap-4 text-sm text-blue-900 md:grid-cols-2">
                <div>
                  <p className="font-semibold">MicroInteraction</p>
                  <p className="mt-1 text-blue-800">Best for buttons, product cards, and high-frequency interactive surfaces.</p>
                </div>
                <div>
                  <p className="font-semibold">ScrollAnimation</p>
                  <p className="mt-1 text-blue-800">Best for hero reveals, feature lists, and staggered content sections.</p>
                </div>
                <div>
                  <p className="font-semibold">LoadingAnimation</p>
                  <p className="mt-1 text-blue-800">Best for async actions, route loading, and inline waiting indicators.</p>
                </div>
                <div>
                  <p className="font-semibold">Notifications</p>
                  <p className="mt-1 text-blue-800">Best for confirmations, warnings, and error feedback after user actions.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <DemoPageLinks
          eyebrow="More To Explore"
          title="Move From Motion Patterns Into Real Product Journeys"
          description="These routes connect motion-rich interfaces to the rest of the shopping experience, so transitions feel purposeful across the site."
          links={relatedPages}
        />
      </div>
    </div>
  );
};

export default AnimationDemoPage;
