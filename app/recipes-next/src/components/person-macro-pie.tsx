"use client";

import { useCallback, useState } from "react";
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

  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const showTip = useCallback((e: React.PointerEvent<SVGElement>, text: string) => {
    setTip({ text, x: e.clientX, y: e.clientY });
  }, []);

  const moveTip = useCallback((e: React.PointerEvent<SVGElement>) => {
    setTip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
  }, []);

  const clearTip = useCallback(() => setTip(null), []);

  const parts: { value: number; color: string; key: string }[] = [];
  if (proteinCal > 0) parts.push({ value: proteinCal, color: COLORS.protein, key: "protein" });
  if (fatCal > 0) parts.push({ value: fatCal, color: COLORS.fat, key: "fat" });
  if (carbCal > 0) parts.push({ value: carbCal, color: COLORS.carb, key: "carb" });

  const effectiveTotal = total > 0 ? total : 1;
  const slices =
    parts.length > 0
      ? parts
      : [{ value: 1, color: "#ccc", key: "empty" }];

  const pctOfPie = (valueCal: number) =>
    effectiveTotal > 0 ? Math.round((valueCal / effectiveTotal) * 100) : 0;

  const segmentHoverTitle = (key: string, valueCal: number) => {
    if (key === "empty") return "No macro targets";
    const label = key === "protein" ? "Protein" : key === "fat" ? "Fat" : "Carb";
    const grams =
      key === "protein"
        ? macros.proteinGrams
        : key === "fat"
          ? macros.fatGrams
          : macros.carbGrams;
    return `${label}, ${Math.round(grams)} g (${pctOfPie(valueCal)}%)`;
  };

  const fullCircle =
    slices.length === 1 && slices[0].value >= effectiveTotal - 1e-6;

  let angle = -Math.PI / 2;
  const paths = fullCircle ? (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={slices[0].color}
      stroke="var(--paper)"
      strokeWidth={0.75}
      className="person-macro-pie-slice"
      onPointerEnter={(e) => showTip(e, segmentHoverTitle(slices[0].key, slices[0].value))}
      onPointerMove={moveTip}
    />
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
      const hoverText = segmentHoverTitle(part.key, part.value);
      return (
        <path
          key={`${part.key}-${i}`}
          d={d}
          fill={part.color}
          stroke="var(--paper)"
          strokeWidth={0.75}
          className="person-macro-pie-slice"
          onPointerEnter={(e) => showTip(e, hoverText)}
          onPointerMove={moveTip}
        />
      );
    })
  );

  const aria = `Macro mix for ${name}: ${pctOfPie(proteinCal)}% protein, ${pctOfPie(fatCal)}% fat, ${pctOfPie(carbCal)}% carbs. Daily target ${macros.targetCalories} calories.`;

  return (
    <div className="person-macro-pie-root">
      {tip ? (
        <div
          className="person-macro-pie-tooltip"
          role="tooltip"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          {tip.text}
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${vb} ${vb}`}
        role="img"
        aria-label={aria}
        className="person-macro-pie-svg"
        onPointerLeave={clearTip}
      >
        {paths}
      </svg>
    </div>
  );
}
