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

function ShoppingItem({
  item,
  checked,
  onCheckedChange,
}: {
  item: ShoppingListItem;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const lines = useMemo(() => checkOffLinesForItem(item), [item]);

  function handleChange() {
    setError("");
    const wantChecked = !checked;
    startTransition(async () => {
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
    <div
      className={`shop-item${checked ? " shop-item-checked" : ""}${isPending ? " shop-item-pending" : ""}`}
    >
      <label className="shop-item-row">
        <input
          type="checkbox"
          className="shop-item-checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={isPending}
        />
        <span className="shop-item-text">{item.ingredientName}</span>
      </label>
      {error ? (
        <p className="shop-item-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ShoppingList({ items }: { items: ShoppingListItem[] }) {
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set<string>());
  const [checkedKeys, setCheckedKeys] = useState(() => new Set<string>());
  const dismissTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

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
      <div className="shop-columns">
        {groups.map((group) => (
          <section key={group.aisle} className="shop-category">
            <div className="shop-category-header">
              <h3 className="shop-category-title">{group.aisle}</h3>
            </div>
            <div className="shop-category-items">
              {group.items.map((item) => {
                const key = itemRowKey(item);
                return (
                  <ShoppingItem
                    key={key}
                    item={item}
                    checked={checkedKeys.has(key)}
                    onCheckedChange={(next) =>
                      handleItemCheckedChange(key, next)
                    }
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
