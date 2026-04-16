"use client";

import { InstructionStepFormattedBody } from "@/components/instruction-step-formatted-body";
import { RecipeDescriptionRichText } from "@/components/recipe-description-rich-text";
import { saveRecipeFromCommunityAction } from "@/app/actions/recipes";
import { primaryImageUrl, recipeImageFocusYPercent } from "@/lib/recipes";
import { pluralizeUnit } from "@/lib/unit-mapping";
import type { RecipeRow, RecipeIngredientSectionRow } from "@/types/database";
import { useState, useTransition } from "react";

type IngredientLine = {
  id: number;
  name: string;
  amount: string | null;
  unit: string | null;
  is_optional: boolean;
  section_id: string | null;
  line_sort_order: number;
};

type Props = {
  recipe: RecipeRow;
  recipeIngredients: IngredientLine[];
  sections: RecipeIngredientSectionRow[];
  instructionSteps: { body: string }[];
  alreadySaved: boolean;
  isOwn: boolean;
};

function formatAmount(amount: string | null, unit: string | null) {
  const parts: string[] = [];
  if (amount) parts.push(amount);
  if (unit) parts.push(pluralizeUnit(unit, amount));
  return parts.join(" ");
}

export function CommunityRecipeDetail({
  recipe,
  recipeIngredients,
  sections,
  instructionSteps,
  alreadySaved: initialSaved,
  isOwn,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);

  const img = primaryImageUrl(recipe);
  const focusY = recipeImageFocusYPercent(recipe);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const r = await saveRecipeFromCommunityAction(recipe.id);
      if (r && "error" in r && r.error) {
        if (r.error === "Already saved.") {
          setSaved(true);
        } else {
          setError(r.error);
        }
      }
    });
  };

  const hasSections = sections.length >= 2;

  const renderIngredientLines = (lines: IngredientLine[]) => (
    <ul className="community-ingredient-list">
      {lines.map((line) => (
        <li key={line.id} className="community-ingredient-line">
          <span className="community-ingredient-name">
            {line.name}
            {line.is_optional ? (
              <span className="community-ingredient-optional"> (optional)</span>
            ) : null}
          </span>
          {(line.amount || line.unit) ? (
            <span className="community-ingredient-amount">
              {formatAmount(line.amount, line.unit)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <article className="community-detail">
      <div className="community-detail-layout">
        <div className="community-detail-main">
          <h1 className="community-detail-title">{recipe.name}</h1>

          {recipe.description?.trim() ? (
            <RecipeDescriptionRichText
              as="p"
              text={recipe.description.trim()}
              className="community-detail-description"
            />
          ) : null}

          <div className="community-detail-actions">
            {isOwn ? (
              <span className="community-saved-badge">Your Recipe</span>
            ) : saved ? (
              <button type="button" className="secondary community-save-btn" disabled>
                Already Saved
              </button>
            ) : (
              <button
                type="button"
                className="primary community-save-btn"
                onClick={handleSave}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save to My Recipes"}
              </button>
            )}
            {error ? <p className="community-detail-error">{error}</p> : null}
          </div>

          <div className="meta">
            {recipe.servings ? (
              <span>{recipe.servings} servings</span>
            ) : null}
            {recipe.calories ? (
              <span>{recipe.calories} kcal</span>
            ) : null}
            {recipe.protein_grams ? (
              <span>{recipe.protein_grams}g protein</span>
            ) : null}
            {recipe.fat_grams ? (
              <span>{recipe.fat_grams}g fat</span>
            ) : null}
            {recipe.carbs_grams ? (
              <span>{recipe.carbs_grams}g carbs</span>
            ) : null}
            {recipe.prep_time_minutes ? (
              <span>{recipe.prep_time_minutes} min prep</span>
            ) : null}
            {recipe.cook_time_minutes ? (
              <span>{recipe.cook_time_minutes} min cook</span>
            ) : null}
          </div>

          {recipeIngredients.length > 0 ? (
            <section className="section">
              <h3>Ingredients</h3>
              {hasSections ? (
                <div className="community-ingredient-sections">
                  {sections.map((sec) => {
                    const lines = recipeIngredients
                      .filter((l) => l.section_id === sec.id)
                      .sort((a, b) => a.line_sort_order - b.line_sort_order);
                    if (!lines.length) return null;
                    return (
                      <div key={sec.id} className="community-ingredient-section">
                        <h4 className="community-ingredient-section-title">
                          {sec.title}
                        </h4>
                        {renderIngredientLines(lines)}
                      </div>
                    );
                  })}
                  {(() => {
                    const orphans = recipeIngredients
                      .filter((l) => !l.section_id)
                      .sort((a, b) => a.line_sort_order - b.line_sort_order);
                    return orphans.length
                      ? renderIngredientLines(orphans)
                      : null;
                  })()}
                </div>
              ) : (
                renderIngredientLines(
                  [...recipeIngredients].sort(
                    (a, b) => a.line_sort_order - b.line_sort_order,
                  ),
                )
              )}
            </section>
          ) : null}

          {instructionSteps.length > 0 ? (
            <section className="section">
              <h3>Instructions</h3>
              <ol className="community-instruction-steps">
                {instructionSteps.map((step, i) => (
                  <li key={i} className="community-instruction-step">
                    <InstructionStepFormattedBody body={step.body} />
                  </li>
                ))}
              </ol>
            </section>
          ) : recipe.instructions ? (
            <section className="section">
              <h3>Instructions</h3>
              <pre className="community-detail-pre">{recipe.instructions}</pre>
            </section>
          ) : null}

          {recipe.notes ? (
            <section className="section">
              <h3>Notes</h3>
              <RecipeDescriptionRichText
                as="div"
                text={recipe.notes}
                className="community-detail-pre community-detail-pre--rich"
              />
            </section>
          ) : null}

          {recipe.source_url ? (
            <section className="section">
              <p>
                <a
                  className="source-link"
                  href={recipe.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source
                </a>
              </p>
            </section>
          ) : null}
        </div>

        {img ? (
          <aside className="community-detail-aside">
            <div
              className="community-detail-photo"
              style={{
                backgroundImage: `url('${img}')`,
                backgroundPosition: `center ${focusY}%`,
              }}
            />
          </aside>
        ) : null}
      </div>
    </article>
  );
}
