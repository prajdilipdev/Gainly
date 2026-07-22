'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Wraps a live numeric value and briefly flashes green/red when it changes,
 * matching the direction of the move.
 */
export function FlashValue({
  value,
  className,
  children,
}: {
  value: number | null | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prev = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    const previous = prev.current;
    prev.current = value;
    if (
      previous === undefined ||
      previous === null ||
      value === null ||
      value === undefined ||
      value === previous
    ) {
      return;
    }
    setFlash(value > previous ? 'up' : 'down');
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span
      className={cn(
        'inline-block px-1 -mx-1',
        flash === 'up' && 'flash-up',
        flash === 'down' && 'flash-down',
        className,
      )}
    >
      {children}
    </span>
  );
}
