import { describe, it, expect } from "vitest";
import {
  normalizeIngredientName,
  classifyIngredient,
  buildSearchQuery,
} from "../normalize";

describe("normalizeIngredientName", () => {
  it("lowercases and trims", () => {
    expect(normalizeIngredientName("  Chicken Breast  ")).toBe(
      "chicken breast",
    );
  });

  it("strips parenthetical notes", () => {
    expect(normalizeIngredientName("Flour (about 2 cups)")).toBe("flour");
  });

  it("collapses whitespace", () => {
    expect(normalizeIngredientName("sea   salt")).toBe("sea salt");
  });

  it("removes trailing commas", () => {
    expect(normalizeIngredientName("butter, unsalted,")).toBe(
      "butter, unsalted",
    );
  });
});

describe("classifyIngredient", () => {
  it("returns branded when brand field is set", () => {
    expect(classifyIngredient("ketchup", "Heinz")).toBe("branded");
  });

  it("detects brand in name", () => {
    expect(classifyIngredient("heinz ketchup", null)).toBe("branded");
  });

  it("returns generic for plain food", () => {
    expect(classifyIngredient("chicken breast", null)).toBe("generic");
  });
});

describe("buildSearchQuery", () => {
  it("strips filler adjectives", () => {
    expect(buildSearchQuery("organic boneless chicken breast")).toBe(
      "chicken breast",
    );
  });

  it("keeps all tokens when everything would be stripped", () => {
    expect(buildSearchQuery("fresh raw")).toBe("fresh raw");
  });
});
