import React from 'react';
import { cn } from '../../../lib/utils';

type AnimatedIconProps = React.HTMLAttributes<HTMLSpanElement> & {
  loop?: 'none' | 'float' | 'pulse';
  glow?: boolean;
};

const loopClassMap: Record<NonNullable<AnimatedIconProps['loop']>, string> = {
  none: '',
  float: 'icon-float',
  pulse: 'icon-pulse',
};

export const AnimatedIcon = ({
  children,
  className,
  loop = 'float',
  glow = false,
  ...props
}: AnimatedIconProps) => (
  <span
    className={cn(
      'icon-animated relative inline-flex items-center justify-center',
      loopClassMap[loop],
      glow && 'drop-shadow-[0_6px_16px_rgba(16,185,129,0.2)]',
      className,
    )}
    {...props}
  >
    {children}
  </span>
);

type AnimatedBadgeProps = React.HTMLAttributes<HTMLSpanElement>;

export const AnimatedBadge = ({ children, className, ...props }: AnimatedBadgeProps) => (
  <span className={cn('badge-pulse', className)} {...props}>
    {children}
  </span>
);
