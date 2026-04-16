/**
 * When the first sentence-style break is a period or colon followed by whitespace,
 * and that delimiter occurs within the first 30 character positions, split the
 * body into an emphasized intro (through the delimiter) and the remainder.
 */
export type InstructionIntroSplit = { intro: string; rest: string };

/** Delimiter index must be &lt; this value for the intro to qualify. */
export const INSTRUCTION_INTRO_MAX_DELIMITER_INDEX = 30;

export function splitInstructionIntro(body: string): InstructionIntroSplit | null {
  const m = /[.:]\s/.exec(body);
  if (!m || m.index >= INSTRUCTION_INTRO_MAX_DELIMITER_INDEX) return null;
  const i = m.index;
  const afterBreak = i + m[0].length;
  return {
    intro: body.slice(0, i + 1),
    rest: body.slice(afterBreak),
  };
}
