'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getBlurPlaceholderImage, getOptimizedCloudinaryImage } from '@/src/lib/cloudinary';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  widthHint?: number;
  heightHint?: number;
  quality?: 'auto' | 'auto:good' | 'auto:best' | 'auto:eco';
  fit?: 'limit' | 'fill' | 'pad' | 'scale';
  eager?: boolean;
  showPlaceholder?: boolean;
};

export function OptimizedImage({
  src,
  widthHint,
  heightHint,
  quality = 'auto:good',
  fit = 'limit',
  eager = false,
  showPlaceholder = true,
  alt,
  referrerPolicy,
  decoding,
  loading,
  fetchPriority,
  className,
  style,
  onLoad,
  onError,
  ...rest
}: Props) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const [isVisible, setIsVisible] = useState(eager);
  const [isLoaded, setIsLoaded] = useState(false);
  const [useRawSrc, setUseRawSrc] = useState(false);
  const [isBroken, setIsBroken] = useState(false);
  const normalizedSrc = typeof src === 'string' ? src.trim() : '';

  const optimizedSrc = useMemo(
    () =>
      getOptimizedCloudinaryImage(normalizedSrc, {
        width: widthHint,
        height: heightHint,
        quality,
        fit,
      }),
    [fit, heightHint, normalizedSrc, quality, widthHint],
  );

  const placeholderSrc = useMemo(
    () => (showPlaceholder ? getBlurPlaceholderImage(normalizedSrc, 48, 48) : ''),
    [normalizedSrc, showPlaceholder],
  );

  useEffect(() => {
    setIsLoaded(false);
    setUseRawSrc(false);
    setIsBroken(false);
  }, [optimizedSrc]);

  useEffect(() => {
    if (eager || isVisible) {
      return;
    }

    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [eager, isVisible]);

  const actualSrc =
    normalizedSrc && !isBroken && (eager || isVisible)
      ? useRawSrc
        ? normalizedSrc
        : optimizedSrc
      : undefined;

  return (
    <span ref={containerRef} className="relative block h-full w-full overflow-hidden">
      {placeholderSrc && !isLoaded && !isBroken ? (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
        />
      ) : null}
      <img
        src={actualSrc}
        alt={alt}
        referrerPolicy={referrerPolicy || 'no-referrer'}
        decoding={decoding || 'async'}
        loading={loading || (eager ? 'eager' : 'lazy')}
        fetchPriority={fetchPriority || (eager ? 'high' : 'auto')}
        className={className}
        style={{
          ...style,
          display: 'block',
          opacity: showPlaceholder ? (isLoaded ? 1 : 0) : 1,
          transition: 'opacity 220ms ease',
        }}
        onLoad={(event) => {
          setIsLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          if (!useRawSrc && optimizedSrc && optimizedSrc !== normalizedSrc) {
            setUseRawSrc(true);
            setIsLoaded(false);
            return;
          }
          setIsBroken(true);
          setIsLoaded(false);
          onError?.(event);
        }}
        {...rest}
      />
    </span>
  );
}

export default OptimizedImage;
