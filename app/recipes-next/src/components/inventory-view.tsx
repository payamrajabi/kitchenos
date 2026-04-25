"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { IngredientRow, InventoryItemRow } from "@/types/database";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryFilterBar,
  STORAGE_LOCATION_BY_FILTER_KEY,
  type InventoryFilterKey,
  type InventoryFilterState,
} from "@/components/inventory-filter-bar";
import { getInventoryGroup } from "@/lib/inventory-filters";
import { InventoryDetailSheet } from "@/components/inventory-detail-sheet";
import { updateInventoryQuantityFieldAction } from "@/app/actions/inventory";
import { toast } from "sonner";
import {
  InventoryViewModeToggle,
  type InventoryViewMode,
} from "@/components/inventory-view-mode-toggle";
import { InventoryCategoryView } from "@/components/inventory-category-view";
import { InventoryTableView } from "@/components/inventory-table-view";

type Props = {
  ingredients: IngredientRow[];
  inventory: InventoryItemRow[];
};

// Max digits we will accumulate while the user rapid-types a number.
// Four digits (0–9999) is more than enough for realistic stock counts and
// still lets a wrong-keystroke-at-the-tail retry via Backspace.
const DIGIT_BUFFER_MAX_LEN = 4;

// How long the user has between keystrokes for digits to be treated as part
// of the same number. After this window, the pending digit buffer flushes
// to the server and subsequent digits start a new number.
const DIGIT_BUFFER_COMMIT_MS = 600;

// After a `+`/`-` step, we let a short burst of further +/- presses batch
// into a single server write. Matches the debounce on the click-controls.
const STEPPER_COMMIT_MS = 500;

type EditableTag = "INPUT" | "TEXTAREA" | "SELECT";

// Reverse lookup from the canonical `storage_location` string on an
// inventory row to the filter key used by the toggle bar.
const STORAGE_LOCATION_TO_FILTER_KEY = new Map<string, InventoryFilterKey>(
  (Object.entries(STORAGE_LOCATION_BY_FILTER_KEY) as [
    InventoryFilterKey,
    string,
  ][]).map(([key, location]) => [location, key]),
);

function filterKeyFromStorageLocation(
  location: string | null | undefined,
): InventoryFilterKey | null {
  if (!location) return null;
  return STORAGE_LOCATION_TO_FILTER_KEY.get(location) ?? null;
}

// Ingredients that have no inventory row yet still need to show up under
// some filter — infer from the ingredient-category grouping the inventory
// UI already uses elsewhere.
function filterKeyFromInventoryGroup(
  ingredient: IngredientRow,
): InventoryFilterKey | null {
  const group = getInventoryGroup(ingredient);
  if (group === "Fridge") return "fridge";
  if (group === "Freezer") return "freezer";
  if (group === "Pantry") return "shallowPantry";
  return "other";
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName as EditableTag;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Given the currently selected row's DOM rect and the set of all visible
 * rows, pick the nearest row in the requested direction.
 *
 * For vertical moves we prefer candidates whose horizontal overlap with
 * the source is largest (same visual column), then the smallest vertical
 * gap. For horizontal moves we do the mirror: prefer vertical overlap
 * (same visual row), then smallest horizontal gap.
 */
function pickNeighbour(
  direction: "up" | "down" | "left" | "right",
  source: DOMRect,
  candidates: { id: number; rect: DOMRect }[],
): number | null {
  const sourceCx = source.left + source.width / 2;
  const sourceCy = source.top + source.height / 2;

  let best: { id: number; score: number } | null = null;

  for (const c of candidates) {
    const cx = c.rect.left + c.rect.width / 2;
    const cy = c.rect.top + c.rect.height / 2;

    const dx = cx - sourceCx;
    const dy = cy - sourceCy;

    // Directional filter — candidate must be on the correct side of the
    // source by at least a couple of pixels so we don't jump onto ourselves.
    if (direction === "up" && dy >= -2) continue;
    if (direction === "down" && dy <= 2) continue;
    if (direction === "left" && dx >= -2) continue;
    if (direction === "right" && dx <= 2) continue;

    let primary: number; // distance along the travel axis
    let secondary: number; // offset along the perpendicular axis

    if (direction === "up" || direction === "down") {
      primary = Math.abs(dy);
      secondary = Math.abs(dx);
    } else {
      primary = Math.abs(dx);
      secondary = Math.abs(dy);
    }

    // Weight perpendicular offset heavily so we strongly prefer staying in
    // the same visual column (for up/down) or row (for left/right).
    const score = primary + secondary * 4;

    if (best === null || score < best.score) {
      best = { id: c.id, score };
    }
  }

  return best ? best.id : null;
}

export function InventoryView({ ingredients, inventory }: Props) {
  const [filters, setFilters] =
    useState<InventoryFilterState>(DEFAULT_INVENTORY_FILTERS);
  const [viewMode, setViewMode] = useState<InventoryViewMode>("list");
  const [selectedIngredientId, setSelectedIngredientId] = useState<
    number | null
  >(null);

  // Optimistic quantity overrides keyed by ingredient id. Populated when the
  // keyboard controller mutates stock so the rendered number updates
  // instantly; cleared once the server-truth `inventory` prop catches up.
  const [qtyOverrides, setQtyOverrides] = useState<Record<number, number>>({});

  const [, startTransition] = useTransition();

  // Display-layer inventory that merges any optimistic overrides over the
  // server truth. Everything downstream (category view, detail sheet) reads
  // from this so the UI stays consistent during rapid-fire key input.
  const displayInventory = useMemo<InventoryItemRow[]>(() => {
    const ids = Object.keys(qtyOverrides);
    if (ids.length === 0) return inventory;
    const byIngredient = new Map<number, InventoryItemRow>();
    for (const row of inventory) byIngredient.set(row.ingredient_id, row);
    const next = inventory.map((row) => {
      const override = qtyOverrides[row.ingredient_id];
      if (override == null) return row;
      return { ...row, quantity: override } as InventoryItemRow;
    });
    // If the override is for an ingredient that has no inventory row yet
    // (first-ever stock change), synthesize a transient row so the display
    // can show the optimistic value. The real row is created by the server
    // action and will replace this on the next refresh.
    for (const [idStr, qty] of Object.entries(qtyOverrides)) {
      const id = Number(idStr);
      if (!byIngredient.has(id)) {
        next.push({
          id: -id,
          ingredient_id: id,
          quantity: qty,
          unit: null,
          storage_location: null,
          recipe_unit: null,
        } as unknown as InventoryItemRow);
      }
    }
    return next;
  }, [inventory, qtyOverrides]);

  // Drop overrides whose value has been reflected by the server, or whose
  // ingredient no longer exists. This is a legitimate "sync external state
  // (server-truth inventory) back into our optimistic override cache" case;
  // the functional setState is a no-op when nothing changed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQtyOverrides((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      let changed = false;
      const next: Record<number, number> = {};
      const byIngredient = new Map<number, InventoryItemRow>();
      for (const row of inventory) byIngredient.set(row.ingredient_id, row);
      for (const idStr of ids) {
        const id = Number(idStr);
        const override = prev[id];
        const serverRow = byIngredient.get(id);
        const serverQty =
          serverRow?.quantity != null ? Number(serverRow.quantity) : 0;
        if (serverQty === override) {
          changed = true;
          continue;
        }
        next[id] = override;
      }
      return changed ? next : prev;
    });
  }, [inventory]);

  // Map ingredient id -> the set of storage-location filter keys it currently
  // lives in. Preferred source is inventory rows; when an ingredient has no
  // rows yet we fall back to inferring from its ingredient category so the
  // UI isn't empty before the user ever sets a location.
  const locationsByIngredient = useMemo(() => {
    const result = new Map<number, Set<InventoryFilterKey>>();

    for (const row of displayInventory) {
      const key = filterKeyFromStorageLocation(row.storage_location);
      if (!key) continue;
      const existing = result.get(row.ingredient_id);
      if (existing) existing.add(key);
      else result.set(row.ingredient_id, new Set([key]));
    }

    for (const ing of ingredients) {
      if (result.has(ing.id)) continue;
      const fallback = filterKeyFromInventoryGroup(ing);
      if (fallback) result.set(ing.id, new Set([fallback]));
    }

    return result;
  }, [displayInventory, ingredients]);

  const filteredIngredients = useMemo(() => {
    // `null` means "no single filter is active" — show everything.
    if (filters == null) return ingredients;
    const activeKey = filters;

    const variantsByParent = new Map<number, IngredientRow[]>();
    for (const ing of ingredients) {
      if (ing.parent_ingredient_id) {
        const arr = variantsByParent.get(ing.parent_ingredient_id) ?? [];
        arr.push(ing);
        variantsByParent.set(ing.parent_ingredient_id, arr);
      }
    }

    const groupVisible = (root: IngredientRow): boolean => {
      const variants = variantsByParent.get(root.id) ?? [];
      const ids = [root.id, ...variants.map((v) => v.id)];
      return ids.some((id) => locationsByIngredient.get(id)?.has(activeKey));
    };

    const includedRootIds = new Set<number>();
    for (const ing of ingredients) {
      if (!ing.parent_ingredient_id && groupVisible(ing)) {
        includedRootIds.add(ing.id);
      }
    }

    return ingredients.filter((ing) => {
      if (!ing.parent_ingredient_id) return includedRootIds.has(ing.id);
      return includedRootIds.has(ing.parent_ingredient_id);
    });
  }, [ingredients, filters, locationsByIngredient]);

  const hasRows = filteredIngredients.some((ing) => !ing.parent_ingredient_id);

  // -------- Keyboard controller ------------------------------------------
  //
  // Pending-write plumbing. Both the digit buffer and the +/- stepper share
  // the same commit queue: at any time there is at most one pending server
  // write per ingredient. Moving the selection (or closing the sheet)
  // flushes whatever is pending so the user never loses a change.
  const pendingWriteRef = useRef<{
    ingredientId: number;
    inventoryId: number | "";
    value: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  // Digit buffer state — held in refs because it's a purely transient input
  // stream that should not trigger re-renders on every keystroke.
  const digitBufferRef = useRef<string>("");
  const digitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingWrite = useCallback(() => {
    const p = pendingWriteRef.current;
    if (!p) return;
    if (p.timer) {
      clearTimeout(p.timer);
      p.timer = null;
    }
    const { ingredientId, inventoryId, value } = p;
    pendingWriteRef.current = null;
    startTransition(async () => {
      const r = await updateInventoryQuantityFieldAction(
        ingredientId,
        inventoryId,
        "quantity",
        value,
      );
      if (!r.ok) {
        toast.error(r.error);
        // Roll back the optimistic override on failure so the display
        // returns to server truth.
        setQtyOverrides((prev) => {
          if (prev[ingredientId] == null) return prev;
          const next = { ...prev };
          delete next[ingredientId];
          return next;
        });
      }
    });
  }, []);

  const clearDigitBuffer = useCallback(() => {
    digitBufferRef.current = "";
    if (digitTimerRef.current) {
      clearTimeout(digitTimerRef.current);
      digitTimerRef.current = null;
    }
  }, []);

  // Schedule an optimistic write. If one is already queued for the same
  // ingredient we just refresh the value and reset the timer. If it's for a
  // different ingredient we flush that one first — this is the branch that
  // matters when the user hits arrow keys mid-entry.
  const scheduleWrite = useCallback(
    (
      ingredientId: number,
      inventoryId: number | "",
      value: number,
      delayMs: number,
    ) => {
      const existing = pendingWriteRef.current;
      if (existing && existing.ingredientId !== ingredientId) {
        flushPendingWrite();
      }
      if (pendingWriteRef.current?.timer) {
        clearTimeout(pendingWriteRef.current.timer);
      }
      pendingWriteRef.current = {
        ingredientId,
        inventoryId,
        value,
        timer: setTimeout(() => {
          flushPendingWrite();
        }, delayMs),
      };
    },
    [flushPendingWrite],
  );

  // Flush everything on unmount so no edit is lost if the user navigates
  // away mid-stream.
  useEffect(() => {
    return () => {
      if (digitTimerRef.current) clearTimeout(digitTimerRef.current);
      flushPendingWrite();
    };
  }, [flushPendingWrite]);

  const selectedIngredient = useMemo(
    () => ingredients.find((i) => i.id === selectedIngredientId) ?? null,
    [ingredients, selectedIngredientId],
  );

  const selectedInvRow = useMemo(() => {
    if (!selectedIngredientId) return null;
    return (
      displayInventory.find(
        (r) => r.ingredient_id === selectedIngredientId,
      ) ?? null
    );
  }, [displayInventory, selectedIngredientId]);

  // Read the currently-displayed quantity for the selected ingredient,
  // preferring the optimistic override over the server row. Used by the
  // +/- stepper and the digit buffer as their starting point.
  const readCurrentQty = useCallback(
    (ingredientId: number): number => {
      const override = qtyOverrides[ingredientId];
      if (override != null) return override;
      const row = inventory.find((r) => r.ingredient_id === ingredientId);
      const q = row?.quantity != null ? Number(row.quantity) : 0;
      return Number.isFinite(q) && q >= 0 ? q : 0;
    },
    [qtyOverrides, inventory],
  );

  const resolveInventoryIdForWrite = useCallback(
    (ingredientId: number): number | "" => {
      const row = inventory.find((r) => r.ingredient_id === ingredientId);
      // We only pass a real numeric id to the action — negative synthetic
      // ids from the optimistic layer are treated as "no row yet" so the
      // server resolves or creates the correct row.
      return row && typeof row.id === "number" && row.id > 0 ? row.id : "";
    },
    [inventory],
  );

  const setOptimisticQty = useCallback(
    (ingredientId: number, value: number) => {
      setQtyOverrides((prev) => ({ ...prev, [ingredientId]: value }));
    },
    [],
  );

  // Navigate using the DOM-measured spatial algorithm. Pulls all visible
  // ingredient rows from the current category view and picks the nearest
  // neighbour in the requested direction.
  const navigateSpatially = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      if (selectedIngredientId == null) return;
      const container = document.querySelector(".inventory-category-view");
      if (!container) return;
      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-ingredient-id]"),
      );
      if (nodes.length === 0) return;

      const sourceNode = nodes.find(
        (n) => Number(n.dataset.ingredientId) === selectedIngredientId,
      );
      if (!sourceNode) return;

      const sourceRect = sourceNode.getBoundingClientRect();
      const candidates: { id: number; rect: DOMRect }[] = [];
      for (const n of nodes) {
        const id = Number(n.dataset.ingredientId);
        if (!Number.isFinite(id) || id === selectedIngredientId) continue;
        candidates.push({ id, rect: n.getBoundingClientRect() });
      }

      const nextId = pickNeighbour(direction, sourceRect, candidates);
      if (nextId == null) return;

      // Before moving, flush any pending digit entry / stepper burst for
      // the row we are leaving.
      clearDigitBuffer();
      flushPendingWrite();

      setSelectedIngredientId(nextId);

      // Move focus onto the new row's name button so the old row releases
      // :focus-within and only the current selection is highlighted. Also
      // scrolls the new row into view — block: "nearest" keeps the motion
      // minimal if it's already visible.
      requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(
          `.inventory-category-view [data-ingredient-id="${nextId}"]`,
        );
        if (!target) return;
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        const nameBtn = target.querySelector<HTMLButtonElement>(
          ".inv-cat-row-name",
        );
        nameBtn?.focus({ preventScroll: true });
      });
    },
    [selectedIngredientId, clearDigitBuffer, flushPendingWrite],
  );

  const stepQty = useCallback(
    (delta: 1 | -1) => {
      if (selectedIngredientId == null) return;
      // Digit-entry and stepping are mutually exclusive interaction modes —
      // starting a step abandons any half-typed number rather than trying
      // to merge them.
      clearDigitBuffer();
      const current = readCurrentQty(selectedIngredientId);
      const next = Math.max(0, current + delta);
      if (next === current) return;
      setOptimisticQty(selectedIngredientId, next);
      scheduleWrite(
        selectedIngredientId,
        resolveInventoryIdForWrite(selectedIngredientId),
        next,
        STEPPER_COMMIT_MS,
      );
    },
    [
      selectedIngredientId,
      readCurrentQty,
      setOptimisticQty,
      scheduleWrite,
      resolveInventoryIdForWrite,
      clearDigitBuffer,
    ],
  );

  const appendDigit = useCallback(
    (digit: string) => {
      if (selectedIngredientId == null) return;
      if (digitBufferRef.current.length >= DIGIT_BUFFER_MAX_LEN) return;

      // First digit after any prior interaction starts a fresh number —
      // "typing 2 then 4" replaces current stock with 24, never appends to
      // the existing count.
      digitBufferRef.current += digit;
      const value = Number(digitBufferRef.current);
      if (!Number.isFinite(value) || value < 0) return;

      setOptimisticQty(selectedIngredientId, value);
      scheduleWrite(
        selectedIngredientId,
        resolveInventoryIdForWrite(selectedIngredientId),
        value,
        DIGIT_BUFFER_COMMIT_MS,
      );

      if (digitTimerRef.current) clearTimeout(digitTimerRef.current);
      digitTimerRef.current = setTimeout(() => {
        // Timer fires only to close the accumulation window; the write
        // itself is already scheduled above. We just reset the buffer so
        // the next digit starts a new number.
        digitBufferRef.current = "";
        digitTimerRef.current = null;
      }, DIGIT_BUFFER_COMMIT_MS);
    },
    [
      selectedIngredientId,
      setOptimisticQty,
      scheduleWrite,
      resolveInventoryIdForWrite,
    ],
  );

  const popDigit = useCallback(() => {
    if (selectedIngredientId == null) return;
    if (digitBufferRef.current.length === 0) return;
    digitBufferRef.current = digitBufferRef.current.slice(0, -1);
    const value =
      digitBufferRef.current.length === 0 ? 0 : Number(digitBufferRef.current);
    if (!Number.isFinite(value)) return;
    setOptimisticQty(selectedIngredientId, value);
    scheduleWrite(
      selectedIngredientId,
      resolveInventoryIdForWrite(selectedIngredientId),
      value,
      DIGIT_BUFFER_COMMIT_MS,
    );
  }, [
    selectedIngredientId,
    setOptimisticQty,
    scheduleWrite,
    resolveInventoryIdForWrite,
  ]);

  useEffect(() => {
    if (selectedIngredientId == null) return;

    function onKey(e: KeyboardEvent) {
      // Do not hijack typing inside the rename field, quantity inputs, or
      // any select/contenteditable the user has explicitly focused.
      if (isEditableTarget(e.target)) return;

      // Modifier combinations are reserved for the browser / OS.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

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
        clearDigitBuffer();
        flushPendingWrite();
        setSelectedIngredientId(null);
        return;
      }

      if (e.key === "Enter") {
        if (digitBufferRef.current.length > 0 || pendingWriteRef.current) {
          e.preventDefault();
          clearDigitBuffer();
          flushPendingWrite();
        }
        return;
      }

      // Stepper keys. We accept both the shifted and unshifted variants
      // that sit on the same physical keys on a US keyboard so it feels
      // natural on a laptop.
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepQty(1);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        stepQty(-1);
        return;
      }

      if (e.key === "Backspace") {
        if (digitBufferRef.current.length > 0) {
          e.preventDefault();
          popDigit();
        }
        return;
      }

      if (e.key.length === 1 && e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        appendDigit(e.key);
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedIngredientId,
    navigateSpatially,
    stepQty,
    appendDigit,
    popDigit,
    clearDigitBuffer,
    flushPendingWrite,
  ]);

  // Selecting a new row mid-entry flushes the old one so pending changes
  // are not left behind.
  const handleSelectIngredient = useCallback(
    (id: number | null) => {
      clearDigitBuffer();
      flushPendingWrite();
      setSelectedIngredientId(id);
    },
    [clearDigitBuffer, flushPendingWrite],
  );

  const sheetOpen = selectedIngredient != null;

  return (
    <>
      <div
        className="inventory-view-shell"
        data-sheet-open={sheetOpen ? "true" : "false"}
      >
        <div className="inventory-view-controls">
          <InventoryFilterBar value={filters} onChange={setFilters} />
          <InventoryViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
        {viewMode === "table" ? (
          <>
            <InventoryTableView
              ingredients={filteredIngredients}
              inventory={displayInventory}
              selectedIngredientId={selectedIngredientId}
              onSelectIngredient={(id) => handleSelectIngredient(id)}
            />
            {!hasRows && (
              <p className="inventory-filter-empty" role="status">
                No ingredients match your filters.
              </p>
            )}
          </>
        ) : (
          <InventoryCategoryView
            ingredients={filteredIngredients}
            inventory={displayInventory}
            selectedIngredientId={selectedIngredientId}
            onSelectIngredient={(id) => handleSelectIngredient(id)}
          />
        )}
      </div>
      {selectedIngredient && (
        <InventoryDetailSheet
          ingredient={selectedIngredient}
          inventoryItem={selectedInvRow}
          onClose={() => handleSelectIngredient(null)}
        />
      )}
    </>
  );
}
