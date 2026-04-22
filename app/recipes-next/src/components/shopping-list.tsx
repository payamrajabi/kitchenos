"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ShoppingListItem } from "@/app/actions/shop";
import {
  checkOffShoppingItemAction,
  undoCheckOffShoppingItemAction,
} from "@/app/actions/shop";
import {
  groceryAisleForIngredient,
  groceryAisleSortIndex,
} from "@/lib/grocery-aisle";
import {
  groceryCategorySortIndex,
  isIngredientGroceryCategory,
} from "@/lib/ingredient-grocery-category";

const SHOP_AUTO_DISMISS_MS = 60 * 60 * 1000;

/** One list row per ingredient after server merge (multiple recipe units roll up). */
function itemRowKey(item: ShoppingListItem): string {
  return String(item.ingredientId);
}

type AisleGroup = {
  aisle: string;
  items: ShoppingListItem[];
};

function sectionLabelForItem(item: ShoppingListItem): string {
  const g = item.groceryCategory?.trim();
  if (g) return g;
  return groceryAisleForIngredient(item.category, item.ingredientName);
}

function sectionSortKey(section: string): number {
  if (isIngredientGroceryCategory(section)) {
    return groceryCategorySortIndex(section);
  }
  return groceryAisleSortIndex(section);
}

function groupByGroceryAisle(items: ShoppingListItem[]): AisleGroup[] {
  const map = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const aisle = sectionLabelForItem(item);
    const existing = map.get(aisle);
    if (existing) existing.push(item);
    else map.set(aisle, [item]);
  }
  return [...map.entries()]
    .sort(
      (a, b) =>
        sectionSortKey(a[0]) - sectionSortKey(b[0]) || a[0].localeCompare(b[0]),
    )
    .map(([aisle, groupItems]) => ({
      aisle,
      items: [...groupItems].sort((x, y) =>
        x.ingredientName.localeCompare(y.ingredientName),
      ),
    }));
}

function checkOffLinesForItem(item: ShoppingListItem) {
  return item.checkOffLines && item.checkOffLines.length > 0
    ? item.checkOffLines
    : [{ amount: item.neededAmount, unit: item.neededUnit }];
}

// Mirror of the inventory controller's editable-target guard. We specifically
// want arrow-key navigation to keep working while the focus is on one of our
// own checkboxes, so a focused checkbox is explicitly NOT treated as an
// editable text target.
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "checkbox" || type === "radio" || type === "button") {
      return false;
    }
    return true;
  }
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Pick the nearest shopping row in the requested direction using
 * viewport rects, weighting perpendicular offset so we strongly prefer
 * staying in the same visual column (up/down) or row (left/right).
 * Same algorithm the inventory view uses.
 */
function pickNeighbour(
  direction: "up" | "down" | "left" | "right",
  source: DOMRect,
  candidates: { key: string; rect: DOMRect }[],
): string | null {
  const sourceCx = source.left + source.width / 2;
  const sourceCy = source.top + source.height / 2;

  let best: { key: string; score: number } | null = null;

  for (const c of candidates) {
    const cx = c.rect.left + c.rect.width / 2;
    const cy = c.rect.top + c.rect.height / 2;

    const dx = cx - sourceCx;
    const dy = cy - sourceCy;

    if (direction === "up" && dy >= -2) continue;
    if (direction === "down" && dy <= 2) continue;
    if (direction === "left" && dx >= -2) continue;
    if (direction === "right" && dx <= 2) continue;

    let primary: number;
    let secondary: number;
    if (direction === "up" || direction === "down") {
      primary = Math.abs(dy);
      secondary = Math.abs(dx);
    } else {
      primary = Math.abs(dx);
      secondary = Math.abs(dy);
    }
    const score = primary + secondary * 4;

    if (best === null || score < best.score) {
      best = { key: c.key, score };
    }
  }

  return best ? best.key : null;
}

function ShoppingRow({
  item,
  checked,
  onCheckedChange,
}: {
  item: ShoppingListItem;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const [isPending, startWriteTransition] = useTransition();
  const [error, setError] = useState("");

  const lines = useMemo(() => checkOffLinesForItem(item), [item]);
  const key = itemRowKey(item);

  function handleChange() {
    setError("");
    const wantChecked = !checked;
    startWriteTransition(async () => {
      if (wantChecked) {
        for (const line of lines) {
          const res = await checkOffShoppingItemAction(
            item.ingredientId,
            line.amount,
            line.unit,
          );
          if (!res.ok) {
            setError(res.error);
            return;
          }
        }
        onCheckedChange(true);
      } else {
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i]!;
          const res = await undoCheckOffShoppingItemAction(
            item.ingredientId,
            line.amount,
            line.unit,
          );
          if (!res.ok) {
            setError(res.error);
            return;
          }
        }
        onCheckedChange(false);
      }
    });
  }

  return (
    <li
      data-shop-key={key}
      className={`shop-cat-row${checked ? " shop-cat-row--checked" : ""}${
        isPending ? " shop-cat-row--pending" : ""
      }`}
    >
      <label className="shop-cat-row-label">
        <input
          type="checkbox"
          className="shop-cat-row-checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={isPending}
        />
        <span className="shop-cat-row-name">{item.ingredientName}</span>
      </label>
      {error ? (
        <p className="shop-cat-row-error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function ShoppingList({ items }: { items: ShoppingListItem[] }) {
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set<string>());
  const [checkedKeys, setCheckedKeys] = useState(() => new Set<string>());
  const dismissTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clearDismissTimer = useCallback((key: string) => {
    const t = dismissTimers.current.get(key);
    if (t) clearTimeout(t);
    dismissTimers.current.delete(key);
  }, []);

  const scheduleAutoDismiss = useCallback(
    (key: string) => {
      clearDismissTimer(key);
      const id = setTimeout(() => {
        dismissTimers.current.delete(key);
        setCheckedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setDismissedKeys((prev) => new Set(prev).add(key));
      }, SHOP_AUTO_DISMISS_MS);
      dismissTimers.current.set(key, id);
    },
    [clearDismissTimer],
  );

  useEffect(() => {
    return () => {
      for (const t of dismissTimers.current.values()) clearTimeout(t);
      dismissTimers.current.clear();
    };
  }, []);

  const activeKeys = useMemo(
    () => new Set(items.map((i) => itemRowKey(i))),
    [items],
  );

  useEffect(() => {
    for (const [key, tid] of [...dismissTimers.current.entries()]) {
      if (!activeKeys.has(key)) {
        clearTimeout(tid);
        dismissTimers.current.delete(key);
      }
    }
    startTransition(() => {
      setCheckedKeys((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const k of prev) {
          if (!activeKeys.has(k)) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
  }, [activeKeys]);

  const visibleItems = useMemo(
    () => items.filter((i) => !dismissedKeys.has(itemRowKey(i))),
    [items, dismissedKeys],
  );

  const groups = useMemo(
    () => groupByGroceryAisle(visibleItems),
    [visibleItems],
  );

  const handleItemCheckedChange = useCallback(
    (key: string, next: boolean) => {
      if (next) {
        setCheckedKeys((prev) => new Set(prev).add(key));
        scheduleAutoDismiss(key);
      } else {
        clearDismissTimer(key);
        setCheckedKeys((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
      }
    },
    [clearDismissTimer, scheduleAutoDismiss],
  );

  // -------- Keyboard controller ------------------------------------------
  //
  // Matches the inventory view: arrow keys navigate spatially between
  // rows (same visual column/row biased), Escape clears focus. Space and
  // Enter toggle the checked state natively because focus sits on the
  // row's <input type="checkbox">.
  const navigateSpatially = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const container = containerRef.current;
      if (!container) return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl) return;
      const sourceRow = activeEl.closest<HTMLElement>("[data-shop-key]");
      if (!sourceRow || !container.contains(sourceRow)) return;

      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-shop-key]"),
      );
      const sourceKey = sourceRow.dataset.shopKey ?? "";
      const sourceRect = sourceRow.getBoundingClientRect();
      const candidates: { key: string; rect: DOMRect }[] = [];
      for (const n of nodes) {
        const k = n.dataset.shopKey ?? "";
        if (!k || k === sourceKey) continue;
        candidates.push({ key: k, rect: n.getBoundingClientRect() });
      }

      const nextKey = pickNeighbour(direction, sourceRect, candidates);
      if (!nextKey) return;

      requestAnimationFrame(() => {
        const target = container.querySelector<HTMLElement>(
          `[data-shop-key="${CSS.escape(nextKey)}"]`,
        );
        if (!target) return;
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        const cb = target.querySelector<HTMLInputElement>(
          'input[type="checkbox"]',
        );
        cb?.focus({ preventScroll: true });
      });
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const container = containerRef.current;
      if (!container) return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl || !container.contains(activeEl)) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateSpatially("down");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateSpatially("up");
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateSpatially("left");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateSpatially("right");
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigateSpatially]);

  if (!items.length) {
    return (
      <div className="shop-empty">
        <p className="shop-empty-message">
          You have everything you need for the next 7 days — nothing to buy.
        </p>
      </div>
    );
  }

  if (!visibleItems.length) {
    return (
      <div className="shop-list">
        <div className="shop-empty shop-empty-inline">
          <p className="shop-empty-message">Nothing left on your list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-list">
      <div ref={containerRef} className="shop-cat-view">
        {groups.map((group) => (
          <section key={group.aisle} className="shop-cat-section">
            <h3 className="shop-cat-section-heading">
              <span className="shop-cat-section-title">{group.aisle}</span>
            </h3>
            <ul className="shop-cat-section-list">
              {group.items.map((item) => {
                const key = itemRowKey(item);
                return (
                  <ShoppingRow
                    key={key}
                    item={item}
                    checked={checkedKeys.has(key)}
                    onCheckedChange={(next) =>
                      handleItemCheckedChange(key, next)
                    }
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
