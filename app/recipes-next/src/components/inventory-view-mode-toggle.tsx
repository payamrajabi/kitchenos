"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";

export const INVENTORY_VIEW_MODES = ["list", "categories"] as const;
export type InventoryViewMode = (typeof INVENTORY_VIEW_MODES)[number];

const OPTIONS: Array<{
  value: InventoryViewMode;
  label: string;
  title: string;
}> = [
  { value: "list", label: "List", title: "Alphabetical list" },
  {
    value: "categories",
    label: "Categories",
    title: "Grouped by ingredient category",
  },
];

export function InventoryViewModeToggle({
  value,
  onChange,
}: {
  value: InventoryViewMode;
  onChange: (next: InventoryViewMode) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const handlePointer = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) close();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  return (
    <div
      ref={wrapRef}
      className="inventory-view-mode-toggle"
    >
      <button
        type="button"
        className="secondary-tab-button inventory-view-mode-toggle-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current.title}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current.label}</span>
        <CaretDown size={12} weight="bold" aria-hidden />
      </button>
      {open ? (
        <div
          className="inventory-view-mode-menu"
          role="listbox"
          aria-label="Inventory view"
        >
          {OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`inventory-view-mode-menu-item${active ? " active" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  close();
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
