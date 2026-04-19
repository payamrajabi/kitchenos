"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import type { PersonMacroCalories } from "@/lib/people-macros";
import {
  PIE_SIZE_MAX_PX,
  PIE_SIZE_MIN_PX,
  calorieTargetForSizePx,
  sizePxForCalorieTarget,
} from "@/lib/people-macros";

const COLORS = {
  protein: "#EC008C",
  fat: "#FFF200",
  carb: "#00AEEF",
} as const;

const CAL_PER_PROTEIN_G = 4;
const CAL_PER_FAT_G = 9;
const CAL_PER_CARB_G = 4;

/** Hit tolerances, in CSS pixels (converted from the current pie diameter). */
const EDGE_HIT_PX = 14;
const BOUNDARY_HIT_PX = 10;
/** Minimum slice fraction so a slice never collapses to 0 during a drag. */
const MIN_SLICE_FRAC = 0.03;

const SVG_VB = 100;
const SVG_R = 42;
const TWO_PI = Math.PI * 2;

type MacroDraft = {
  proteinGrams: number;
  fatGrams: number;
  carbGrams: number;
  targetCalories: number;
};

export type PersonMacroPieCommit = MacroDraft;

type Props = {
  name: string;
  macros: PersonMacroCalories;
  /** Explicit pixel size override; defaults to the absolute calorie-target mapping. */
  sizePx?: number;
  /** Enables drag-to-edit. When false the pie renders statically. */
  interactive?: boolean;
  /** Fires once per drag on pointer-up, only if the draft diverged from props. */
  onCommit?: (draft: PersonMacroPieCommit) => void;
  /** Notifies the parent whenever a drag begins or ends. Useful to suppress link clicks. */
  onDragChange?: (isDragging: boolean) => void;
};

type DragKind = "resize" | "boundary-protein" | "boundary-fat";

type DragState = {
  kind: DragKind;
  /** Fractions captured at pointer-down so ratio-preserving math is stable during the drag. */
  initialP: number;
  initialF: number;
  initialC: number;
  initialTargetCal: number;
};

function fractionsFromDraft(draft: MacroDraft) {
  const total =
    draft.proteinGrams * CAL_PER_PROTEIN_G +
    draft.fatGrams * CAL_PER_FAT_G +
    draft.carbGrams * CAL_PER_CARB_G;
  if (total <= 0) return { p: 0, f: 0, c: 0, total: 0 };
  return {
    p: (draft.proteinGrams * CAL_PER_PROTEIN_G) / total,
    f: (draft.fatGrams * CAL_PER_FAT_G) / total,
    c: (draft.carbGrams * CAL_PER_CARB_G) / total,
    total,
  };
}

/** Clockwise fraction [0, 1) measured from 12 o'clock. */
function clockwiseFractionFromVector(dx: number, dy: number) {
  const angle = Math.atan2(dy, dx);
  let frac = (angle + Math.PI / 2) / TWO_PI;
  if (frac < 0) frac += 1;
  if (frac >= 1) frac -= 1;
  return frac;
}

/** Signed circular distance between two fractions, in [-0.5, 0.5]. */
function circularDelta(a: number, b: number) {
  let d = a - b;
  while (d > 0.5) d -= 1;
  while (d < -0.5) d += 1;
  return d;
}

export function PersonMacroPie({
  name,
  macros,
  sizePx,
  interactive = false,
  onCommit,
  onDragChange,
}: Props) {
  const propSize = sizePx ?? sizePxForCalorieTarget(macros.targetCalories);

  const [draft, setDraft] = useState<MacroDraft>(() => ({
    proteinGrams: macros.proteinGrams,
    fatGrams: macros.fatGrams,
    carbGrams: macros.carbGrams,
    targetCalories: macros.targetCalories,
  }));
  const [draftSize, setDraftSize] = useState<number>(propSize);

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );

  // Reconcile with upstream data whenever we're not mid-drag.
  useEffect(() => {
    if (isDragging) return;
    setDraft({
      proteinGrams: macros.proteinGrams,
      fatGrams: macros.fatGrams,
      carbGrams: macros.carbGrams,
      targetCalories: macros.targetCalories,
    });
    setDraftSize(propSize);
  }, [
    isDragging,
    macros.proteinGrams,
    macros.fatGrams,
    macros.carbGrams,
    macros.targetCalories,
    propSize,
  ]);

  useEffect(() => {
    onDragChange?.(isDragging);
  }, [isDragging, onDragChange]);

  const { p: pf, f: ff, c: cf, total: totalCalDraft } =
    fractionsFromDraft(draft);
  const effectiveTotal = totalCalDraft > 0 ? totalCalDraft : 1;
  const hasMacros = totalCalDraft > 0;

  const cx = SVG_VB / 2;
  const cy = SVG_VB / 2;
  const r = SVG_R;

  const draftGramsByKey = useCallback(
    (key: "protein" | "fat" | "carb") =>
      key === "protein"
        ? draft.proteinGrams
        : key === "fat"
          ? draft.fatGrams
          : draft.carbGrams,
    [draft.carbGrams, draft.fatGrams, draft.proteinGrams],
  );

  const segmentLabel = (key: "protein" | "fat" | "carb") => {
    const pct = Math.round(
      ((key === "protein" ? pf : key === "fat" ? ff : cf) || 0) * 100,
    );
    const grams = Math.round(draftGramsByKey(key));
    const label = key === "protein" ? "Protein" : key === "fat" ? "Fat" : "Carb";
    return `${label}, ${grams} g (${pct}%)`;
  };

  /** Convert a client point into "pointer geometry" relative to the pie center. */
  const pointerGeometry = useCallback((clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const pieRadiusPx = (rect.width * r) / SVG_VB;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const distPx = Math.hypot(dx, dy);
    const frac = clockwiseFractionFromVector(dx, dy);
    return { rect, pieRadiusPx, dx, dy, distPx, frac };
  }, []);

  /** Classify where the pointer is at drag-start: edge, a boundary, or nothing. */
  const classifyHit = useCallback(
    (clientX: number, clientY: number): DragKind | null => {
      const g = pointerGeometry(clientX, clientY);
      if (!g) return null;

      if (Math.abs(g.distPx - g.pieRadiusPx) <= EDGE_HIT_PX) {
        return "resize";
      }

      if (!hasMacros) return null;
      if (g.distPx > g.pieRadiusPx * 0.98) return null;
      if (g.distPx < g.pieRadiusPx * 0.1) return null;

      const bounds: Array<{ kind: DragKind; at: number }> = [
        { kind: "boundary-protein", at: pf },
        { kind: "boundary-fat", at: pf + ff },
      ];

      let best: { kind: DragKind; perpPx: number } | null = null;
      for (const b of bounds) {
        const delta = circularDelta(g.frac, b.at);
        const perpPx = Math.abs(Math.sin(delta * TWO_PI)) * g.distPx;
        if (perpPx <= BOUNDARY_HIT_PX && (!best || perpPx < best.perpPx)) {
          best = { kind: b.kind, perpPx };
        }
      }
      return best?.kind ?? null;
    },
    [ff, hasMacros, pf, pointerGeometry],
  );

  const commit = useCallback(
    (finalDraft: MacroDraft) => {
      if (!onCommit) return;
      const changed =
        Math.abs(finalDraft.proteinGrams - macros.proteinGrams) > 0.5 ||
        Math.abs(finalDraft.fatGrams - macros.fatGrams) > 0.5 ||
        Math.abs(finalDraft.carbGrams - macros.carbGrams) > 0.5 ||
        Math.abs(finalDraft.targetCalories - macros.targetCalories) > 5;
      if (!changed) return;
      onCommit(finalDraft);
    },
    [
      macros.carbGrams,
      macros.fatGrams,
      macros.proteinGrams,
      macros.targetCalories,
      onCommit,
    ],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!interactive) return;
      const kind = classifyHit(e.clientX, e.clientY);
      if (!kind) return;

      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

      dragRef.current = {
        kind,
        initialP: pf,
        initialF: ff,
        initialC: cf,
        initialTargetCal: draft.targetCalories || macros.targetCalories || 0,
      };
      setIsDragging(true);
      setTip({
        text:
          kind === "resize"
            ? `Target ${Math.round(draft.targetCalories)} cal`
            : segmentLabel(
                kind === "boundary-protein" ? "protein" : "fat",
              ),
        x: e.clientX,
        y: e.clientY,
      });
    },
    // segmentLabel closes over draft; fine to recompute on each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cf, classifyHit, draft.targetCalories, ff, interactive, macros.targetCalories, pf],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!interactive) return;
      const drag = dragRef.current;
      if (!drag) return;
      const g = pointerGeometry(e.clientX, e.clientY);
      if (!g) return;

      if (drag.kind === "resize") {
        const newSize = Math.max(
          PIE_SIZE_MIN_PX,
          Math.min(PIE_SIZE_MAX_PX, g.distPx * 2),
        );
        const newCal = calorieTargetForSizePx(newSize);
        const prevTotal = drag.initialTargetCal;
        if (prevTotal > 0) {
          const scale = newCal / prevTotal;
          setDraft({
            proteinGrams: macros.proteinGrams * scale,
            fatGrams: macros.fatGrams * scale,
            carbGrams: macros.carbGrams * scale,
            targetCalories: newCal,
          });
        } else {
          setDraft((d) => ({ ...d, targetCalories: newCal }));
        }
        setDraftSize(newSize);
        setTip({ text: `Target ${newCal} cal`, x: e.clientX, y: e.clientY });
        return;
      }

      // Redistribute: protein/fat boundary drags (carb absorbs remainder in ratio).
      const clampMaxP = 1 - 2 * MIN_SLICE_FRAC;
      let newP = drag.initialP;
      let newF = drag.initialF;
      let newC = drag.initialC;

      if (drag.kind === "boundary-protein") {
        newP = Math.max(MIN_SLICE_FRAC, Math.min(clampMaxP, g.frac));
        const remaining = 1 - newP;
        const otherSum = drag.initialF + drag.initialC || 1;
        const fShare = drag.initialF / otherSum;
        newF = Math.max(MIN_SLICE_FRAC, remaining * fShare);
        newC = Math.max(MIN_SLICE_FRAC, remaining - newF);
      } else {
        // boundary-fat: X = newP + newF = protein+fat cumulative
        const otherSum = drag.initialP + drag.initialC || 1;
        const pShare = drag.initialP / otherSum;
        // newP = (1 - newF) * pShare; newP + newF = X  =>  newF = (X - pShare)/(1 - pShare)
        const X = Math.max(MIN_SLICE_FRAC * 2, Math.min(1 - MIN_SLICE_FRAC, g.frac));
        const denom = 1 - pShare || 1;
        let computedF = (X - pShare) / denom;
        computedF = Math.max(MIN_SLICE_FRAC, Math.min(clampMaxP, computedF));
        newF = computedF;
        newP = Math.max(MIN_SLICE_FRAC, (1 - newF) * pShare);
        newC = Math.max(MIN_SLICE_FRAC, 1 - newP - newF);
      }

      const target = drag.initialTargetCal;
      if (target > 0) {
        const proteinCal = newP * target;
        const fatCal = newF * target;
        const carbCal = newC * target;
        setDraft({
          proteinGrams: proteinCal / CAL_PER_PROTEIN_G,
          fatGrams: fatCal / CAL_PER_FAT_G,
          carbGrams: carbCal / CAL_PER_CARB_G,
          targetCalories: target,
        });
      }

      const primaryKey = drag.kind === "boundary-protein" ? "protein" : "fat";
      const pct = Math.round(
        (primaryKey === "protein" ? newP : newF) * 100,
      );
      const grams = Math.round(
        primaryKey === "protein"
          ? (newP * target) / CAL_PER_PROTEIN_G
          : (newF * target) / CAL_PER_FAT_G,
      );
      const label =
        primaryKey === "protein" ? "Protein" : "Fat";
      setTip({
        text: `${label}, ${grams} g (${pct}%)`,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [
      interactive,
      macros.carbGrams,
      macros.fatGrams,
      macros.proteinGrams,
      pointerGeometry,
    ],
  );

  const endDrag = useCallback(
    (commitFinal: boolean) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      setIsDragging(false);
      if (commitFinal) {
        commit({
          proteinGrams: Math.round(draft.proteinGrams),
          fatGrams: Math.round(draft.fatGrams),
          carbGrams: Math.round(draft.carbGrams),
          targetCalories: Math.round(draft.targetCalories),
        });
      }
      setTip(null);
    },
    [commit, draft.carbGrams, draft.fatGrams, draft.proteinGrams, draft.targetCalories],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      endDrag(true);
    },
    [endDrag],
  );

  const onPointerCancel = useCallback(() => {
    endDrag(false);
  }, [endDrag]);

  // Render slices from current draft so UI tracks the drag live.
  const parts: { value: number; color: string; key: "protein" | "fat" | "carb" }[] = [];
  if (pf > 0) parts.push({ value: pf * effectiveTotal, color: COLORS.protein, key: "protein" });
  if (ff > 0) parts.push({ value: ff * effectiveTotal, color: COLORS.fat, key: "fat" });
  if (cf > 0) parts.push({ value: cf * effectiveTotal, color: COLORS.carb, key: "carb" });

  const slices =
    parts.length > 0 ? parts : [{ value: 1, color: "#ccc", key: "protein" as const }];
  const fullCircle = slices.length === 1 && slices[0].value >= effectiveTotal - 1e-6;

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
    />
  ) : (
    slices.map((part, i) => {
      const slice = (part.value / effectiveTotal) * TWO_PI;
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
          className="person-macro-pie-slice"
        />
      );
    })
  );

  const aria = `Macro mix for ${name}: ${Math.round(pf * 100)}% protein, ${Math.round(
    ff * 100,
  )}% fat, ${Math.round(cf * 100)}% carbs. Daily target ${Math.round(
    draft.targetCalories,
  )} calories.`;

  const rootStyle: CSSProperties = {
    width: `${draftSize}px`,
    height: `${draftSize}px`,
    touchAction: interactive ? "none" : undefined,
  };

  return (
    <div
      ref={rootRef}
      className="person-macro-pie-root"
      data-interactive={interactive ? "true" : undefined}
      data-dragging={isDragging ? "true" : undefined}
      style={rootStyle}
    >
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
        viewBox={`0 0 ${SVG_VB} ${SVG_VB}`}
        role="img"
        aria-label={aria}
        className="person-macro-pie-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {paths}
      </svg>
    </div>
  );
}
