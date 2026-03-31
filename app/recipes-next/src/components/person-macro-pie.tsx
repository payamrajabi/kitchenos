import type { PersonMacroCalories } from "@/lib/people-macros";

const COLORS = {
  protein: "#FF7D55",
  fat: "#FFC112",
  carb: "#00B474",
} as const;

type Props = {
  name: string;
  macros: PersonMacroCalories;
};

export function PersonMacroPie({ name, macros }: Props) {
  const { proteinCal, fatCal, carbCal } = macros;
  const total = proteinCal + fatCal + carbCal;
  const vb = 100;
  const cx = vb / 2;
  const cy = vb / 2;
  const r = 42;

  const parts: { value: number; color: string; key: string }[] = [];
  if (proteinCal > 0) parts.push({ value: proteinCal, color: COLORS.protein, key: "protein" });
  if (fatCal > 0) parts.push({ value: fatCal, color: COLORS.fat, key: "fat" });
  if (carbCal > 0) parts.push({ value: carbCal, color: COLORS.carb, key: "carb" });

  const effectiveTotal = total > 0 ? total : 1;
  const slices =
    parts.length > 0
      ? parts
      : [{ value: 1, color: "#ccc", key: "empty" }];

  const fullCircle =
    slices.length === 1 && slices[0].value >= effectiveTotal - 1e-6;

  let angle = -Math.PI / 2;
  const paths = fullCircle ? (
    <circle cx={cx} cy={cy} r={r} fill={slices[0].color} stroke="var(--paper)" strokeWidth={0.75} />
  ) : (
    slices.map((part, i) => {
      const slice = (part.value / effectiveTotal) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += slice;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const largeArc = slice > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return (
        <path
          key={`${part.key}-${i}`}
          d={d}
          fill={part.color}
          stroke="var(--paper)"
          strokeWidth={0.75}
        />
      );
    })
  );

  const pct = (n: number) =>
    effectiveTotal > 0 ? Math.round((n / effectiveTotal) * 100) : 0;
  const aria = `Macro mix for ${name}: ${pct(proteinCal)}% protein, ${pct(fatCal)}% fat, ${pct(carbCal)}% carbs. Daily target ${macros.targetCalories} calories.`;

  return (
    <svg
      viewBox={`0 0 ${vb} ${vb}`}
      role="img"
      aria-label={aria}
      className="person-macro-pie-svg"
    >
      <title>{aria}</title>
      {paths}
    </svg>
  );
}
