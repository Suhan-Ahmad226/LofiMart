import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

type AnimationType = 'fadeUp' | 'fadeLeft' | 'fadeRight' | 'zoom' | 'parallax' | 'rotate';

interface ScrollAnimationProps {
  children: ReactNode;
  animation?: AnimationType;
  threshold?: number;
  delay?: number;
  duration?: number;
  speed?: number;
  className?: string;
}

const scrollVariants = {
  fadeUp: {
    hidden: { opacity: 0, y: 50 },
    visible: (custom: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: custom * 0.1, duration: 0.6 },
    }),
  },
  fadeLeft: {
    hidden: { opacity: 0, x: -50 },
    visible: (custom: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: custom * 0.1, duration: 0.6 },
    }),
  },
  fadeRight: {
    hidden: { opacity: 0, x: 50 },
    visible: (custom: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: custom * 0.1, duration: 0.6 },
    }),
  },
  zoom: {
    hidden: { opacity: 0, scale: 0.8 },
    visible: (custom: number) => ({
      opacity: 1,
      scale: 1,
      transition: { delay: custom * 0.1, duration: 0.6 },
    }),
  },
  parallax: {
    hidden: { opacity: 0, y: 100 },
    visible: { opacity: 1, y: 0 },
  },
  rotate: {
    hidden: { opacity: 0, rotate: -10 },
    visible: (custom: number) => ({
      opacity: 1,
      rotate: 0,
      transition: { delay: custom * 0.1, duration: 0.7 },
    }),
  },
};

export const ScrollAnimation: React.FC<ScrollAnimationProps> = ({
  children,
  animation = 'fadeUp',
  threshold = 0.1,
  delay = 0,
  duration = 0.6,
  speed = 1,
  className = '',
}) => {
  const { ref, inView } = useInView({
    threshold,
    triggerOnce: true,
  });

  const variants = scrollVariants[animation] || scrollVariants.fadeUp;

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={variants}
      custom={delay}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default ScrollAnimation;
