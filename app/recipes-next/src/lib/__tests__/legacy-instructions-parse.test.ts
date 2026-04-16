import { describe, expect, it } from "vitest";
import {
  formatInstructionStepsToRecipeText,
  parseLegacyInstructionsToSteps,
} from "@/lib/legacy-instructions-parse";

describe("parseLegacyInstructionsToSteps", () => {
  it("splits numbered lines into steps", () => {
    const text = `1. First thing
2. Second thing
3. Third`;
    expect(parseLegacyInstructionsToSteps(text)).toEqual([
      "First thing",
      "Second thing",
      "Third",
    ]);
  });

  it("treats unnumbered prose as a single step", () => {
    const text = "Do everything at once.";
    expect(parseLegacyInstructionsToSteps(text)).toEqual(["Do everything at once."]);
  });

  it("round-trips through formatInstructionStepsToRecipeText", () => {
    const steps = ["Toast nuts", "Grind fine"];
    const legacy = formatInstructionStepsToRecipeText(steps);
    expect(parseLegacyInstructionsToSteps(legacy)).toEqual(steps);
  });
});
