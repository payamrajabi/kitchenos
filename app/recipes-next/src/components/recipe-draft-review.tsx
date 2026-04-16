"use client";

import { confirmRecipeDraftAction } from "@/app/actions/recipe-import";
import { DRAFT_STORAGE_KEY } from "@/components/recipe-add-fab";
import { removeDraftFromStorage } from "@/components/draft-imports-provider";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import type { IngredientResolution } from "@/lib/ingredient-resolution";
import type {
  DraftRecipeData,
  DraftIngredientOption,
  ParsedIngredient,
} from "@/lib/recipe-import/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

function isNextRedirectError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err))
    return false;
  const d = (err as { digest?: unknown }).digest;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}

function resolutionForIngredient(
  name: string,
  resolutions: IngredientResolution[],
): IngredientResolution | undefined {
  return resolutions.find((r) => r.recipeName === name);
}

function isNewIngredient(r: IngredientResolution | undefined): boolean {
  return !!r && r.action !== "use_existing";
}

function formatTimer(low: number | null, high: number | null): string | null {
  if (low == null && high == null) return null;
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return sec > 0 ? `${m}m ${sec}s` : `${m} min`;
  };
  if (low != null && high != null && low !== high)
    return `${fmt(low)}–${fmt(high)}`;
  return fmt(low ?? high!);
}

function buildIngredientOptions(
  existing: DraftIngredientOption[],
): SelectOption[] {
  return existing
    .map((ing) => ({
      value: String(ing.id),
      label: ing.parentName ? `${ing.name} (${ing.parentName})` : ing.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ */
/*  Ingredient row with optional NEW badge + remap                    */
/* ------------------------------------------------------------------ */

function DraftIngredientRow({
  ing,
  resolution,
  existingIngredients,
  selectOptions,
  onRemap,
}: {
  ing: ParsedIngredient;
  resolution: IngredientResolution | undefined;
  existingIngredients: DraftIngredientOption[];
  selectOptions: SelectOption[];
  onRemap: (recipeName: string, ingredientId: number) => void;
}) {
  const [showRemap, setShowRemap] = useState(false);
  const isNew = isNewIngredient(resolution);

  const matchedName = useMemo(() => {
    if (!resolution) return ing.name;
    if (resolution.action === "use_existing")
      return resolution.existingIngredientName;
    return resolution.action === "create_variant_under_existing"
      ? resolution.cleanName
      : resolution.action === "create_sibling_variant"
        ? resolution.cleanName
        : resolution.action === "create_standalone"
          ? resolution.cleanName
          : ing.name;
  }, [resolution, ing.name]);

  const handleRemapSelect = useCallback(
    (val: string) => {
      const id = Number(val);
      if (!Number.isFinite(id)) return;
      onRemap(ing.name, id);
      setShowRemap(false);
    },
    [ing.name, onRemap],
  );

  return (
    <tr className="draft-ingredient-row">
      <td className="draft-ingredient-amount">
        {ing.amount ? `${ing.amount} ${ing.unit ?? ""}`.trim() : ing.unit ?? ""}
      </td>
      <td className="draft-ingredient-name">
        <span className="draft-ingredient-name-text">{matchedName}</span>
        {isNew && (
          <>
            <span className="draft-badge-new">NEW</span>
            <button
              type="button"
              className="draft-remap-toggle"
              onClick={() => setShowRemap((v) => !v)}
            >
              {showRemap ? "cancel" : "map to existing"}
            </button>
          </>
        )}
        {ing.is_optional && (
          <span className="draft-badge-optional">optional</span>
        )}
        {showRemap && (
          <div className="draft-remap-select-wrap">
            <SearchableSelect
              options={selectOptions}
              value=""
              onChange={handleRemapSelect}
              placeholder="Search ingredients…"
              aria-label={`Map "${ing.name}" to existing ingredient`}
              defaultOpen
            />
          </div>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function RecipeDraftReview() {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftRecipeData | null>(null);
  const [resolutions, setResolutions] = useState<IngredientResolution[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load the draft from sessionStorage on mount. SessionStorage is unavailable
  // during SSR, so this must run in an effect.
  useEffect(() => {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      router.replace("/recipes");
      return;
    }
    try {
      const data = JSON.parse(raw) as DraftRecipeData;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(data);
      setResolutions(data.resolutions);
    } catch {
      router.replace("/recipes");
    }
    setLoaded(true);
  }, [router]);

  const selectOptions = useMemo(
    () => buildIngredientOptions(draft?.existingIngredients ?? []),
    [draft?.existingIngredients],
  );

  const handleRemap = useCallback(
    (recipeName: string, ingredientId: number) => {
      const existing = draft?.existingIngredients.find(
        (e) => e.id === ingredientId,
      );
      if (!existing) return;
      setResolutions((prev) =>
        prev.map((r) =>
          r.recipeName === recipeName
            ? ({
                action: "use_existing" as const,
                recipeName,
                existingIngredientId: ingredientId,
                existingIngredientName: existing.name,
                confidence: 1,
                reason: "Manually mapped by user.",
              } satisfies IngredientResolution)
            : r,
        ),
      );
    },
    [draft?.existingIngredients],
  );

  const cleanupDraftStorage = useCallback(() => {
    const activeId = sessionStorage.getItem("kitchenos-active-draft-id");
    if (activeId) removeDraftFromStorage(activeId);
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    sessionStorage.removeItem("kitchenos-active-draft-id");
  }, []);

  const handleSave = useCallback(() => {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await confirmRecipeDraftAction(
          draft.parsed,
          resolutions,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } catch (err) {
        if (isNextRedirectError(err)) {
          cleanupDraftStorage();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }, [draft, resolutions, cleanupDraftStorage]);

  const handleDiscard = useCallback(() => {
    cleanupDraftStorage();
    router.push("/recipes");
  }, [router, cleanupDraftStorage]);

  if (!loaded) return null;
  if (!draft) return null;

  const { parsed } = draft;
  const newCount = resolutions.filter((r) => r.action !== "use_existing").length;

  return (
    <article className="recipe-detail draft-review">
      <div className="draft-review-banner">
        <p className="draft-review-banner-text">
          Review this imported recipe before adding it to your account.
          {newCount > 0 && (
            <>
              {" "}
              <strong>{newCount}</strong> ingredient{newCount > 1 ? "s" : ""}{" "}
              marked <span className="draft-badge-new">NEW</span> will be added
              to your inventory.
            </>
          )}
        </p>
      </div>

      <div className="recipe-detail-layout">
        <div className="recipe-detail-main">
          <h1 className="draft-review-title">{parsed.name}</h1>

          {parsed.description && (
            <p className="recipe-pre draft-review-description">
              {parsed.description}
            </p>
          )}

          {/* Ingredients */}
          <section className="section">
            <h3>Ingredients</h3>
            {parsed.ingredient_sections.map((section, sIdx) => (
              <div key={sIdx} className="draft-ingredient-section">
                {section.title && (
                  <h4 className="draft-section-title">{section.title}</h4>
                )}
                <table className="ingredients-table draft-ingredients-table">
                  <tbody>
                    {section.ingredients.map((ing, iIdx) => (
                      <DraftIngredientRow
                        key={`${sIdx}-${iIdx}`}
                        ing={ing}
                        resolution={resolutionForIngredient(
                          ing.name,
                          resolutions,
                        )}
                        existingIngredients={draft.existingIngredients}
                        selectOptions={selectOptions}
                        onRemap={handleRemap}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          {/* Instructions */}
          {parsed.instruction_steps.length > 0 && (
            <section className="section">
              <h3>Instructions</h3>
              <ol className="draft-instructions-list">
                {parsed.instruction_steps.map((step, idx) => {
                  const timer = formatTimer(
                    step.timer_seconds_low,
                    step.timer_seconds_high,
                  );
                  return (
                    <li key={idx} className="draft-instruction-step">
                      <span className="draft-step-number">{idx + 1}</span>
                      <div className="draft-step-content">
                        <p className="draft-step-body">{step.body}</p>
                        {timer && (
                          <span className="draft-step-timer">⏱ {timer}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {/* Notes */}
          {parsed.notes && (
            <section className="section">
              <h3>Notes</h3>
              <p className="recipe-pre">{parsed.notes}</p>
            </section>
          )}

          {/* Meta */}
          <div className="meta draft-meta">
            {parsed.servings != null && (
              <span className="draft-meta-item">
                <strong>Servings:</strong> {parsed.servings}
              </span>
            )}
            {parsed.prep_time_minutes != null && (
              <span className="draft-meta-item">
                <strong>Prep:</strong> {parsed.prep_time_minutes} min
              </span>
            )}
            {parsed.cook_time_minutes != null && (
              <span className="draft-meta-item">
                <strong>Cook:</strong> {parsed.cook_time_minutes} min
              </span>
            )}
            {parsed.meal_types.length > 0 && (
              <span className="draft-meta-item">
                <strong>Meal:</strong> {parsed.meal_types.join(", ")}
              </span>
            )}
          </div>
        </div>

        {/* Aside: actions */}
        <aside className="recipe-detail-aside" aria-label="Draft actions">
          <div className="recipe-detail-aside-stack">
            {parsed.source_url && (
              <section className="section recipe-source-section">
                <p className="recipe-source-row">
                  <span className="recipe-source-label">Source</span>
                  <a
                    className="source-link"
                    href={parsed.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {new URL(parsed.source_url).hostname.replace(/^www\./, "")}
                  </a>
                </p>
              </section>
            )}

            {error && (
              <p className="draft-review-error" role="alert">
                {error}
              </p>
            )}

            <div className="draft-review-actions">
              <button
                type="button"
                className="draft-save-btn"
                onClick={handleSave}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save to Recipes"}
              </button>
              <button
                type="button"
                className="draft-discard-btn"
                onClick={handleDiscard}
                disabled={isPending}
              >
                Discard
              </button>
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}
