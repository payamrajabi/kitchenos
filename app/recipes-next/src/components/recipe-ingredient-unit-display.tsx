"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Display-only toggle at the top of the recipe ingredients table. Switches
 * each row's amount between the authored unit ("Original") and a grams-based
 * conversion ("Grams"). Nothing about the recipe or ingredient is written
 * back to the DB by this toggle — it only affects rendering.
 */
export type IngredientUnitDisplayMode = "original" | "grams";

type ContextValue = {
  mode: IngredientUnitDisplayMode;
  setMode: (mode: IngredientUnitDisplayMode) => void;
};

const IngredientUnitDisplayContext = createContext<ContextValue>({
  mode: "original",
  setMode: () => {},
});

export function RecipeIngredientUnitDisplayProvider({
  children,
  initialMode = "original",
}: {
  children: ReactNode;
  initialMode?: IngredientUnitDisplayMode;
}) {
  const [mode, setMode] = useState<IngredientUnitDisplayMode>(initialMode);
  const value = useMemo<ContextValue>(() => ({ mode, setMode }), [mode]);
  return (
    <IngredientUnitDisplayContext.Provider value={value}>
      {children}
    </IngredientUnitDisplayContext.Provider>
  );
}

export function useIngredientUnitDisplay(): ContextValue {
  return useContext(IngredientUnitDisplayContext);
}

/**
 * Icon toggle: outlined “G in circle” (gray) in original mode; filled black G
 * when grams mode is on. Tapping flips between the two modes.
 */
function GramCircleRegularIcon({ clipId }: { clipId: string }) {
  const href = `#${clipId}`;
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="recipe-ingredients-unit-toggle-option__svg"
    >
      <g clipPath={`url(${href})`}>
        <path
          d="M128 224C181.019 224 224 181.019 224 128C224 74.9807 181.019 32 128 32C74.9807 32 32 74.9807 32 128C32 181.019 74.9807 224 128 224Z"
          stroke="#666666"
          strokeWidth={16}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M130.021 176.1C102.887 176.1 86 157.666 86 127.695C86 98.1758 102.822 80 129.699 80C147.23 80 161.217 88.5078 166.373 100.496C167.34 102.688 167.598 104.363 167.598 106.039C167.598 110.422 164.697 113.322 160.25 113.322C156.641 113.322 154.127 111.711 152.064 107.973C147.424 98.7559 139.883 94.1152 129.764 94.1152C113.006 94.1152 103.016 106.555 103.016 127.502C103.016 148.9 113.457 161.984 130.215 161.984C144.266 161.984 153.998 153.09 154.256 140.07L154.32 138.523H137.82C133.695 138.523 130.859 136.074 130.859 132.143C130.859 128.211 133.695 125.826 137.82 125.826H162.312C167.469 125.826 170.562 129.049 170.562 134.463V136.396C170.562 160.566 155.738 176.1 130.021 176.1Z"
          fill="#666666"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="256" height="256" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function GramCircleFilledIcon({ clipId }: { clipId: string }) {
  const href = `#${clipId}`;
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="recipe-ingredients-unit-toggle-option__svg"
    >
      <g clipPath={`url(${href})`}>
        <path
          d="M128 32C181.019 32 224 74.9807 224 128C224 181.019 181.019 224 128 224C74.9807 224 32 181.019 32 128C32 74.9807 74.9807 32 128 32ZM129.699 80C102.822 80 86 98.1758 86 127.695C86 157.666 102.887 176.1 130.021 176.1C155.738 176.1 170.562 160.566 170.562 136.396V134.463C170.562 129.049 167.469 125.826 162.312 125.826H137.82C133.695 125.826 130.859 128.211 130.859 132.143C130.859 136.074 133.695 138.523 137.82 138.523H154.32L154.256 140.07C153.998 153.09 144.266 161.984 130.215 161.984C113.457 161.984 103.016 148.9 103.016 127.502C103.016 106.555 113.006 94.1152 129.764 94.1152C139.883 94.1152 147.424 98.7559 152.064 107.973C154.127 111.711 156.641 113.322 160.25 113.322C164.697 113.322 167.598 110.422 167.598 106.039C167.598 104.363 167.34 102.688 166.373 100.496C161.217 88.5078 147.23 80 129.699 80Z"
          fill="#000000"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="256" height="256" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function IngredientUnitDisplayToggle({
  className,
}: {
  className?: string;
}) {
  const clipRegular = useId();
  const clipFilled = useId();
  const { mode, setMode } = useIngredientUnitDisplay();
  const isGrams = mode === "grams";
  const toggle = useCallback(
    () => setMode(isGrams ? "original" : "grams"),
    [isGrams, setMode],
  );

  return (
    <button
      type="button"
      className={[
        "recipe-ingredients-unit-toggle-option",
        isGrams ? "recipe-ingredients-unit-toggle-option--active" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={isGrams}
      aria-label="Show ingredient amounts in grams"
      title="Show in grams"
      onClick={toggle}
    >
      <span className="recipe-ingredients-unit-toggle-option__icon" aria-hidden>
        <span className="recipe-ingredients-unit-toggle-option__layer recipe-ingredients-unit-toggle-option__layer--off">
          <GramCircleRegularIcon clipId={clipRegular} />
        </span>
        <span className="recipe-ingredients-unit-toggle-option__layer recipe-ingredients-unit-toggle-option__layer--on">
          <GramCircleFilledIcon clipId={clipFilled} />
        </span>
      </span>
    </button>
  );
}
