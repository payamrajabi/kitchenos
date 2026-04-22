"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CaretDown } from "@phosphor-icons/react";

export type SelectOption = {
  value: string;
  label: string;
  /** Sort group: lower values list first (e.g. 0 = recipes, 1 = ingredients). */
  tier?: number;
};

type Props = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  placeholder?: string;
  /** When true, list + search field show on mount (no trigger button step). */
  defaultOpen?: boolean;
  /**
   * Plain label + caret (no full-width bordered trigger). Used on the inventory table.
   */
  bareInline?: boolean;
  /** Override the label shown on the closed trigger (e.g. for pluralization). */
  triggerLabel?: string;
};

function collectScrollContainers(start: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  let n: HTMLElement | null = start;
  while (n) {
    const { overflow, overflowY, overflowX } = getComputedStyle(n);
    const oy = overflowY === "visible" ? overflow : overflowY;
    const ox = overflowX === "visible" ? overflow : overflowX;
    if (/(auto|scroll|overlay)/.test(oy) || /(auto|scroll|overlay)/.test(ox)) {
      out.push(n);
    }
    n = n.parentElement;
  }
  return out;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
  placeholder = "—",
  defaultOpen = false,
  bareInline = false,
  triggerLabel: triggerLabelProp,
}: Props) {
  const [open, setOpen] = useState(() => Boolean(defaultOpen) && !disabled);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [listPos, setListPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(() => {
    if (!value) return placeholder;
    const match = options.find((o) => o.value === value);
    return match ? match.label : value;
  }, [value, options, placeholder]);

  const filtered = useMemo(() => {
    const rank = (o: SelectOption) => o.tier ?? 0;
    const byRankThenLabel = (a: SelectOption, b: SelectOption) => {
      const dr = rank(a) - rank(b);
      if (dr !== 0) return dr;
      return a.label.localeCompare(b.label);
    };

    if (!query) {
      const sorted = [...options].sort(byRankThenLabel);
      return [{ value: "", label: placeholder }, ...sorted];
    }

    const q = query.toLowerCase();
    return options
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q),
      )
      .sort(byRankThenLabel);
  }, [options, query, placeholder]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only gate for createPortal(document.body)
    setMounted(true);
  }, []);

  const syncListPosition = useCallback(() => {
    const anchor = bareInline ? triggerRef.current : inputWrapRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    setListPos({ top: r.bottom, left: r.left, width: r.width });
  }, [bareInline]);

  useLayoutEffect(() => {
    if (!open) return;
    syncListPosition();
    const anchor = bareInline ? triggerRef.current : inputWrapRef.current;
    const scrollParents = collectScrollContainers(anchor);
    window.addEventListener("resize", syncListPosition);
    const onScrollCapture = () => syncListPosition();
    window.addEventListener("scroll", onScrollCapture, true);
    scrollParents.forEach((el) =>
      el.addEventListener("scroll", syncListPosition, { passive: true }),
    );
    return () => {
      window.removeEventListener("resize", syncListPosition);
      window.removeEventListener("scroll", onScrollCapture, true);
      scrollParents.forEach((el) =>
        el.removeEventListener("scroll", syncListPosition),
      );
    };
  }, [open, syncListPosition, bareInline]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        containerRef.current?.contains(t) ||
        popoverRef.current?.contains(t)
      ) {
        return;
      }
      setListPos(null);
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return;
    const list = listRef.current;
    const el = list.children[highlightIdx] as HTMLElement | undefined;
    if (!el) return;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (elTop < viewTop) list.scrollTop = elTop;
    else if (elBottom > viewBottom) list.scrollTop = elBottom - list.clientHeight;
  }, [highlightIdx]);

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setListPos(null);
    setHighlightIdx(0);
    setOpen(true);
    setQuery("");
  }, [disabled]);

  const pick = useCallback(
    (v: string) => {
      onChange(v);
      setListPos(null);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const bareClass = bareInline ? " ss-bare-inline" : "";

  const caretEl = bareInline ? (
    <CaretDown className="ss-caret ss-caret-phosphor" size={14} weight="bold" aria-hidden />
  ) : (
    <svg
      className="ss-caret"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      aria-hidden="true"
    >
      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,48,88H208a8,8,0,0,1,5.66,13.66Z" />
    </svg>
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightIdx >= 0 && filtered[highlightIdx]) {
          pick(filtered[highlightIdx].value);
        }
      } else if (e.key === "Escape") {
        setListPos(null);
        setOpen(false);
        setQuery("");
      }
    },
    [filtered, highlightIdx, pick],
  );

  const listEl = (
    <ul ref={listRef} className="ss-list ss-list-portal" role="listbox">
      {filtered.map((opt, i) => (
        <li
          key={opt.value}
          role="option"
          aria-selected={opt.value === value}
          className={`ss-option${opt.value === value ? " ss-option-active" : ""}${i === highlightIdx ? " ss-option-highlight" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            pick(opt.value);
          }}
          onMouseEnter={() => setHighlightIdx(i)}
        >
          {opt.label}
        </li>
      ))}
      {filtered.length === 0 && <li className="ss-empty">No matches</li>}
    </ul>
  );

  if (open && bareInline) {
    return (
      <>
        <div
          ref={containerRef}
          className={`ss-root ss-open${bareClass}${className ? ` ${className}` : ""}`}
        >
          <button
            ref={triggerRef}
            type="button"
            className="ss-trigger"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={true}
            onMouseDown={(e) => {
              e.preventDefault();
              setListPos(null);
              setOpen(false);
              setQuery("");
            }}
          >
            <span className="ss-trigger-label">{triggerLabelProp ?? selectedLabel}</span>
            {caretEl}
          </button>
        </div>
        {mounted &&
          listPos &&
          createPortal(
            <div
              ref={popoverRef}
              className="ss-popover-anchor ss-popover-anchor--bare"
              style={{
                position: "fixed",
                top: listPos.top,
                left: listPos.left,
                minWidth: listPos.width,
                zIndex: 10000,
              }}
            >
              <div ref={inputWrapRef} className="ss-input-wrap ss-input-wrap--popover">
                <input
                  ref={inputRef}
                  className="ss-input"
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlightIdx(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedLabel}
                  aria-label={ariaLabel}
                  autoComplete="off"
                  spellCheck={false}
                />
                {caretEl}
              </div>
              {listEl}
            </div>,
            document.body,
          )}
      </>
    );
  }

  if (open) {
    return (
      <>
        <div
          ref={containerRef}
          className={`ss-root ss-open${bareClass}${className ? ` ${className}` : ""}`}
        >
          <div ref={inputWrapRef} className="ss-input-wrap">
            <input
              ref={inputRef}
              className="ss-input"
              type="text"
              value={query}
              onChange={(e) => {
              setQuery(e.target.value);
              setHighlightIdx(0);
            }}
              onKeyDown={handleKeyDown}
              placeholder={selectedLabel}
              aria-label={ariaLabel}
              autoComplete="off"
              spellCheck={false}
            />
            {caretEl}
          </div>
        </div>
        {mounted &&
          listPos &&
          createPortal(
            <div
              ref={popoverRef}
              className="ss-popover-anchor"
              style={{
                position: "fixed",
                top: listPos.top,
                left: listPos.left,
                width: listPos.width,
                zIndex: 10000,
              }}
            >
              {listEl}
            </div>,
            document.body,
          )}
      </>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`ss-root${bareClass}${className ? ` ${className}` : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ss-trigger"
        onClick={handleOpen}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={false}
      >
        <span className="ss-trigger-label">{triggerLabelProp ?? selectedLabel}</span>
        {caretEl}
      </button>
    </div>
  );
}
