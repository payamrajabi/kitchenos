import { splitInstructionIntro } from "@/lib/instruction-intro-split";

type Props = {
  body: string;
};

/** Applies intro emphasis when {@link splitInstructionIntro} matches. */
export function InstructionStepFormattedBody({ body }: Props) {
  const split = splitInstructionIntro(body);
  if (!split) return <>{body}</>;
  return (
    <>
      <span className="recipe-instruction-intro">{split.intro}</span>
      {split.rest}
    </>
  );
}
