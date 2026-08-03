import React, { ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLocation } from '../../../lib/navigation';

interface PageTransitionProps {
  children: ReactNode;
  type?: 'slide' | 'fade' | 'scale' | 'flip' | 'rotate';
  duration?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  easing?: 'easeInOut' | 'easeIn' | 'easeOut' | 'circIn' | 'circOut' | 'backIn' | 'backOut';
}

type VariantState = Record<string, unknown>;

const transitionVariants = {
  slide: (direction: string = 'right') => ({
    initial: {
      x: direction === 'left' ? 1000 : direction === 'right' ? -1000 : 0,
      y: direction === 'up' ? 1000 : direction === 'down' ? -1000 : 0,
      opacity: 0,
    },
    animate: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: 'easeInOut',
      },
    },
    exit: {
      x: direction === 'left' ? -1000 : direction === 'right' ? 1000 : 0,
      y: direction === 'up' ? -1000 : direction === 'down' ? 1000 : 0,
      opacity: 0,
      transition: {
        duration: 0.5,
        ease: 'easeInOut',
      },
    },
  }),
  fade: () => ({
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.4 } },
    exit: { opacity: 0, transition: { duration: 0.4 } },
  }),
  scale: () => ({
    initial: { scale: 0.8, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
    exit: {
      scale: 0.8,
      opacity: 0,
      transition: { duration: 0.5, ease: 'easeIn' },
    },
  }),
  flip: () => ({
    initial: { rotateY: 90, opacity: 0 },
    animate: {
      rotateY: 0,
      opacity: 1,
      transition: { duration: 0.6, ease: 'easeOut' },
    },
    exit: {
      rotateY: -90,
      opacity: 0,
      transition: { duration: 0.6, ease: 'easeIn' },
    },
  }),
  rotate: () => ({
    initial: { rotate: -10, opacity: 0 },
    animate: {
      rotate: 0,
      opacity: 1,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
    exit: {
      rotate: 10,
      opacity: 0,
      transition: { duration: 0.5, ease: 'easeIn' },
    },
  }),
};

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  type = 'slide',
  duration = 0.5,
  direction = 'right',
  easing = 'easeInOut',
}) => {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const [shouldReduceForDevice, setShouldReduceForDevice] = React.useState(false);

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
    const opsRoute =
      location.pathname.startsWith('/admin') ||
      location.pathname.startsWith('/seller') ||
      location.pathname.startsWith('/reseller-dashboard') ||
      location.pathname.startsWith('/account');

    setShouldReduceForDevice(saveDataEnabled || lowCpu || lowMemory || opsRoute);
  }, [location.pathname]);

  if (prefersReducedMotion || shouldReduceForDevice) {
    return <div className="page-shell">{children}</div>;
  }

  const baseVariants =
    type === 'slide'
      ? transitionVariants.slide(direction)
      : transitionVariants[type]?.() || transitionVariants.fade();
  const initialState = (baseVariants.initial ?? {}) as VariantState;
  const animateState = (baseVariants.animate ?? {}) as VariantState;
  const exitState = (baseVariants.exit ?? {}) as VariantState;

  const variants = {
    initial: {
      ...initialState,
      filter: 'blur(10px)',
      y: typeof initialState.y === 'number' ? initialState.y : 18,
    },
    animate: {
      ...animateState,
      filter: 'blur(0px)',
      transition: {
        duration,
        ease: easing,
        ...(typeof animateState === 'object' && 'transition' in animateState
          ? (animateState.transition as Record<string, unknown>)
          : {}),
      },
    },
    exit: {
      ...exitState,
      filter: 'blur(8px)',
      transition: {
        duration: Math.max(0.25, duration * 0.85),
        ease: easing,
        ...(typeof exitState === 'object' && 'transition' in exitState
          ? (exitState.transition as Record<string, unknown>)
          : {}),
      },
    },
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="page-shell"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default PageTransition;
