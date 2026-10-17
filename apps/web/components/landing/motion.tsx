'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Calls back once, the first time the element scrolls into view. */
function useOnScreen<T extends Element>(onVisible: () => void) {
  const ref = useRef<T | null>(null);
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          callback.current();
        }
      },
      // Any pixel past the bottom tenth counts: a tall block on a phone still gets revealed.
      { threshold: 0, rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** Rises into place when it enters the viewport; delay staggers siblings. */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'li' | 'section';
}) {
  const [visible, setVisible] = useState(false);
  const ref = useOnScreen<HTMLElement>(() => setVisible(true));
  return (
    <Tag
      ref={ref as never}
      className={clsx('reveal', visible && 'is-visible', className)}
      style={{ '--delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Counts from zero to `to` when it scrolls into view. */
export function CountUp({
  to,
  decimals = 0,
  suffix = '',
  className,
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const [value, setValue] = useState(0);
  const ref = useOnScreen<HTMLSpanElement>(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(to);
      return;
    }
    const start = performance.now();
    const duration = 1400;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      setValue(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const text = value.toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span ref={ref} className={clsx('tabular-nums', className)}>
      {text}
      {suffix}
    </span>
  );
}
