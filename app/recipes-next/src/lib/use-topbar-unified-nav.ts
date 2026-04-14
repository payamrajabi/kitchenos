import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import type { User } from "@supabase/supabase-js";

/** Fallback if `--topbar-split-min-gap` is missing (see globals.css). */
const DEFAULT_MIN_GAP_PX = 16;

/**
 * When the split header (left tabs | right tabs + account) would need more horizontal
 * space than the top bar row has — i.e. the two groups would meet or overlap — use a
 * single horizontally scrolling strip instead. Driven by measured widths, not breakpoints.
 */
export function useTopbarUnifiedNav({
  pathname,
  user,
  menuOpen,
  minGapPx = DEFAULT_MIN_GAP_PX,
}: {
  pathname: string;
  user: User | null;
  menuOpen: boolean;
  minGapPx?: number;
}): {
  rowRef: RefObject<HTMLDivElement | null>;
  leftProbeRef: RefObject<HTMLDivElement | null>;
  rightProbeRef: RefObject<HTMLDivElement | null>;
  useUnifiedStrip: boolean;
} {
  const rowRef = useRef<HTMLDivElement>(null);
  const leftProbeRef = useRef<HTMLDivElement>(null);
  const rightProbeRef = useRef<HTMLDivElement>(null);

  const [useUnifiedStrip, setUseUnifiedStrip] = useState(false);

  const recompute = useCallback(() => {
    const row = rowRef.current;
    const left = leftProbeRef.current;
    const right = rightProbeRef.current;
    if (!row || !left || !right) return;

    const cs = getComputedStyle(row);
    const padX =
      parseFloat(cs.paddingLeft || "0") + parseFloat(cs.paddingRight || "0");
    const available = Math.max(0, row.clientWidth - padX);

    const gapVar = getComputedStyle(document.documentElement)
      .getPropertyValue("--topbar-split-min-gap")
      .trim();
    const gapParsed = parseFloat(gapVar);
    const gapPx =
      Number.isFinite(gapParsed) && gapParsed > 0 ? gapParsed : minGapPx;

    const need = left.scrollWidth + gapPx + right.scrollWidth;
    setUseUnifiedStrip(need > available);
  }, [minGapPx]);

  useLayoutEffect(() => {
    recompute();

    const row = rowRef.current;
    if (!row) return;

    const ro = new ResizeObserver(() => recompute());
    ro.observe(row);

    const onResize = () => recompute();
    window.addEventListener("resize", onResize);

    let cancelled = false;
    const fontsDone = document.fonts?.ready?.then(() => {
      if (!cancelled) recompute();
    });

    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      void fontsDone;
    };
  }, [recompute, pathname, user, menuOpen]);

  return { rowRef, leftProbeRef, rightProbeRef, useUnifiedStrip };
}
