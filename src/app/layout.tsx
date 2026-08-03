import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import Script from 'next/script';
import '../index.css';
import { AppProviders } from '../components/AppProviders';
import { AppChrome } from '../components/AppChrome';
import MarketingAnalytics from '../features/shared/analytics/MarketingAnalytics';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '600', '700'],
  fallback: ['system-ui', 'sans-serif'],
});

const poppins = Poppins({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins',
  weight: ['600', '700'],
  preload: false,
  fallback: ['Arial', 'sans-serif'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#1f2937',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://lofimart.vercel.app'),
  title: {
    default: 'LofiMart | Smart Shopping for Bangladesh',
    template: '%s | LofiMart',
  },
  description: 'Shop fashion, electronics, groceries, and lifestyle essentials with fast delivery, trusted sellers, AI discovery, and a smoother checkout experience.',
  applicationName: 'LofiMart',
  manifest: '/manifest.json',
  keywords: [
    'Bangladesh ecommerce',
    'online shopping BD',
    'fashion in Bangladesh',
    'electronics online',
    'trusted delivery',
    'AI shopping assistant',
  ],
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'LofiMart | Smart Shopping for Bangladesh',
    description: 'Discover trusted products, fast delivery, AI-powered recommendations, and a polished buying experience built for Bangladesh.',
    siteName: 'LofiMart',
    type: 'website',
    url: '/',
  },
  alternates: {
    canonical: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LofiMart | Smart Shopping for Bangladesh',
    description: 'Trusted sellers, curated collections, smooth checkout, and AI-powered shopping tools.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LofiMart',
  },
};

function getPreconnectOrigins() {
  const origins = new Set<string>();

  if (process.env.CLOUDINARY_CLOUD_NAME) {
    origins.add(`https://res.cloudinary.com`);
    origins.add(`https://api.cloudinary.com`);
    origins.add(`https://widget.cloudinary.com`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      origins.add(new URL(supabaseUrl).origin);
    } catch {
      // Ignore invalid local env during render; runtime validation handles production cases.
    }
  }

  return Array.from(origins);
}

function getStructuredData() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lofimart.vercel.app';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'LofiMart',
        url: siteUrl,
        logo: `${siteUrl}/icon.svg`,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: 'support@lofimart.com',
          areaServed: 'BD',
          availableLanguage: ['en', 'bn'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: 'LofiMart',
        url: siteUrl,
        publisher: {
          '@id': `${siteUrl}/#organization`,
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${siteUrl}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const preconnectOrigins = getPreconnectOrigins();
  const structuredData = getStructuredData();

  return (
    <html lang="en-BD" data-scroll-behavior="smooth" className={cn(inter.variable, poppins.variable, "font-sans")}>
      <head>
        <Script
          id="lofimart-structured-data"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {preconnectOrigins.map((origin) => (
          <link key={`${origin}-preconnect`} rel="preconnect" href={origin} crossOrigin="" />
        ))}
        {preconnectOrigins.map((origin) => (
          <link key={`${origin}-dns-prefetch`} rel="dns-prefetch" href={origin} />
        ))}
        {process.env.NODE_ENV === 'development' ? (
          <Script id="dev-clear-sw-cache" strategy="beforeInteractive">
            {`
              (function () {
                try {
                  var isLocalhost =
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';

                  if (!isLocalhost || !('serviceWorker' in navigator)) return;

                  navigator.serviceWorker.getRegistrations().then(function (registrations) {
                    return Promise.all(registrations.map(function (registration) {
                      return registration.unregister();
                    }));
                  }).catch(function () {});

                  if ('caches' in window) {
                    window.caches.keys().then(function (keys) {
                      return Promise.all(keys.map(function (key) {
                        return window.caches.delete(key);
                      }));
                    }).catch(function () {});
                  }
                } catch (error) {
                  // Development-only best effort cleanup.
                }
              })();
            `}
          </Script>
        ) : null}
      </head>
      <body>
        <ErrorBoundary>
          <MarketingAnalytics />
          <AppProviders>
            <AppChrome>{children}</AppChrome>
          </AppProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}
