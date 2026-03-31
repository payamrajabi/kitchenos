import { INGREDIENT_UNITS } from "@/lib/unit-mapping";

/** Same options/order as recipe units — label matches value (lowercase, short). */
export const STOCK_UNIT_OPTIONS: { value: string; label: string }[] = INGREDIENT_UNITS.map((u) => ({
  value: u,
  label: u,
}));

export const STOCK_UNIT_VALUES = new Set<string>(INGREDIENT_UNITS);
