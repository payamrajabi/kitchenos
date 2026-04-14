/**
 * Classify stock units for whether we should resolve **edible gram weight**
 * from FDC foodPortions (count-like units). Macros stay per 100 g in storage.
 */

const MASS_UNITS = new Set(["g", "kg", "oz", "lb"]);
const VOLUME_UNITS = new Set(["ml", "l", "fl oz", "cup", "tsp", "tbsp"]);
const COUNT_UNITS = new Set([
  "count",
  "ea",
  "piece",
  "dozen",
  "whole",
  "clove",
  "slice",
  "sprig",
  "pinch",
  "head",
  "bunch",
]);

export function isCountBasedUnit(unit: string | null): boolean {
  if (!unit) return false;
  const u = unit.trim().toLowerCase();
  return COUNT_UNITS.has(u) || (!MASS_UNITS.has(u) && !VOLUME_UNITS.has(u));
}
