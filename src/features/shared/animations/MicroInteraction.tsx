import React, { ReactNode, useState } from 'react';
import { motion, type Variants } from 'framer-motion';

type MicroInteractionType = 'bounce' | 'pulse' | 'shake' | 'ripple' | 'scale' | 'lift' | 'glow';
type TriggerType = 'hover' | 'click' | 'load' | 'inView';

interface MicroInteractionProps {
  children: ReactNode;
  type?: MicroInteractionType;
  trigger?: TriggerType;
  className?: string;
}

const interactionVariants: Record<MicroInteractionType, Variants> = {
  bounce: {
    initial: { y: 0 },
    animate: {
      y: [0, -10, 0, -5, 0],
      transition: { duration: 0.6, ease: 'easeInOut' },
    },
  },
  pulse: {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.05, 1, 1.05, 1],
      transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
    },
  },
  shake: {
    initial: { x: 0 },
    animate: {
      x: [-5, 5, -5, 5, 0],
      transition: { duration: 0.4, ease: 'easeInOut' },
    },
  },
  scale: {
    initial: { scale: 1 },
    whileHover: { scale: 1.1, transition: { duration: 0.3 } },
    whileTap: { scale: 0.95 },
  },
  lift: {
    initial: { y: 0, boxShadow: '0px 2px 8px rgba(0,0,0,0.1)' },
    whileHover: {
      y: -8,
      boxShadow: '0px 12px 24px rgba(0,0,0,0.15)',
      transition: { duration: 0.3 },
    },
  },
  ripple: {
    initial: { scale: 0, opacity: 1 },
    animate: {
      scale: 1,
      opacity: 0,
      transition: { duration: 0.6, ease: 'easeOut' },
    },
  },
  glow: {
    initial: { boxShadow: '0 0 0px rgba(59, 130, 246, 0)' },
    whileHover: {
      boxShadow: [
        '0 0 0px rgba(59, 130, 246, 0)',
        '0 0 10px rgba(59, 130, 246, 0.5)',
        '0 0 20px rgba(59, 130, 246, 0.8)',
        '0 0 10px rgba(59, 130, 246, 0.5)',
        '0 0 0px rgba(59, 130, 246, 0)',
      ],
      transition: { duration: 0.6, repeat: Infinity },
    },
  },
};

export const MicroInteraction: React.FC<MicroInteractionProps> = ({
  children,
  type = 'scale',
  trigger = 'hover',
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const variants = interactionVariants[type];
  const shouldAnimate =
    (trigger === 'hover' && isHovered) ||
    (trigger === 'click' && isClicked) ||
    trigger === 'load' ||
    trigger === 'inView';

  return (
    <motion.div
      onMouseEnter={() => trigger === 'hover' && setIsHovered(true)}
      onMouseLeave={() => trigger === 'hover' && setIsHovered(false)}
      onClick={() => trigger === 'click' && setIsClicked((current) => !current)}
      variants={variants}
      initial="initial"
      animate={shouldAnimate ? 'animate' : 'initial'}
      whileHover={trigger === 'hover' ? 'whileHover' : undefined}
      whileTap={trigger === 'click' ? 'whileTap' : undefined}
      className={className}
      style={{ transformOrigin: 'center' }}
    >
      {children}
    </motion.div>
  );
};

export default MicroInteraction;
