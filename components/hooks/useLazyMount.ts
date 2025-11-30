'use client';

import { type MutableRefObject, useEffect, useRef, useState } from 'react';

type LazyMountReturn<T extends HTMLElement> = {
  ref: MutableRefObject<T | null>;
  isVisible: boolean;
};

/**
 * Defer rendering of expensive client widgets until they actually enter the viewport.
 */
export function useLazyMount<T extends HTMLElement>(rootMargin = '160px'): LazyMountReturn<T> {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible) return;
    const target = ref.current;
    if (!target) return;

    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      const reveal = () => setIsVisible(true);
      if (typeof queueMicrotask === 'function') queueMicrotask(reveal);
      else void Promise.resolve().then(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return { ref, isVisible };
}
