"use client";

import { updatePersonPatchAction } from "@/app/actions/people";
import {
  clampTargetToBand,
  computeLinkedNutrientState,
  initialNutrientSliderValue,
  nutrientBandKeys,
  patchNutrientTargetsIfChanged,
  PERSON_NUTRIENT_SLIDERS,
  readNutrientBand,
  snapToNutrientStep,
  type NutrientSliderField,
  type NutrientSliderSpec,
} from "@/lib/person-nutrient-sliders";
import type { PersonRow } from "@/types/database";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

type Props = {
  person: PersonRow;
  onError: (msg: string | null) => void;
};

function valueToRatio(value: number, spec: NutrientSliderSpec): number {
  const span = spec.max - spec.min;
  if (span <= 0) return 0;
  return (value - spec.min) / span;
}

const CLICK_MOVE_PX = 6;
/** Pixels beyond the track box (all sides) where releasing a min/max thumb clears it. */
const TRACK_VICINITY_PAD_PX = 56;
/** If min/max spectrum position is this close to the target (px), treat as merged → remove band. */
const THUMB_MERGE_OVERLAP_PX = 22;
const POOF_MS = 260;

function pointerOutsideTrackVicinity(
  clientX: number,
  clientY: number,
  trackEl: HTMLElement | null,
  pad: number,
): boolean {
  if (!trackEl) return false;
  const r = trackEl.getBoundingClientRect();
  return (
    clientX < r.left - pad ||
    clientX > r.right + pad ||
    clientY < r.top - pad ||
    clientY > r.bottom + pad
  );
}

function spectrumXDistancePx(
  trackEl: HTMLElement | null,
  valueA: number,
  valueB: number,
  spec: NutrientSliderSpec,
): number {
  if (!trackEl) return Infinity;
  const r = trackEl.getBoundingClientRect();
  if (r.width <= 0) return Infinity;
  const xa = r.left + valueToRatio(valueA, spec) * r.width;
  const xb = r.left + valueToRatio(valueB, spec) * r.width;
  return Math.abs(xa - xb);
}

function nutrientLiveLabel(
  role: "min" | "max" | "target",
  value: number,
  spec: NutrientSliderSpec,
): string {
  const prefix = role === "min" ? "Min" : role === "max" ? "Max" : "Target";
  return `${prefix} ${spec.label}: ${value} ${spec.unit}`;
}

function NutrientSliderRow({
  person,
  spec,
  value,
  onValueChange,
  commitPatch,
  onCommitTarget,
}: {
  person: PersonRow;
  spec: NutrientSliderSpec;
  value: number;
  onValueChange: (n: number) => void;
  commitPatch: (patch: Record<string, unknown>) => void;
  onCommitTarget: (spec: NutrientSliderSpec, t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const band = readNutrientBand(person, spec.field);
  const { minKey, maxKey } = nutrientBandKeys(spec.field);

  const [localMin, setLocalMin] = useState<number | null>(band.min);
  const [localMax, setLocalMax] = useState<number | null>(band.max);

  const valueRef = useRef(value);
  const localMinRef = useRef(localMin);
  const localMaxRef = useRef(localMax);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    localMinRef.current = localMin;
    localMaxRef.current = localMax;
  }, [localMin, localMax]);

  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [liveHint, setLiveHint] = useState<{ pct: number; text: string } | null>(null);
  const [activeDrag, setActiveDrag] = useState<"target" | "min" | "max" | null>(null);
  const [exitingBand, setExitingBand] = useState<"min" | "max" | null>(null);
  const poofTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickDownRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const clickMovedRef = useRef(false);

  const clearPoofTimer = useCallback(() => {
    if (poofTimerRef.current) {
      clearTimeout(poofTimerRef.current);
      poofTimerRef.current = null;
    }
  }, []);

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return spec.min;
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return spec.min;
      const t = (clientX - r.left) / r.width;
      const raw = spec.min + t * (spec.max - spec.min);
      return snapToNutrientStep(raw, spec);
    },
    [spec],
  );

  const clampDragMin = useCallback(
    (v: number, targetVal: number, maxV: number | null) => {
      let x = snapToNutrientStep(v, spec);
      x = Math.max(spec.min, Math.min(spec.max, x));
      const cap = maxV !== null ? Math.min(maxV, targetVal) : targetVal;
      return Math.min(x, cap);
    },
    [spec],
  );

  const clampDragMax = useCallback(
    (v: number, targetVal: number, minV: number | null) => {
      let x = snapToNutrientStep(v, spec);
      x = Math.max(spec.min, Math.min(spec.max, x));
      const floor = minV !== null ? Math.max(minV, targetVal) : targetVal;
      return Math.max(x, floor);
    },
    [spec],
  );

  useEffect(() => {
    if (!activeDrag) return;
    const kind = activeDrag;

    const onMove = (e: PointerEvent) => {
      const v = valueFromClientX(e.clientX);
      const tVal = valueRef.current;
      const lMin = localMinRef.current;
      const lMax = localMaxRef.current;

      if (kind === "target") {
        const t = clampTargetToBand(v, lMin, lMax, spec);
        valueRef.current = t;
        onValueChange(t);
        setLiveHint({
          pct: valueToRatio(t, spec) * 100,
          text: nutrientLiveLabel("target", t, spec),
        });
        return;
      }
      if (kind === "min") {
        const next = clampDragMin(v, tVal, lMax);
        localMinRef.current = next;
        setLocalMin(next);
        setLiveHint({
          pct: valueToRatio(next, spec) * 100,
          text: nutrientLiveLabel("min", next, spec),
        });
        return;
      }
      if (kind === "max") {
        const next = clampDragMax(v, tVal, lMin);
        localMaxRef.current = next;
        setLocalMax(next);
        setLiveHint({
          pct: valueToRatio(next, spec) * 100,
          text: nutrientLiveLabel("max", next, spec),
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      setActiveDrag(null);
      setLiveHint(null);
      const trackEl = trackRef.current;

      if (kind === "target") {
        const t = clampTargetToBand(
          valueFromClientX(e.clientX),
          localMinRef.current,
          localMaxRef.current,
          spec,
        );
        onCommitTarget(spec, t);
        return;
      }

      if (kind === "min" && localMinRef.current !== null) {
        const m = localMinRef.current;
        const tVal = valueRef.current;
        const droppedOutside = pointerOutsideTrackVicinity(
          e.clientX,
          e.clientY,
          trackEl,
          TRACK_VICINITY_PAD_PX,
        );
        const mergedValue = Math.round(m) === Math.round(tVal);
        const mergedPixels =
          spectrumXDistancePx(trackEl, m, tVal, spec) <= THUMB_MERGE_OVERLAP_PX;

        if (droppedOutside || mergedValue || mergedPixels) {
          clearPoofTimer();
          setExitingBand("min");
          poofTimerRef.current = setTimeout(() => {
            poofTimerRef.current = null;
            commitPatch({ [String(minKey)]: "" });
            setExitingBand(null);
          }, POOF_MS);
          return;
        }

        const patch: Record<string, unknown> = { [String(minKey)]: String(m) };
        if (valueRef.current < m) patch[spec.field] = String(m);
        commitPatch(patch);
        return;
      }

      if (kind === "max" && localMaxRef.current !== null) {
        const mx = localMaxRef.current;
        const tVal = valueRef.current;
        const droppedOutside = pointerOutsideTrackVicinity(
          e.clientX,
          e.clientY,
          trackEl,
          TRACK_VICINITY_PAD_PX,
        );
        const mergedValue = Math.round(mx) === Math.round(tVal);
        const mergedPixels =
          spectrumXDistancePx(trackEl, mx, tVal, spec) <= THUMB_MERGE_OVERLAP_PX;

        if (droppedOutside || mergedValue || mergedPixels) {
          clearPoofTimer();
          setExitingBand("max");
          poofTimerRef.current = setTimeout(() => {
            poofTimerRef.current = null;
            commitPatch({ [String(maxKey)]: "" });
            setExitingBand(null);
          }, POOF_MS);
          return;
        }

        const patch: Record<string, unknown> = { [String(maxKey)]: String(mx) };
        if (valueRef.current > mx) patch[spec.field] = String(mx);
        commitPatch(patch);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    activeDrag,
    clearPoofTimer,
    clampDragMax,
    clampDragMin,
    commitPatch,
    maxKey,
    minKey,
    onCommitTarget,
    onValueChange,
    spec,
    spec.field,
    valueFromClientX,
  ]);

  useEffect(() => {
    return () => {
      clearPoofTimer();
    };
  }, [clearPoofTimer]);

  const updateHoverFromEvent = useCallback(
    (e: React.PointerEvent) => {
      if (activeDrag) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-nutrient-thumb]")) {
        setHoverValue(null);
        setLiveHint(null);
        return;
      }
      const hv = valueFromClientX(e.clientX);
      const tVal = valueRef.current;
      setHoverValue(hv);
      let role: "min" | "max" | "target";
      if (hv < tVal) role = "min";
      else if (hv > tVal) role = "max";
      else role = "target";
      setLiveHint({
        pct: valueToRatio(hv, spec) * 100,
        text: nutrientLiveLabel(role, hv, spec),
      });
    },
    [activeDrag, spec, valueFromClientX],
  );

  const startDragTarget = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const t0 = valueRef.current;
    setLiveHint({
      pct: valueToRatio(t0, spec) * 100,
      text: nutrientLiveLabel("target", t0, spec),
    });
    setActiveDrag("target");
  };

  const startDragMin = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (localMin === null) return;
    clearPoofTimer();
    setExitingBand(null);
    localMinRef.current = localMin;
    setLiveHint({
      pct: valueToRatio(localMin, spec) * 100,
      text: nutrientLiveLabel("min", localMin, spec),
    });
    setActiveDrag("min");
  };

  const startDragMax = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (localMax === null) return;
    clearPoofTimer();
    setExitingBand(null);
    localMaxRef.current = localMax;
    setLiveHint({
      pct: valueToRatio(localMax, spec) * 100,
      text: nutrientLiveLabel("max", localMax, spec),
    });
    setActiveDrag("max");
  };

  const onTrackPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-nutrient-thumb]")) return;
    clickMovedRef.current = false;
    clickDownRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };

  const onTrackPointerMove = (e: React.PointerEvent) => {
    updateHoverFromEvent(e);
    if (clickDownRef.current?.pointerId === e.pointerId) {
      const d = clickDownRef.current;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_MOVE_PX) {
        clickMovedRef.current = true;
      }
    }
  };

  const onTrackPointerUp = (e: React.PointerEvent) => {
    if (activeDrag) return;
    if (clickDownRef.current?.pointerId !== e.pointerId) return;
    const down = clickDownRef.current;
    clickDownRef.current = null;
    if (!down) return;
    if (clickMovedRef.current) return;
    if ((e.target as HTMLElement).closest("[data-nutrient-thumb]")) return;

    const v = valueFromClientX(e.clientX);
    const tVal = valueRef.current;
    if (v < tVal) {
      commitPatch({ [String(minKey)]: String(v) });
    } else if (v > tVal) {
      commitPatch({ [String(maxKey)]: String(v) });
    }
  };

  const removeMin = useCallback(() => {
    commitPatch({ [String(minKey)]: "" });
  }, [commitPatch, minKey]);

  const removeMax = useCallback(() => {
    commitPatch({ [String(maxKey)]: "" });
  }, [commitPatch, maxKey]);

  const onMinDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeMin();
  };

  const onMaxDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeMax();
  };

  const showGhost = hoverValue !== null && !activeDrag;

  return (
    <div className="person-nutrient-slider-row">
      <div className="person-nutrient-slider-head">
        <span className="person-nutrient-slider-label">{spec.label}</span>
        <span className="person-nutrient-slider-target" aria-live="polite">
          Target: <strong>{value}</strong> {spec.unit}
          {localMin !== null || localMax !== null ? (
            <span className="person-nutrient-slider-band-readout">
              {localMin !== null ? ` · Min ${localMin}` : ""}
              {localMax !== null ? ` · Max ${localMax}` : ""}
            </span>
          ) : null}
        </span>
      </div>
      <div className="person-nutrient-slider-track-wrap">
        <span className="person-nutrient-slider-bound" aria-hidden="true">
          {spec.min}
        </span>
        <div
          ref={trackRef}
          className="person-nutrient-custom-track"
          onPointerMove={onTrackPointerMove}
          onPointerLeave={() => {
            if (!activeDrag) {
              setHoverValue(null);
              setLiveHint(null);
            }
          }}
          onPointerDown={onTrackPointerDown}
          onPointerUp={onTrackPointerUp}
          role="presentation"
        >
          <div className="person-nutrient-custom-rail" aria-hidden="true" />
          {liveHint ? (
            <div
              className="person-nutrient-float-label"
              style={{ left: `${liveHint.pct}%` }}
              role="status"
              aria-live="polite"
            >
              {liveHint.text}
            </div>
          ) : null}
          {showGhost && hoverValue !== null ? (
            <div
              className="person-nutrient-hover-ghost"
              style={{ left: `${valueToRatio(hoverValue, spec) * 100}%` }}
              aria-hidden="true"
            />
          ) : null}
          {localMin !== null ? (
            <button
              type="button"
              data-nutrient-thumb="min"
              className={
                exitingBand === "min"
                  ? "person-nutrient-thumb person-nutrient-thumb--band person-nutrient-thumb--min person-nutrient-thumb--poof-out"
                  : "person-nutrient-thumb person-nutrient-thumb--band person-nutrient-thumb--min"
              }
              style={{ left: `${valueToRatio(localMin, spec) * 100}%` }}
              aria-label={`${spec.label} minimum ${localMin}, drag to adjust, double-click to remove`}
              onPointerDown={startDragMin}
              onDoubleClick={onMinDoubleClick}
            />
          ) : null}
          {localMax !== null ? (
            <button
              type="button"
              data-nutrient-thumb="max"
              className={
                exitingBand === "max"
                  ? "person-nutrient-thumb person-nutrient-thumb--band person-nutrient-thumb--max person-nutrient-thumb--poof-out"
                  : "person-nutrient-thumb person-nutrient-thumb--band person-nutrient-thumb--max"
              }
              style={{ left: `${valueToRatio(localMax, spec) * 100}%` }}
              aria-label={`${spec.label} maximum ${localMax}, drag to adjust, double-click to remove`}
              onPointerDown={startDragMax}
              onDoubleClick={onMaxDoubleClick}
            />
          ) : null}
          <button
            type="button"
            data-nutrient-thumb="target"
            className="person-nutrient-thumb person-nutrient-thumb--target"
            style={{ left: `${valueToRatio(value, spec) * 100}%` }}
            aria-label={`${spec.label} target ${value}`}
            aria-valuemin={spec.min}
            aria-valuemax={spec.max}
            aria-valuenow={value}
            role="slider"
            onPointerDown={startDragTarget}
          />
        </div>
        <span className="person-nutrient-slider-bound" aria-hidden="true">
          {spec.max}
        </span>
      </div>
    </div>
  );
}

export function PersonNutrientSliders({ person, onError }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const initialValues = useMemo(() => {
    const out: Record<NutrientSliderField, number> = {} as Record<
      NutrientSliderField,
      number
    >;
    for (const spec of PERSON_NUTRIENT_SLIDERS) {
      out[spec.field] = initialNutrientSliderValue(person, spec);
    }
    return out;
  }, [person]);

  const [values, setValues] = useState(initialValues);
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const commitPatch = useCallback(
    (patch: Record<string, unknown>) => {
      onError(null);
      startTransition(async () => {
        const r = await updatePersonPatchAction(person.id, patch);
        if (r.ok) router.refresh();
        else onError(r.error);
      });
    },
    [onError, person.id, router],
  );

  const onCommitTarget = useCallback(
    (spec: NutrientSliderSpec, t: number) => {
      const next = computeLinkedNutrientState(valuesRef.current, spec.field, t);
      setValues(next);
      const patch = patchNutrientTargetsIfChanged(person, next);
      if (Object.keys(patch).length > 0) commitPatch(patch);
    },
    [commitPatch, person],
  );

  return (
    <div className="person-nutrient-sliders">
      {PERSON_NUTRIENT_SLIDERS.map((spec) => (
        <NutrientSliderRow
          key={`${spec.field}-${person.updated_at ?? person.id}`}
          person={person}
          spec={spec}
          value={values[spec.field]}
          onValueChange={(n) =>
            setValues((p) => computeLinkedNutrientState(p, spec.field, n))
          }
          commitPatch={commitPatch}
          onCommitTarget={onCommitTarget}
        />
      ))}
    </div>
  );
}
