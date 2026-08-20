'use client';

import React from 'react';
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';

const REVEAL_SELECTOR = [
  'main > div',
  'main section',
  'main article',
  'main aside',
  'main nav',
  '.product-card',
  '[data-reveal]',
].join(', ');

export function SiteMotionEnhancer() {
  const prefersReducedMotion = useReducedMotion();
  const [shouldReduceForDevice, setShouldReduceForDevice] = React.useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 28,
    mass: 0.2,
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const connection = navigator as Navigator & {
      connection?: { saveData?: boolean };
      deviceMemory?: number;
      hardwareConcurrency?: number;
    };

    const saveDataEnabled = Boolean(connection.connection?.saveData);
    const lowCpu = (connection.hardwareConcurrency ?? 8) <= 4;
    const lowMemory = (connection.deviceMemory ?? 8) <= 4;
    const smallScreen = window.innerWidth < 768;

    setShouldReduceForDevice(saveDataEnabled || (smallScreen && (lowCpu || lowMemory)));
  }, []);

  React.useEffect(() => {
    if (prefersReducedMotion || shouldReduceForDevice || typeof window === 'undefined') {
      return;
    }

    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('motion-visible');
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -10% 0px',
      }
    );

    const wireNodes = () => {
      const nodes = document.querySelectorAll(REVEAL_SELECTOR);
      nodes.forEach((node) => {
        if (seen.has(node) || node.closest('[data-motion-skip="true"]')) {
          return;
        }

        seen.add(node);
        node.classList.add('motion-reveal');
        observer.observe(node);
      });
    };

    wireNodes();

    const mutationObserver = new MutationObserver(() => {
      wireNodes();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [prefersReducedMotion, shouldReduceForDevice]);

  if (prefersReducedMotion || shouldReduceForDevice) {
    return null;
  }

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 origin-left bg-[linear-gradient(90deg,rgba(37,99,235,0.95),rgba(245,158,11,0.9),rgba(37,99,235,0.95))] shadow-[0_0_22px_rgba(37,99,235,0.3)]"
        style={{ scaleX: progress }}
      />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.15),rgba(37,99,235,0))] blur-3xl"
          animate={{ x: [0, 20, 0], y: [0, -24, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-[-6rem] top-1/3 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.12),rgba(245,158,11,0))] blur-3xl"
          animate={{ x: [0, -28, 0], y: [0, 18, 0], scale: [1, 0.94, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[-6rem] left-1/3 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(15,23,42,0.08),rgba(15,23,42,0))] blur-3xl"
          animate={{ x: [0, 24, 0], y: [0, -16, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </>
  );
}

export default SiteMotionEnhancer;
