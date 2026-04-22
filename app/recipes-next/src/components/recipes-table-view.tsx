"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CaretDown, CaretUp, Check } from "@phosphor-icons/react";
import type { RecipeRow } from "@/types/database";
import { primaryImageUrl, recipeImageFocusYPercent } from "@/lib/recipes";
import { normalizeMealTypesFromDb } from "@/lib/recipe-meal-types";
import { RecipesTableMealTypeCell } from "@/components/recipes-table-meal-type-cell";

type SortKey =
  | "name"
  | "meal_type"
  | "link"
  | "image"
  | "description"
  | "headnote"
  | "notes"
  | "yield"
  | "prep"
  | "cook"
  | "total"
  | "calories"
  | "protein"
  | "fat"
  | "carbs"
  | "ingredients"
  | "instructions";

type SortDir = "asc" | "desc";

type Props = {
  recipes: RecipeRow[];
  ingredientCounts: Record<number, number>;
  instructionCounts: Record<number, number>;
  linkBuilder?: (recipe: RecipeRow) => string;
  /** Used to decide which rows the viewer can edit inline (e.g. meal type). */
  currentUserId?: string | null;
};

type BooleanKey = Exclude<
  SortKey,
  "name" | "meal_type" | "ingredients" | "instructions"
>;

const COLUMNS: Array<{ key: SortKey; label: string; align?: "center" }> = [
  { key: "name", label: "Name" },
  { key: "meal_type", label: "Meal Type" },
  { key: "link", label: "Link", align: "center" },
  { key: "image", label: "Image", align: "center" },
  { key: "description", label: "Description", align: "center" },
  { key: "headnote", label: "Headnote", align: "center" },
  { key: "notes", label: "Notes", align: "center" },
  { key: "yield", label: "Yield", align: "center" },
  { key: "prep", label: "Prep", align: "center" },
  { key: "cook", label: "Cook", align: "center" },
  { key: "total", label: "Total", align: "center" },
  { key: "calories", label: "Calories", align: "center" },
  { key: "protein", label: "Protein", align: "center" },
  { key: "fat", label: "Fat", align: "center" },
  { key: "carbs", label: "Carbs", align: "center" },
  { key: "ingredients", label: "Ingredients" },
  { key: "instructions", label: "Instructions" },
];

function hasText(value: string | null | undefined): boolean {
  return !!value && value.trim().length > 0;
}

function hasNumber(value: number | null | undefined): boolean {
  if (value == null) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function hasYield(recipe: RecipeRow): boolean {
  if (hasText(recipe.yield_display)) return true;
  if (hasText(recipe.yield_quantity)) return true;
  return hasNumber(recipe.servings);
}

function hasImage(recipe: RecipeRow): boolean {
  return !!primaryImageUrl(recipe);
}

function compareStrings(a: string, b: string, dir: SortDir): number {
  const aEmpty = a.length === 0;
  const bEmpty = b.length === 0;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const cmp = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareBooleans(a: boolean, b: boolean, dir: SortDir): number {
  if (a === b) return 0;
  // Present ("true") sorts above missing in ascending order — matches user
  // expectation that clicking a checkmark column groups filled rows together.
  const cmp = a ? -1 : 1;
  return dir === "asc" ? cmp : -cmp;
}

function compareNumbers(a: number, b: number, dir: SortDir): number {
  if (a === b) return 0;
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

function CheckCell({ on }: { on: boolean }) {
  if (!on) {
    return (
      <span className="recipes-table-check recipes-table-check-off" aria-label="No">
        <span aria-hidden>—</span>
      </span>
    );
  }
  return (
    <span className="recipes-table-check recipes-table-check-on" aria-label="Yes">
      <Check size={16} weight="bold" aria-hidden />
    </span>
  );
}

function mealTypeText(recipe: RecipeRow): string {
  return normalizeMealTypesFromDb(recipe.meal_types).join(", ");
}

function booleanFor(recipe: RecipeRow, key: BooleanKey): boolean {
  switch (key) {
    case "link":
      return hasText(recipe.source_url);
    case "image":
      return hasImage(recipe);
    case "description":
      return hasText(recipe.description);
    case "headnote":
      return hasText(recipe.headnote);
    case "notes":
      return hasText(recipe.notes);
    case "yield":
      return hasYield(recipe);
    case "prep":
      return hasNumber(recipe.prep_time_minutes);
    case "cook":
      return hasNumber(recipe.cook_time_minutes);
    case "total":
      return hasNumber(recipe.total_time_minutes);
    case "calories":
      return hasNumber(recipe.calories);
    case "protein":
      return hasNumber(recipe.protein_grams);
    case "fat":
      return hasNumber(recipe.fat_grams);
    case "carbs":
      return hasNumber(recipe.carbs_grams);
  }
}

export function RecipesTableView({
  recipes,
  ingredientCounts,
  instructionCounts,
  linkBuilder,
  currentUserId = null,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedRecipes = useMemo<RecipeRow[]>(() => {
    const copy = [...recipes];
    copy.sort((a, b) => {
      const primary = (() => {
        switch (sortKey) {
          case "name":
            return compareStrings(a.name ?? "", b.name ?? "", sortDir);
          case "meal_type":
            return compareStrings(mealTypeText(a), mealTypeText(b), sortDir);
          case "ingredients":
            return compareNumbers(
              ingredientCounts[a.id] ?? 0,
              ingredientCounts[b.id] ?? 0,
              sortDir,
            );
          case "instructions":
            return compareNumbers(
              instructionCounts[a.id] ?? 0,
              instructionCounts[b.id] ?? 0,
              sortDir,
            );
          default:
            return compareBooleans(
              booleanFor(a, sortKey),
              booleanFor(b, sortKey),
              sortDir,
            );
        }
      })();
      if (primary !== 0) return primary;
      // Stable secondary sort by name so repeat ties don't jitter.
      return (a.name ?? "").localeCompare(b.name ?? "", undefined, {
        sensitivity: "base",
      });
    });
    return copy;
  }, [recipes, ingredientCounts, instructionCounts, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (recipes.length === 0) return null;

  return (
    <div className="table-container inventory-table inventory-sortable-table recipes-table">
      <table className="ingredients-table inventory-table--compact recipes-table-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              const nextDir = active
                ? sortDir === "asc"
                  ? "desc"
                  : "asc"
                : "asc";
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`inventory-sort-th${
                    col.align === "center"
                      ? " recipes-table-col-center"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className={`inventory-sort-btn${
                      active ? " inventory-sort-btn--active" : ""
                    }`}
                    aria-label={`Sort by ${col.label} ${
                      nextDir === "asc" ? "ascending" : "descending"
                    }`}
                    aria-sort={
                      active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    onClick={() => handleSort(col.key)}
                  >
                    <span>{col.label}</span>
                    <span className="inventory-sort-indicator" aria-hidden>
                      {active && sortDir === "desc" ? (
                        <CaretDown size={12} weight="bold" />
                      ) : (
                        <CaretUp size={12} weight="bold" />
                      )}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRecipes.map((recipe) => {
            const img = primaryImageUrl(recipe);
            const focusY = recipeImageFocusYPercent(recipe);
            const href = linkBuilder
              ? linkBuilder(recipe)
              : `/recipes/${recipe.id}`;
            const canEdit =
              !!currentUserId && recipe.owner_id === currentUserId;
            const ingCount = ingredientCounts[recipe.id] ?? 0;
            const insCount = instructionCounts[recipe.id] ?? 0;
            return (
              <tr
                key={recipe.id}
                className="inventory-data-row recipes-table-row"
              >
                <td className="inventory-ingredient-name recipes-table-name-cell">
                  <Link
                    href={href}
                    className="recipes-table-name-link"
                    title={recipe.name}
                  >
                    <span
                      className="recipes-table-thumb"
                      style={
                        img
                          ? {
                              backgroundImage: `url('${img}')`,
                              backgroundSize: "cover",
                              backgroundPosition: `center ${focusY}%`,
                            }
                          : undefined
                      }
                      aria-hidden
                    >
                      {img ? null : (
                        <span className="recipes-table-thumb-empty">—</span>
                      )}
                    </span>
                    <span className="recipes-table-name-text inventory-name-text">
                      {recipe.name}
                    </span>
                  </Link>
                </td>
                <td className="recipes-table-meal-type">
                  <RecipesTableMealTypeCell
                    recipeId={recipe.id}
                    initialMealTypes={recipe.meal_types}
                    editable={canEdit}
                  />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "link")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "image")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "description")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "headnote")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "notes")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "yield")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "prep")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "cook")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "total")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "calories")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "protein")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "fat")} />
                </td>
                <td className="recipes-table-col-center">
                  <CheckCell on={booleanFor(recipe, "carbs")} />
                </td>
                <td className="recipes-table-count">{ingCount}</td>
                <td className="recipes-table-count">{insCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
