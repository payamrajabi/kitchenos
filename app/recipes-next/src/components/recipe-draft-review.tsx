"use client";

import { confirmRecipeDraftAction } from "@/app/actions/recipe-import";
import { DRAFT_STORAGE_KEY } from "@/components/recipe-add-fab";
import { removeDraftFromStorage } from "@/components/draft-imports-provider";
import {
  IngredientSearchControl,
  type IngredientOption,
  type IngredientSuggestion,
} from "@/components/ingredient-search-control";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import type { IngredientResolution } from "@/lib/ingredient-resolution";
import type {
  DraftRecipeData,
  DraftIngredientOption,
  ParsedIngredient,
  ParsedRecipe,
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

const NOTE_TYPE_LABELS: Record<string, string> = {
  note: "Note",
  variation: "Variation",
  storage: "Storage",
  substitution: "Substitution",
};

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
  selectOptions,
  onRemap,
  onToggleOptional,
  onRemove,
}: {
  ing: ParsedIngredient;
  resolution: IngredientResolution | undefined;
  selectOptions: SelectOption[];
  onRemap: (recipeName: string, ingredientId: number) => void;
  onToggleOptional: () => void;
  onRemove: () => void;
}) {
  const [showRemap, setShowRemap] = useState(false);
  const isNew = isNewIngredient(resolution);

  const matchedName = useMemo(() => {
    if (!resolution) return ing.ingredient;
    if (resolution.action === "use_existing")
      return resolution.existingIngredientName;
    return resolution.action === "create_variant_under_existing"
      ? resolution.cleanName
      : resolution.action === "create_sibling_variant"
        ? resolution.cleanName
        : resolution.action === "create_standalone"
          ? resolution.cleanName
          : ing.ingredient;
  }, [resolution, ing.ingredient]);

  const handleRemapSelect = useCallback(
    (val: string) => {
      const id = Number(val);
      if (!Number.isFinite(id)) return;
      onRemap(ing.ingredient, id);
      setShowRemap(false);
    },
    [ing.ingredient, onRemap],
  );

  return (
    <tr className="draft-ingredient-row">
      <td className="draft-ingredient-amount">
        {ing.amount ? `${ing.amount} ${ing.unit ?? ""}`.trim() : ing.unit ?? ""}
      </td>
      <td className="draft-ingredient-name">
        <span className="draft-ingredient-name-text">{matchedName}</span>
        {ing.preparation && (
          <span className="draft-ingredient-preparation">
            , {ing.preparation}
          </span>
        )}
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
        <span className="draft-row-actions">
          <button
            type="button"
            className="draft-row-action"
            onClick={onToggleOptional}
            aria-pressed={ing.is_optional ? true : false}
          >
            {ing.is_optional ? "unmark optional" : "mark optional"}
          </button>
          <button
            type="button"
            className="draft-row-action draft-row-action-remove"
            onClick={onRemove}
            aria-label={`Remove ${ing.ingredient}`}
          >
            remove
          </button>
        </span>
        {showRemap && (
          <div className="draft-remap-select-wrap">
            <SearchableSelect
              options={selectOptions}
              value=""
              onChange={handleRemapSelect}
              placeholder="Search ingredients…"
              aria-label={`Map "${ing.ingredient}" to existing ingredient`}
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
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
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
      setParsed(data.parsed);
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

  // Build known-ingredient list for the add-ingredient search control.
  // We preserve parent/variant relationships by mapping `parentName` to the
  // corresponding standalone ingredient's id, so the "Parent > Variant" label
  // renders correctly in the autocomplete.
  const searchIngredients = useMemo<IngredientOption[]>(() => {
    const list = draft?.existingIngredients ?? [];
    const parentIdByName = new Map<string, number>();
    for (const ing of list) {
      if (!ing.parentName) parentIdByName.set(ing.name, ing.id);
    }
    return list.map((ing) => ({
      id: ing.id,
      name: ing.name,
      parentIngredientId: ing.parentName
        ? parentIdByName.get(ing.parentName) ?? null
        : null,
    }));
  }, [draft?.existingIngredients]);

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

  const handleToggleOptional = useCallback(
    (groupIndex: number, itemIndex: number) => {
      setParsed((prev) => {
        if (!prev) return prev;
        const groups = [...prev.ingredient_groups];
        const group = groups[groupIndex];
        if (!group) return prev;
        const items = group.items.map((it, i) =>
          i === itemIndex ? { ...it, is_optional: !it.is_optional } : it,
        );
        groups[groupIndex] = { ...group, items };
        return { ...prev, ingredient_groups: groups };
      });
    },
    [],
  );

  const handleRemoveIngredient = useCallback(
    (groupIndex: number, itemIndex: number) => {
      setParsed((prev) => {
        if (!prev) return prev;
        const groups = [...prev.ingredient_groups];
        const group = groups[groupIndex];
        if (!group) return prev;
        const removed = group.items[itemIndex];
        const items = group.items.filter((_, i) => i !== itemIndex);
        groups[groupIndex] = { ...group, items };
        const next = { ...prev, ingredient_groups: groups };

        // If no other ingredient line in the draft still references this name,
        // drop its resolution too so we don't create an orphan ingredient.
        if (removed) {
          const stillUsed = groups.some((g) =>
            g.items.some((it) => it.ingredient === removed.ingredient),
          );
          if (!stillUsed) {
            setResolutions((rs) =>
              rs.filter((r) => r.recipeName !== removed.ingredient),
            );
          }
        }
        return next;
      });
    },
    [],
  );

  // Append a new ingredient line to a section (by index), and make sure there
  // is a resolution for its name. This is purely a client-side draft edit; the
  // data is persisted on "Save to Recipes" by `confirmRecipeDraftAction`.
  const handleAddIngredient = useCallback(
    (groupIndex: number, suggestion: IngredientSuggestion) => {
      setParsed((prev) => {
        if (!prev) return prev;
        const groups = [...prev.ingredient_groups];
        const group = groups[groupIndex];
        if (!group) return prev;

        const name =
          suggestion.kind === "existing"
            ? suggestion.ingredient.name
            : suggestion.name.trim();
        if (!name) return prev;

        const newIng: ParsedIngredient = {
          ingredient: name,
          amount: null,
          unit: null,
          preparation: null,
          display: null,
          is_optional: false,
        };
        groups[groupIndex] = {
          ...group,
          items: [...group.items, newIng],
        };
        return { ...prev, ingredient_groups: groups };
      });

      setResolutions((prev) => {
        const name =
          suggestion.kind === "existing"
            ? suggestion.ingredient.name
            : suggestion.name.trim();
        if (!name) return prev;
        // If we already have a resolution for this name, keep it — the new
        // line will share the same mapping on save.
        if (prev.some((r) => r.recipeName === name)) return prev;

        if (suggestion.kind === "existing") {
          return [
            ...prev,
            {
              action: "use_existing" as const,
              recipeName: name,
              existingIngredientId: suggestion.ingredient.id,
              existingIngredientName: suggestion.ingredient.name,
              confidence: 1,
              reason: "Manually added from draft review.",
            },
          ];
        }

        return [
          ...prev,
          {
            action: "create_standalone" as const,
            recipeName: name,
            cleanName: name,
            confidence: 1,
            reason: "Manually added from draft review.",
          },
        ];
      });
    },
    [],
  );

  const cleanupDraftStorage = useCallback(() => {
    const activeId = sessionStorage.getItem("kitchenos-active-draft-id");
    if (activeId) removeDraftFromStorage(activeId);
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    sessionStorage.removeItem("kitchenos-active-draft-id");
  }, []);

  const handleSave = useCallback(() => {
    if (!parsed) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await confirmRecipeDraftAction(
          parsed,
          resolutions,
          draft?.sourceImageCandidates,
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
  }, [parsed, resolutions, draft, cleanupDraftStorage]);

  const handleDiscard = useCallback(() => {
    cleanupDraftStorage();
    router.push("/recipes");
  }, [router, cleanupDraftStorage]);

  if (!loaded) return null;
  if (!draft || !parsed) return null;

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
          <h1 className="draft-review-title">
            {parsed.title.primary}
            {parsed.title.qualifier ? (
              <>
                {" "}
                <span className="draft-review-title-qualifier">
                  {parsed.title.qualifier}
                </span>
              </>
            ) : null}
          </h1>

          {parsed.headnote && (
            <p className="recipe-pre draft-review-headnote">
              {parsed.headnote}
            </p>
          )}

          {parsed.description && (
            <p className="recipe-pre draft-review-description">
              {parsed.description}
            </p>
          )}

          {/* Ingredients */}
          <section className="section">
            <h3>Ingredients</h3>
            {parsed.ingredient_groups.map((group, gIdx) => (
              <div key={gIdx} className="draft-ingredient-section">
                {group.heading && (
                  <h4 className="draft-section-title">{group.heading}</h4>
                )}
                <table className="ingredients-table draft-ingredients-table">
                  <tbody>
                    {group.items.map((ing, iIdx) => (
                      <DraftIngredientRow
                        key={`${gIdx}-${iIdx}`}
                        ing={ing}
                        resolution={resolutionForIngredient(
                          ing.ingredient,
                          resolutions,
                        )}
                        selectOptions={selectOptions}
                        onRemap={handleRemap}
                        onToggleOptional={() =>
                          handleToggleOptional(gIdx, iIdx)
                        }
                        onRemove={() => handleRemoveIngredient(gIdx, iIdx)}
                      />
                    ))}
                    <tr className="draft-ingredient-add-row">
                      <td
                        className="draft-ingredient-amount draft-ingredient-add-placeholder"
                        aria-hidden="true"
                      />
                      <td className="draft-ingredient-add-cell">
                        <IngredientSearchControl
                          key={`add-${gIdx}-${group.items.length}`}
                          knownIngredients={searchIngredients}
                          disabled={isPending}
                          placeholder="Add ingredient…"
                          ariaLabel={
                            group.heading
                              ? `Add ingredient to ${group.heading}`
                              : "Add ingredient"
                          }
                          inputId={`draft-ingredient-add-${gIdx}`}
                          labelHidden="Add ingredient"
                          onPickSuggestion={(suggestion) =>
                            handleAddIngredient(gIdx, suggestion)
                          }
                        />
                      </td>
                    </tr>
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
                      <span className="draft-step-number">
                        {step.step_number || idx + 1}
                      </span>
                      <div className="draft-step-content">
                        <p className="draft-step-body">{step.text}</p>
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
              <h3>
                {parsed.recipe_note.title?.trim() ||
                  (parsed.recipe_note.type
                    ? NOTE_TYPE_LABELS[parsed.recipe_note.type]
                    : null) ||
                  "Note"}
              </h3>
              <p className="recipe-pre">{parsed.notes}</p>
            </section>
          )}

          {/* Meta */}
          <div className="meta draft-meta">
            {parsed.yield.display ? (
              <span className="draft-meta-item">
                <strong>Yield:</strong> {parsed.yield.display}
              </span>
            ) : parsed.servings != null ? (
              <span className="draft-meta-item">
                <strong>Servings:</strong> {parsed.servings}
              </span>
            ) : null}
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
