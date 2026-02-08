import { useRef, useState, useLayoutEffect, useEffect, useCallback, type RefObject } from 'react';

interface UseFitTextOptions {
  /** Ideal / maximum font size in px */
  maxFontSize: number;
  /** Never shrink below this font size in px */
  minFontSize: number;
  /** Pass text content or question index to trigger re-measurement when it changes */
  content?: string | number;
}

interface UseFitTextReturn {
  /** Attach to the element whose text should be auto-sized */
  ref: RefObject<HTMLElement | null>;
  /** The computed font size in px */
  fontSize: number;
}

/**
 * useFitText — dynamically adjusts font-size so that text content
 * fits within its container without overflow.
 *
 * Uses binary search for efficient sizing, `useLayoutEffect` to
 * avoid paint flashes on text changes, and `ResizeObserver` to
 * re-measure when the container resizes (orientation change,
 * fullscreen toggle, etc.).
 */
export function useFitText({
  maxFontSize,
  minFontSize,
  content,
}: UseFitTextOptions): UseFitTextReturn {
  const ref = useRef<HTMLElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  /**
   * Binary-search for the largest font size between minFontSize and
   * maxFontSize where scrollHeight <= clientHeight.
   */
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Temporarily remove any transition on font-size so measurements
    // are instant and accurate.
    const prevTransition = el.style.transition;
    el.style.transition = 'none';

    let lo = minFontSize;
    let hi = maxFontSize;

    // Start optimistically: if maxFontSize already fits, skip the search.
    el.style.fontSize = `${hi}px`;
    if (el.scrollHeight <= el.clientHeight) {
      el.style.transition = prevTransition;
      // Only update state if the size actually changed
      setFontSize((prev) => (prev !== hi ? hi : prev));
      return;
    }

    // Binary search — converge within 0.5px tolerance.
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      const fits = el.scrollHeight <= el.clientHeight;

      if (fits) {
        lo = mid; // mid fits — try larger
      } else {
        hi = mid; // mid overflows — try smaller
      }
    }

    // Use the lower bound (guaranteed to fit).
    const finalSize = Math.max(lo, minFontSize);
    el.style.fontSize = `${finalSize}px`;
    el.style.transition = prevTransition;
    // Only update state if the size actually changed
    setFontSize((prev) => (prev !== finalSize ? finalSize : prev));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxFontSize, minFontSize]);

  // ---- Text / content changes ----
  // useLayoutEffect fires synchronously after render but before paint,
  // so users never see a flash of the wrong size.
  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, content]); // Re-measure when measure function changes or content changes

  // ---- Container / viewport size changes ----
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rafId: number;

    const observer = new ResizeObserver(() => {
      // Wrapping in rAF avoids the well-known
      // "ResizeObserver loop completed with undelivered notifications" warning.
      rafId = requestAnimationFrame(() => {
        measure();
      });
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [measure]);

  return { ref, fontSize };
}
