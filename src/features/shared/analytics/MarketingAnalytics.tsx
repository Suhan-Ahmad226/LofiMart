'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();

function isEnabled(value: string | undefined) {
  return Boolean(value && !value.toLowerCase().includes('replace') && !value.toLowerCase().includes('your-'));
}

export default function MarketingAnalytics() {
  const pathname = usePathname();
  const hasGoogleAnalytics = isEnabled(GA_MEASUREMENT_ID);
  const hasMetaPixel = isEnabled(META_PIXEL_ID);

  useEffect(() => {
    if (!pathname) return;

    const url = `${window.location.origin}${pathname}`;

    if (hasGoogleAnalytics && window.gtag) {
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: pathname,
        page_location: url,
      });
    }

    if (hasMetaPixel && window.fbq) {
      window.fbq('track', 'PageView');
    }
  }, [hasGoogleAnalytics, hasMetaPixel, pathname]);

  if (!hasGoogleAnalytics && !hasMetaPixel) {
    return null;
  }

  return (
    <>
      {hasGoogleAnalytics ? (
        <>
          <Script
            id="google-analytics-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
            `}
          </Script>
        </>
      ) : null}

      {hasMetaPixel ? (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
          `}
        </Script>
      ) : null}
    </>
  );
}
