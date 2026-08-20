import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Download, RotateCcw, Share2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from '../../../lib/navigation';
import ARTryOn from '@/features/shared/immersive/components/ar/ARTryOn';
import DemoPageLinks from '@/features/shared/components/DemoPageLinks';
import NotificationContainer, { useNotification } from '@/features/shared/animations/NotificationContainer';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';
import { copyText } from '../../../lib/browser-actions';

type ARTryOnLocationState = {
  productName?: string;
  productType?: 'accessories' | 'clothing' | 'shoes';
  returnTo?: string;
};

const productTypeCopy = {
  accessories: {
    title: 'Accessory preview',
    description: 'Use the camera to test how accessories feel against your face and overall styling.',
  },
  clothing: {
    title: 'Apparel preview',
    description: 'Check how the item feels in frame before moving back into product selection or checkout.',
  },
  shoes: {
    title: 'Footwear preview',
    description: 'Use AR as a quick confidence step before deciding on size, styling, or similar products.',
  },
};

export const ARTryOnPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { notifications, removeNotification, success, error, info } = useNotification();
  const state = (location.state as ARTryOnLocationState | null) ?? null;
  const productName = state?.productName || 'Featured Item';
  const productType = state?.productType || 'clothing';
  const returnTo = state?.returnTo || '/shop';
  const [isSessionOpen, setIsSessionOpen] = useState(true);
  const [captures, setCaptures] = useState<string[]>([]);
  const storageKey = useMemo(() => `amarshop-ar-captures:${productName}:${productType}`, [productName, productType]);

  const relatedPages = [
    {
      href: '/product/shoe_nike',
      title: 'Sample Product Detail',
      description: 'Return to a product page and compare AR as part of a normal shopping journey.',
    },
    {
      href: '/product/3d-demo/shoe_nike',
      title: '3D Product Viewer',
      description: 'Move from live try-on into a richer 3D product inspection flow.',
    },
    {
      href: '/room-visualizer',
      title: 'Room Visualizer',
      description: 'Continue into another immersive experience built around placement and context.',
    },
    {
      href: '/explore',
      title: 'Explore Hub',
      description: 'Use the immersive page index to compare motion, AR, and product storytelling routes.',
    },
  ];

  const productContext = useMemo(() => productTypeCopy[productType] ?? productTypeCopy.clothing, [productType]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setCaptures(parsed.slice(0, 4));
      }
    } catch {
      setCaptures([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(captures.slice(0, 4)));
    } catch {
      // Ignore storage failures and keep session-only state.
    }
  }, [captures, storageKey]);

  const handleBack = () => {
    navigate(returnTo);
  };

  const handleCapture = (imageUrl: string) => {
    setCaptures((current) => [imageUrl, ...current.filter((item) => item !== imageUrl)].slice(0, 4));
    success('AR snapshot added to your recent captures.', 2500);
  };

  const handleDownloadCapture = (capture: string, index: number) => {
    const link = document.createElement('a');
    link.href = capture;
    link.download = `${productName}-ar-capture-${index + 1}.png`;
    link.click();
    info('Capture download started.', 2200);
  };

  const handleDeleteCapture = (capture: string) => {
    setCaptures((current) => current.filter((item) => item !== capture));
    info('Capture removed from recent previews.', 2200);
  };

  const handleShareCapture = async (capture: string, index: number) => {
    try {
      if (navigator.share) {
        const response = await fetch(capture);
        const blob = await response.blob();
        const file = new File([blob], `${productName}-ar-capture-${index + 1}.png`, { type: 'image/png' });
        await navigator.share({
          title: `${productName} AR preview`,
          text: 'Sharing an AR try-on capture from LofiMart.',
          files: [file],
        });
        success('Capture shared successfully.', 2200);
        return;
      }

      const copied = await copyText(capture);
      if (!copied) {
        error('Could not copy this capture on the current device.', 2600);
        return;
      }

      info('Capture image data copied to the clipboard fallback.', 2400);
    } catch {
      error('Unable to share this capture right now.', 2600);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_20%),radial-gradient(circle_at_85%_15%,rgba(59,130,246,0.14),transparent_20%),linear-gradient(180deg,#020617_0%,#0f172a_48%,#111827_100%)] text-white">
      <NotificationContainer notifications={notifications} onClose={removeNotification} />
      {isSessionOpen ? (
        <ARTryOn
          productName={productName}
          productType={productType}
          onClose={() => setIsSessionOpen(false)}
          onCapture={handleCapture}
        />
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/85 transition-colors hover:text-emerald-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to shopping
          </button>
          <div className="text-xs uppercase tracking-[0.24em] text-white/50">AR Try-On Experience</div>
        </div>

        <section className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                <Sparkles className="h-4 w-4" />
                Live camera-based product preview
              </div>
              <h1 className="mt-5 text-4xl font-bold md:text-5xl">{productName}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 md:text-base">
                {productContext.description} This page is designed as a bridge between product discovery and higher purchase confidence.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => setIsSessionOpen(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  <Camera className="h-4 w-4" />
                  {isSessionOpen ? 'AR session is active' : 'Launch AR camera'}
                </button>
                <Link
                  to={returnTo}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-white/25 hover:bg-white/5"
                >
                  Return to product flow
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-300" />
                  <p className="font-semibold">{productContext.title}</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-white/70">
                  AR should help users make better decisions, not distract them. Keep the flow focused on fit, context, and confidence.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-sky-300" />
                  <p className="font-semibold">Best results</p>
                </div>
                <ul className="mt-3 space-y-2 text-sm leading-7 text-white/70">
                  <li>Use front lighting for cleaner camera tracking.</li>
                  <li>Stay still for a moment before capturing a snapshot.</li>
                  <li>Close the AR overlay anytime to continue through the rest of the shopping journey.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {captures.length > 0 ? (
          <section className="mb-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <RotateCcw className="h-5 w-5 text-amber-300" />
                <h2 className="text-xl font-bold">Recent capture previews</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCaptures([]);
                  info('Recent AR captures cleared.', 2200);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/5"
              >
                <Trash2 className="h-4 w-4" />
                Clear all
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {captures.map((capture, index) => (
                <div key={`${capture}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <OptimizedImage src={capture} alt={`${productName} AR capture ${index + 1}`} widthHint={640} heightHint={640} className="h-64 w-full object-cover" />
                  <div className="space-y-3 p-4">
                    <p className="text-sm font-semibold text-white">Capture {index + 1}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadCapture(capture, index)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleShareCapture(capture, index)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15"
                      >
                        <Share2 className="h-4 w-4" />
                        Share
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCapture(capture)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/5"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <DemoPageLinks
          eyebrow="Immersive Flow"
          title="Continue From AR Into More Visual Experiences"
          description="AR works best as part of a larger shopping journey. These nearby routes help users move into 3D product viewing, room planning, and full-site exploration."
          links={relatedPages}
        />
      </div>
    </div>
  );
};

export default ARTryOnPage;
