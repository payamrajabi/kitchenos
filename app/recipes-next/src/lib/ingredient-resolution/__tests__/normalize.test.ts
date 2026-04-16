import { describe, expect, it } from "vitest";
import {
  normalizeForMatch,
  cleanDisplayName,
  deterministicMatch,
  toTitleCaseAP,
} from "../normalize";

describe("normalizeForMatch", () => {
  it("treats case differences as identical", () => {
    expect(normalizeForMatch("Soy Milk")).toBe(normalizeForMatch("soy milk"));
    expect(normalizeForMatch("SOY MILK")).toBe(normalizeForMatch("Soy Milk"));
  });

  it("treats hyphens the same as spaces", () => {
    expect(normalizeForMatch("All-Purpose Flour")).toBe(
      normalizeForMatch("All Purpose Flour"),
    );
  });

  it("handles basic plurals", () => {
    expect(normalizeForMatch("Tomatoes")).toBe(normalizeForMatch("Tomato"));
    expect(normalizeForMatch("Eggs")).toBe(normalizeForMatch("Egg"));
    expect(normalizeForMatch("Berries")).toBe(normalizeForMatch("Berry"));
    expect(normalizeForMatch("Leaves")).toBe(normalizeForMatch("Leaf"));
  });

  it("strips package sizes", () => {
    expect(normalizeForMatch("14oz Diced Tomatoes")).toBe(
      normalizeForMatch("Diced Tomatoes"),
    );
    expect(normalizeForMatch("400 ml Coconut Milk")).toBe(
      normalizeForMatch("Coconut Milk"),
    );
    expect(normalizeForMatch("1.5 kg Chicken Breast")).toBe(
      normalizeForMatch("Chicken Breast"),
    );
  });

  it("strips known prefixes like fresh, organic, raw", () => {
    expect(normalizeForMatch("Fresh Basil")).toBe(normalizeForMatch("Basil"));
    expect(normalizeForMatch("Organic Chicken")).toBe(
      normalizeForMatch("Chicken"),
    );
    expect(normalizeForMatch("Raw Honey")).toBe(normalizeForMatch("Honey"));
  });

  it("ignores word order", () => {
    expect(normalizeForMatch("Red Bell Pepper")).toBe(
      normalizeForMatch("Bell Pepper Red"),
    );
  });

  it("collapses whitespace", () => {
    expect(normalizeForMatch("  Soy   Milk  ")).toBe(
      normalizeForMatch("Soy Milk"),
    );
  });

  it("treats accented and non-accented characters as identical", () => {
    expect(normalizeForMatch("Jalapeño")).toBe(
      normalizeForMatch("Jalapeno"),
    );
    expect(normalizeForMatch("jalapeño")).toBe(
      normalizeForMatch("Jalapeños"),
    );
    expect(normalizeForMatch("Crème Fraîche")).toBe(
      normalizeForMatch("Creme Fraiche"),
    );
  });

  it("does NOT collapse different ingredients into the same key", () => {
    expect(normalizeForMatch("Milk")).not.toBe(normalizeForMatch("Soy Milk"));
    expect(normalizeForMatch("Butter")).not.toBe(
      normalizeForMatch("Peanut Butter"),
    );
    expect(normalizeForMatch("Garlic")).not.toBe(
      normalizeForMatch("Garlic Powder"),
    );
  });
});

describe("cleanDisplayName", () => {
  it("strips package sizes but keeps case and order", () => {
    expect(cleanDisplayName("14oz Diced Tomatoes")).toBe("Diced Tomatoes");
    expect(cleanDisplayName("400 ml Coconut Milk")).toBe("Coconut Milk");
  });

  it("trims whitespace", () => {
    expect(cleanDisplayName("  Soy Milk  ")).toBe("Soy Milk");
  });

  it("leaves normal names unchanged", () => {
    expect(cleanDisplayName("Chicken Breast")).toBe("Chicken Breast");
  });
});

describe("toTitleCaseAP", () => {
  it("capitalises simple ingredient names", () => {
    expect(toTitleCaseAP("soy milk")).toBe("Soy Milk");
    expect(toTitleCaseAP("tomato paste")).toBe("Tomato Paste");
    expect(toTitleCaseAP("CHICKEN BREAST")).toBe("Chicken Breast");
  });

  it("keeps AP-style small words lowercase", () => {
    expect(toTitleCaseAP("salt and pepper")).toBe("Salt and Pepper");
    expect(toTitleCaseAP("cream of mushroom soup")).toBe(
      "Cream of Mushroom Soup",
    );
  });

  it("always capitalises the first word", () => {
    expect(toTitleCaseAP("of the earth")).toBe("Of the Earth");
  });

  it("handles single-word names", () => {
    expect(toTitleCaseAP("salt")).toBe("Salt");
    expect(toTitleCaseAP("GARLIC")).toBe("Garlic");
  });

  it("handles extra whitespace", () => {
    expect(toTitleCaseAP("  extra  virgin  olive oil  ")).toBe(
      "Extra Virgin Olive Oil",
    );
  });
});

describe("deterministicMatch", () => {
  const inventory = [
    { id: 1, name: "Soy Milk" },
    { id: 2, name: "Salted Butter" },
    { id: 3, name: "Bell Pepper" },
    { id: 4, name: "All-Purpose Flour" },
    { id: 5, name: "Egg" },
  ];

  it("matches exact names (case-insensitive)", () => {
    const result = deterministicMatch(["soy milk", "SALTED BUTTER"], inventory);
    expect(result.get("soy milk")?.id).toBe(1);
    expect(result.get("SALTED BUTTER")?.id).toBe(2);
  });

  it("matches plurals", () => {
    const result = deterministicMatch(["Eggs"], inventory);
    expect(result.get("Eggs")?.id).toBe(5);
  });

  it("matches hyphen vs space", () => {
    const result = deterministicMatch(["All Purpose Flour"], inventory);
    expect(result.get("All Purpose Flour")?.id).toBe(4);
  });

  it("does not match unrelated ingredients", () => {
    const result = deterministicMatch(["Whole Milk", "Fish Sauce"], inventory);
    expect(result.has("Whole Milk")).toBe(false);
    expect(result.has("Fish Sauce")).toBe(false);
  });

  it("returns empty map when nothing matches", () => {
    const result = deterministicMatch(["Quinoa", "Tofu"], inventory);
    expect(result.size).toBe(0);
  });
});
