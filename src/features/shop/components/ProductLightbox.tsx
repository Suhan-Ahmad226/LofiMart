'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import OptimizedImage from '@/features/shared/ui/OptimizedImage';

interface ProductLightboxProps {
  images: string[];
  initialIndex: number;
  productName: string;
  brand?: string;
  isOpen: boolean;
  onClose: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const SWIPE_THRESHOLD = 50;
const ZOOM_STEP_WHEEL = 0.25;
const DOUBLE_TAP_INTERVAL = 300;

export const ProductLightbox: React.FC<ProductLightboxProps> = ({
  images,
  initialIndex,
  productName,
  brand,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(ZOOM_MIN);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const isSwiping = useRef(false);
  const lastPinchDist = useRef<number | null>(null);
  const lastTapTime = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setScale(ZOOM_MIN);
      setPosition({ x: 0, y: 0 });
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, initialIndex]);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= images.length) return;
    setCurrentIndex(index);
    setScale(ZOOM_MIN);
    setPosition({ x: 0, y: 0 });
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft') { goTo(currentIndex - 1); return; }
      if (e.key === 'ArrowRight') { goTo(currentIndex + 1); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, onClose, goTo]);

  const resetZoom = useCallback(() => {
    setScale(ZOOM_MIN);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (scale > ZOOM_MIN) {
      resetZoom();
    } else {
      setScale(2.5);
    }
  }, [scale, resetZoom]);

  const isZoomed = scale > ZOOM_MIN;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
    if (isZoomed) {
      setIsDragging(true);
      posStart.current = { x: position.x, y: position.y };
      isSwiping.current = false;
    } else {
      isSwiping.current = true;
      posStart.current = { x: position.x, y: position.y };
    }
  }, [isZoomed, position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      setPosition({
        x: posStart.current.x + (e.clientX - dragStart.current.x),
        y: posStart.current.y + (e.clientY - dragStart.current.y),
      });
    }
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isSwiping.current && !isZoomed) {
      const dx = e.clientX - dragStart.current.x;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        goTo(currentIndex + (dx < 0 ? 1 : -1));
      }
    }
    setIsDragging(false);
    isSwiping.current = false;
    lastPinchDist.current = null;
  }, [isZoomed, currentIndex, goTo]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastPinchDist.current = getTouchDist(e.touches[0], e.touches[1]);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const delta = (dist - lastPinchDist.current) * 0.008;
      lastPinchDist.current = dist;
      setScale((prev) => {
        const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev + delta));
        if (next <= ZOOM_MIN) setPosition({ x: 0, y: 0 });
        return next;
      });
    } else if (e.touches.length === 1 && isZoomed && isDragging) {
      setPosition({
        x: posStart.current.x + (e.touches[0].clientX - dragStart.current.x),
        y: posStart.current.y + (e.touches[0].clientY - dragStart.current.y),
      });
    }
  }, [isZoomed, isDragging]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (lastPinchDist.current !== null) {
      lastPinchDist.current = null;
      return;
    }
    if (!isZoomed) {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - dragStart.current.x;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        goTo(currentIndex + (dx < 0 ? 1 : -1));
      } else {
        const now = Date.now();
        if (now - lastTapTime.current < DOUBLE_TAP_INTERVAL) {
          handleDoubleClick();
          lastTapTime.current = 0;
        } else {
          lastTapTime.current = now;
        }
      }
    }
    setIsDragging(false);
    isSwiping.current = false;
  }, [isZoomed, currentIndex, goTo, handleDoubleClick]);

  const handleShare = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: productName, url: window.location.href });
      } catch { /* ignored */ }
    }
  }, [productName]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const hasMultiple = images.length > 1;
  const showPrev = hasMultiple && currentIndex > 0;
  const showNext = hasMultiple && currentIndex < images.length - 1;
  const cursorStyle = isDragging ? 'grabbing' : isZoomed ? 'grab' : 'zoom-in';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="product-lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex min-w-0 flex-col">
                {brand && (
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {brand}
                  </span>
                )}
                <span className="truncate text-lg font-semibold text-slate-900 sm:text-xl">
                  {productName}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                  aria-label="Share"
                >
                  <Share2 size={18} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                  aria-label="Close lightbox"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <div
              ref={containerRef}
              className="group/modal relative flex flex-1 items-center justify-center overflow-hidden bg-slate-950"
            >
              {showPrev && (
                <button
                  type="button"
                  onClick={() => goTo(currentIndex - 1)}
                  className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-md transition-all hover:bg-black/60 group-hover/modal:opacity-100"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              {showNext && (
                <button
                  type="button"
                  onClick={() => goTo(currentIndex + 1)}
                  className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-md transition-all hover:bg-black/60 group-hover/modal:opacity-100"
                  aria-label="Next image"
                >
                  <ChevronRight size={24} />
                </button>
              )}

              <div
                className="flex h-full w-full items-center justify-center"
                onDoubleClick={handleDoubleClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{ cursor: cursorStyle, touchAction: isZoomed ? 'none' : 'pan-y' }}
              >
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="flex h-full w-full items-center justify-center"
                >
                  <OptimizedImage
                    src={images[currentIndex]}
                    alt={`${productName} view ${currentIndex + 1}`}
                    widthHint={2000}
                    heightHint={2000}
                    quality="auto:best"
                    fit="limit"
                    eager
                    showPlaceholder={false}
                    className="max-h-full max-w-full select-none object-contain"
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                      transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                      pointerEvents: 'none',
                    }}
                    draggable={false}
                  />
                </motion.div>
              </div>
            </div>

            {hasMultiple && (
              <div className="bg-white px-6 py-4">
                <div
                  className="flex justify-center gap-2 overflow-x-auto"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {images.map((url, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => goTo(index)}
                      className={`flex-shrink-0 overflow-hidden rounded-lg transition-all ${
                        index === currentIndex
                          ? 'border-2 border-primary opacity-100'
                          : 'border border-slate-300 opacity-60 hover:opacity-100'
                      }`}
                      style={{ width: '4rem', height: '4rem' }}
                      aria-label={`Go to image ${index + 1}`}
                    >
                      <OptimizedImage
                        src={url}
                        alt={`${productName} thumbnail ${index + 1}`}
                        widthHint={120}
                        heightHint={120}
                        quality="auto:good"
                        fit="fill"
                        showPlaceholder={false}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

function getTouchDist(a: React.Touch, b: React.Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default ProductLightbox;
