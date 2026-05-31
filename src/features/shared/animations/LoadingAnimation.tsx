import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface LoadingAnimationProps {
  size?: 'small' | 'medium' | 'large';
  type?: 'spinner' | 'dots' | 'pulse' | 'bars';
  color?: string;
}

const loadingVariants = {
  spinner: {
    rotate: 360,
    transition: {
      repeat: Infinity,
      duration: 1,
      ease: 'linear',
    },
  },
  dots: [
    { opacity: 0.3, y: 0 },
    { opacity: 1, y: -10 },
    { opacity: 0.3, y: 0 },
  ],
  bars: [
    { scaleY: 0.5 },
    { scaleY: 1 },
    { scaleY: 0.5 },
  ],
};

const sizeMap = {
  small: 'w-6 h-6',
  medium: 'w-10 h-10',
  large: 'w-16 h-16',
};

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  size = 'medium',
  type = 'spinner',
  color = 'text-blue-600',
}) => {
  if (type === 'spinner') {
    return (
      <motion.div
        className={`${sizeMap[size]} border-4 border-gray-200 border-t-blue-600 rounded-full ${color}`}
        animate={{ rotate: 360 }}
        transition={{
          repeat: Infinity,
          duration: 1,
          ease: 'linear',
        }}
      />
    );
  }

  if (type === 'dots') {
    return (
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`w-2 h-2 rounded-full bg-blue-600`}
            animate={{ y: [0, -8, 0] }}
            transition={{
              repeat: Infinity,
              duration: 0.8,
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    );
  }

  if (type === 'bars') {
    return (
      <div className="flex gap-1 items-center">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-1 bg-blue-600 rounded-full"
            style={{ height: '24px' }}
            animate={{ scaleY: [0.5, 1, 0.5] }}
            transition={{
              repeat: Infinity,
              duration: 0.8,
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    );
  }

  // Pulse type
  return (
    <motion.div
      className={`${sizeMap[size]} rounded-full bg-blue-600`}
      animate={{ scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }}
      transition={{
        repeat: Infinity,
        duration: 2,
        ease: 'easeInOut',
      }}
    />
  );
};

export default LoadingAnimation;
