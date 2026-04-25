/**
 * Map kitchenOS shopping list rows to Instacart IDP `line_items[]` payloads.
 *
 * Instacart's IDP accepts a free-form `unit` string but works best with a
 * conventional grocery vocabulary (each, g, kg, ml, l, oz, lb, tsp, tbsp,
 * cup, etc.). Our internal units come from {@link INGREDIENT_UNITS}; we
 * translate the less standard ones (`count`, `ea`, `piece`, `whole`,
 * package-style units like `bag`/`box`/`jar`) to `each` so Instacart treats
 * them as a countable item rather than a weight/volume.
 */

import type { ShoppingListItem } from "@/app/actions/shop";
import type { InstacartLineItem } from "@/lib/instacart/client";

/**
 * Translate an internal kitchenOS unit to the unit string Instacart's IDP
 * expects. Returns `"each"` for missing or unrecognised units.
 */
export function mapUnitToInstacart(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "") return "each";

  // Canonical passthroughs — Instacart accepts these verbatim.
  const passthrough = new Set([
    "g",
    "kg",
    "oz",
    "lb",
    "ml",
    "l",
    "fl oz",
    "cup",
    "tsp",
    "tbsp",
  ]);
  if (passthrough.has(u)) return u;

  // Countable / package-ish units all map to "each".
  const countable = new Set([
    "count",
    "ea",
    "piece",
    "pieces",
    "dozen",
    "whole",
    "clove",
    "slice",
    "sprig",
    "pinch",
    "head",
    "bunch",
    "pkg",
    "package",
    "bag",
    "box",
    "block",
    "tub",
    "container",
    "jar",
    "bottle",
    "can",
    "roll",
    "sleeve",
  ]);
  if (countable.has(u)) return "each";

  // Unknown unit — default to each so Instacart still renders a sensible row.
  return "each";
}

/**
 * Build the IDP `line_items[]` array from the app's shopping list rows,
 * optionally enriching each line with the top-ranked barcode for the
 * ingredient (so Instacart can match to the exact product the user prefers).
 */
export function shoppingListItemsToInstacartLineItems(
  items: ShoppingListItem[],
  barcodesByIngredientId: Map<number, string>,
): InstacartLineItem[] {
  return items.map((item) => {
    const idpUnit = mapUnitToInstacart(item.neededUnit);

    // Instacart expects a positive quantity. The shop action can return
    // fractional amounts (e.g. 0.5 L); those are fine. Guard against 0/NaN.
    const rawQty = Number.isFinite(item.neededAmount) ? item.neededAmount : 0;
    const quantity =
      idpUnit === "each"
        ? Math.max(1, Math.ceil(rawQty))
        : Math.max(0.01, Math.round(rawQty * 100) / 100);

    const line: InstacartLineItem = {
      name: item.ingredientName,
      display_text: item.ingredientName,
      line_item_measurements: [{ quantity, unit: idpUnit }],
    };

    const barcode = barcodesByIngredientId.get(item.ingredientId);
    if (barcode && barcode.trim() !== "") {
      line.upcs = [barcode.trim()];
    }

    return line;
  });
}
