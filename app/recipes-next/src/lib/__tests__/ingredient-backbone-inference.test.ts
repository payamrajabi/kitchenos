import { describe, expect, it } from "vitest";
import {
  buildBackboneInsertFieldsFromName,
  inferBackboneDefaultsFromName,
} from "../ingredient-backbone-inference";

describe("inferBackboneDefaultsFromName", () => {
  it("classifies a fresh produce item with sensible storage + shelf life", () => {
    const d = inferBackboneDefaultsFromName("Yellow Onion");
    expect(d.taxonomy_subcategory).toBe("Alliums");
    expect(d.storage_hints).toEqual(["pantry"]);
    expect(d.packaged_common).toBe(false);
    expect(d.is_composite).toBe(false);
  });

  it("lets 'canned' beat the subcategory default (pantry wins over fresh)", () => {
    const d = inferBackboneDefaultsFromName("Canned Black Beans");
    expect(d.taxonomy_subcategory).toBe("Canned Legumes");
    expect(d.storage_hints).toEqual(["pantry"]);
    expect(d.packaged_common).toBe(true);
  });

  it("flags broths as composite + packaged", () => {
    const d = inferBackboneDefaultsFromName("Chicken Broth");
    expect(d.taxonomy_subcategory).toBe("Broths & Stocks");
    expect(d.is_composite).toBe(true);
    expect(d.packaged_common).toBe(true);
  });

  it("returns all-null fields for a totally unknown name", () => {
    const d = inferBackboneDefaultsFromName("Zorgblort");
    expect(d.taxonomy_subcategory).toBeNull();
    expect(d.storage_hints).toBeNull();
    expect(d.default_units).toBeNull();
    expect(d.shelf_life_counter_days).toBeNull();
    expect(d.shelf_life_fridge_days).toBeNull();
    expect(d.shelf_life_freezer_days).toBeNull();
    expect(d.packaged_common).toBe(false);
    expect(d.is_composite).toBe(false);
  });
});

describe("buildBackboneInsertFieldsFromName", () => {
  it("omits null/empty fields so the DB default applies", () => {
    const out = buildBackboneInsertFieldsFromName("Zorgblort");
    expect(out).toEqual({
      packaged_common: false,
      is_composite: false,
    });
    expect("taxonomy_subcategory" in out).toBe(false);
    expect("storage_hints" in out).toBe(false);
    expect("default_units" in out).toBe(false);
    expect("shelf_life_counter_days" in out).toBe(false);
    expect("shelf_life_fridge_days" in out).toBe(false);
    expect("shelf_life_freezer_days" in out).toBe(false);
  });

  it("includes every known field when the rules produce a hit", () => {
    const out = buildBackboneInsertFieldsFromName("Yellow Onion");
    expect(out.taxonomy_subcategory).toBe("Alliums");
    expect(out.storage_hints).toEqual(["pantry"]);
    expect(out.default_units).toEqual(["g", "oz", "lb", "each"]);
    expect(out.packaged_common).toBe(false);
    expect(out.is_composite).toBe(false);
  });

  it("emits shelf life only for the storage surfaces it applies to", () => {
    const out = buildBackboneInsertFieldsFromName("Baby Spinach");
    expect(out.taxonomy_subcategory).toBe("Leafy Greens");
    expect(out.shelf_life_fridge_days).toBe(5);
    expect(out.shelf_life_freezer_days).toBe(180);
    expect("shelf_life_counter_days" in out).toBe(false);
  });

  it("returns an object safe to spread directly into a Supabase insert", () => {
    const out = buildBackboneInsertFieldsFromName("Canned Diced Tomatoes");
    const fake = { name: "Canned Diced Tomatoes", ...out };
    expect(fake.taxonomy_subcategory).toBe("Canned Tomatoes");
    expect(fake.packaged_common).toBe(true);
    expect(fake.storage_hints).toEqual(["pantry"]);
  });
});
