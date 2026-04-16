/** Matches "1. Do something" / indented numbered lines (same as recipe read view). */
const ORDERED_LINE = /^(\s*)(\d+)\.\s(.*)$/;

/**
 * Split legacy `recipes.instructions` text into ordered step bodies.
 * Numbered blocks become one entry per line; non-numbered paragraphs become one entry each.
 */
export function parseLegacyInstructionsToSteps(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const steps: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (ORDERED_LINE.test(line)) {
      while (i < rawLines.length) {
        const l = rawLines[i];
        const m = l.match(ORDERED_LINE);
        if (!m) break;
        steps.push(m[3].replace(/\s+$/, ""));
        i++;
      }
    } else {
      const para: string[] = [];
      while (i < rawLines.length) {
        const l = rawLines[i];
        if (ORDERED_LINE.test(l)) break;
        para.push(l);
        i++;
      }
      const joined = para.join("\n").trim();
      if (joined) steps.push(joined);
    }
  }
  const trimmedAll = text.trim();
  if (steps.length === 0 && trimmedAll) {
    return [trimmedAll];
  }
  return steps;
}

/** Single-line numbered export for `recipes.instructions` (community / legacy readers). */
export function formatInstructionStepsToRecipeText(steps: string[]): string {
  if (!steps.length) return "";
  return steps
    .map((body, idx) => {
      const flat = body
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join(" ");
      return `${idx + 1}. ${flat}`;
    })
    .join("\n");
}
