"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** True when content overflows the element box (e.g. multi-line ellipsis). */
export function useTruncatedElement<T extends HTMLElement>(text: string) {
  const ref = useRef<T | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      setIsTruncated(el.scrollHeight > el.clientHeight + 1);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return { ref, isTruncated };
}
