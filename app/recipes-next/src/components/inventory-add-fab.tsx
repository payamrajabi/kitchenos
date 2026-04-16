"use client";

import { createIngredientForInventoryAction } from "@/app/actions/inventory";
import { Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

export function InventoryAddFab() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
        setError(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const submit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await createIngredientForInventoryAction(trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setOpen(false);
      router.refresh();
    });
  }, [name, isPending, router]);

  return (
    <div className="inventory-add-fab-wrap" ref={wrapRef}>
      {open ? (
        <div
          className="inventory-add-fab-panel"
          role="dialog"
          aria-label="Add ingredient"
        >
          {error ? (
            <p className="inventory-add-fab-error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="visually-hidden" htmlFor="inventory-add-fab-name">
            Ingredient name
          </label>
          <input
            id="inventory-add-fab-name"
            className="inventory-add-fab-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                setOpen(false);
                setError(null);
              }
            }}
            placeholder="Ingredient name"
            disabled={isPending}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <button
            type="button"
            className="inventory-add-fab-submit"
            onClick={submit}
            disabled={isPending}
          >
            Add
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="inventory-add-fab"
        aria-label="Add ingredient"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
      >
        <Plus size={20} weight="bold" color="var(--paper)" aria-hidden />
      </button>
    </div>
  );
}
