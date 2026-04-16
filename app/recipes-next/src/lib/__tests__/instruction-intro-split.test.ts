import { describe, expect, it } from "vitest";
import { splitInstructionIntro } from "@/lib/instruction-intro-split";

describe("splitInstructionIntro", () => {
  it("splits on first period+space when delimiter is before index 30", () => {
    const s = splitInstructionIntro("Start the rice. Cook a pot of rice.");
    expect(s).toEqual({
      intro: "Start the rice.",
      rest: "Cook a pot of rice.",
    });
  });

  it("splits on colon+space", () => {
    const s = splitInstructionIntro("Note: do this first. Then continue.");
    expect(s).toEqual({
      intro: "Note:",
      rest: "do this first. Then continue.",
    });
  });

  it("returns null when the delimiter is at index 30 or later", () => {
    const at30 = "x".repeat(30) + ". ";
    expect(splitInstructionIntro(at30 + "rest")).toBeNull();
    const at29 = "x".repeat(29) + ". ";
    expect(splitInstructionIntro(at29 + "rest")).not.toBeNull();
  });

  it("returns null when there is no period or colon followed by whitespace", () => {
    expect(splitInstructionIntro("No break here")).toBeNull();
    expect(splitInstructionIntro("Ends with dot only.")).toBeNull();
  });
});
