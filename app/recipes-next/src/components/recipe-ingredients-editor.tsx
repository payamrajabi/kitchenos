"use client";

import {
  addRecipeIngredientAction,
  addRecipeIngredientSectionAction,
  createIngredientAndAddToRecipeAction,
  deleteRecipeIngredientAction,
  updateRecipeIngredientAction,
  updateRecipeIngredientSectionAction,
} from "@/app/actions/recipes";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { RECIPE_UNITS } from "@/lib/unit-mapping";
import type { RecipeIngredientRow, RecipeIngredientSectionRow } from "@/types/database";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";

type IngredientOption = {
  id: number;
  name: string;
};

type Props = {
  recipeId: number;
  initialItems: RecipeIngredientRow[];
  initialSections: RecipeIngredientSectionRow[];
  ingredientOptions: IngredientOption[];
};

type Suggestion =
  | {
      kind: "existing";
      key: string;
      label: string;
      ingredient: IngredientOption;
    }
  | {
      kind: "create";
      key: string;
      label: string;
      name: string;
    };

const DEFAULT_UNIT = "g";
const UNIT_OPTIONS: SelectOption[] = RECIPE_UNITS.map((unit) => ({
  value: unit,
  label: unit,
}));

function sortIngredientOptions(options: IngredientOption[]) {
  return [...options].sort((a, b) => a.name.localeCompare(b.name));
}

function sortSectionsCopy(sections: RecipeIngredientSectionRow[]) {
  return [...sections].sort((a, b) => a.sort_order - b.sort_order);
}

function normalizeRow(row: RecipeIngredientRow): RecipeIngredientRow {
  const sid = row.section_id;
  return {
    ...row,
    amount: row.amount == null ? null : String(row.amount),
    unit: row.unit == null || String(row.unit).trim() === "" ? DEFAULT_UNIT : String(row.unit),
    line_sort_order: Number.isFinite(row.line_sort_order) ? row.line_sort_order : 0,
    section_id:
      sid === null || sid === undefined || String(sid).trim() === "" ? null : String(sid),
    ingredients: row.ingredients
      ? {
          id: Number(row.ingredients.id),
          name: String(row.ingredients.name ?? ""),
        }
      : null,
  };
}

function sortItemsForDisplay(
  rows: RecipeIngredientRow[],
  sections: RecipeIngredientSectionRow[],
): RecipeIngredientRow[] {
  const rank = new Map<string | null, number>();
  rank.set(null, -1);
  for (const s of sortSectionsCopy(sections)) {
    rank.set(s.id, s.sort_order);
  }
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.section_id) ?? 9999;
    const rb = rank.get(b.section_id) ?? 9999;
    if (ra !== rb) return ra - rb;
    const lo = a.line_sort_order - b.line_sort_order;
    if (lo !== 0) return lo;
    return (a.ingredients?.name ?? "").localeCompare(b.ingredients?.name ?? "");
  });
}

function RecipeIngredientItemRow({
  item,
  disabled,
  onSaveAmount,
  onChangeUnit,
  onRemove,
}: {
  item: RecipeIngredientRow;
  disabled: boolean;
  onSaveAmount: (lineId: number, amount: string) => void;
  onChangeUnit: (lineId: number, unit: string) => void;
  onRemove: (lineId: number) => void;
}) {
  const [amount, setAmount] = useState(item.amount ?? "");

  const commitAmount = useCallback(() => {
    const next = amount.trim();
    const prev = (item.amount ?? "").trim();
    if (next === prev) return;
    onSaveAmount(item.id, next);
  }, [amount, item.amount, item.id, onSaveAmount]);

  return (
    <tr>
      <td className="recipe-ingredient-name-cell">
        <span className="recipe-ingredient-name">{item.ingredients?.name ?? "Untitled"}</span>
      </td>
      <td className="recipe-ingredient-amount-cell">
        <input
          type="text"
          className="recipe-ingredient-amount-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={disabled}
          placeholder="Amount"
          aria-label={`Amount for ${item.ingredients?.name ?? "ingredient"}`}
        />
      </td>
      <td className="recipe-ingredient-unit-cell">
        <SearchableSelect
          className="inventory-unit-select recipe-ingredient-unit-select"
          options={UNIT_OPTIONS}
          value={item.unit || DEFAULT_UNIT}
          onChange={(unit) => onChangeUnit(item.id, unit || DEFAULT_UNIT)}
          disabled={disabled}
          aria-label={`Unit for ${item.ingredients?.name ?? "ingredient"}`}
          placeholder={DEFAULT_UNIT}
        />
      </td>
      <td className="recipe-ingredient-remove-cell">
        <button
          type="button"
          className="recipe-ingredient-remove-button"
          onClick={() => onRemove(item.id)}
          disabled={disabled}
          aria-label={`Remove ${item.ingredients?.name ?? "ingredient"}`}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function ComponentSectionHeading({
  title,
  disabled,
  onCommit,
}: {
  title: string;
  disabled: boolean;
  onCommit: (nextTitle: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  if (editing) {
    return (
      <input
        type="text"
        className="recipe-ingredient-section-title-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const next = draft.trim();
          if (next !== title.trim()) onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        autoFocus
        disabled={disabled}
        aria-label="Component name"
      />
    );
  }

  return (
    <button
      type="button"
      className="recipe-ingredient-section-title-button"
      onClick={() => setEditing(true)}
      disabled={disabled}
    >
      {title.trim() || "Untitled component"}
    </button>
  );
}

function IngredientAddBlock({
  recipeId,
  sectionId,
  label,
  knownIngredients,
  setKnownIngredients,
  upsertLocalRow,
  runAction,
  isPending,
  setError,
}: {
  recipeId: number;
  sectionId: string | null;
  label: string;
  knownIngredients: IngredientOption[];
  setKnownIngredients: Dispatch<SetStateAction<IngredientOption[]>>;
  upsertLocalRow: (row: RecipeIngredientRow) => void;
  runAction: (key: string, fn: () => Promise<void>) => void;
  isPending: boolean;
  setError: (msg: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = query.trim();
  const loweredQuery = trimmedQuery.toLowerCase();

  const matchingIngredients = useMemo(() => {
    if (!loweredQuery) return knownIngredients.slice(0, 12);
    return knownIngredients.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(loweredQuery),
    );
  }, [knownIngredients, loweredQuery]);

  const exactMatchExists = useMemo(
    () =>
      loweredQuery !== "" &&
      knownIngredients.some(
        (ingredient) => ingredient.name.trim().toLowerCase() === loweredQuery,
      ),
    [knownIngredients, loweredQuery],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    const next: Suggestion[] = matchingIngredients.map((ingredient) => ({
      kind: "existing",
      key: `ingredient-${ingredient.id}`,
      label: ingredient.name,
      ingredient,
    }));
    if (trimmedQuery && !exactMatchExists) {
      next.push({
        kind: "create",
        key: `create-${trimmedQuery.toLowerCase()}`,
        label: `Create "${trimmedQuery}"`,
        name: trimmedQuery,
      });
    }
    return next;
  }, [exactMatchExists, matchingIngredients, trimmedQuery]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const closePicker = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlightIdx(0);
  }, []);

  const pickSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.kind === "existing") {
        runAction(`add-${sectionId ?? "flat"}-${suggestion.ingredient.id}-${Date.now()}`, async () => {
          const result = await addRecipeIngredientAction(
            recipeId,
            suggestion.ingredient.id,
            sectionId,
          );
          if (!result.ok) {
            setError(result.error);
            return;
          }
          upsertLocalRow(result.row);
          closePicker();
          inputRef.current?.focus();
        });
        return;
      }

      runAction(`create-${sectionId ?? "flat"}-${suggestion.name}`, async () => {
        const result = await createIngredientAndAddToRecipeAction(
          recipeId,
          suggestion.name,
          sectionId,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertLocalRow(result.row);
        setKnownIngredients((current) =>
          sortIngredientOptions(
            current.some((ingredient) => ingredient.id === result.row.ingredient_id)
              ? current
              : [
                  ...current,
                  {
                    id: result.row.ingredient_id,
                    name: result.row.ingredients?.name ?? suggestion.name,
                  },
                ],
          ),
        );
        closePicker();
        inputRef.current?.focus();
      });
    },
    [closePicker, recipeId, runAction, sectionId, setError, setKnownIngredients, upsertLocalRow],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!open && event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (!open) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIdx((current) => Math.min(current + 1, suggestions.length - 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIdx((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const suggestion = suggestions[highlightIdx];
        if (suggestion) {
          pickSuggestion(suggestion);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    },
    [closePicker, highlightIdx, open, pickSuggestion, suggestions],
  );

  return (
    <div ref={rootRef} className="recipe-ingredients-add-field recipe-ingredients-add-field-section">
      <label className="recipe-ingredients-add-field">
        <span className="recipe-source-label">{label}</span>
        <div className="recipe-ingredients-add-input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="ss-input recipe-ingredients-add-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlightIdx(0);
              setOpen(true);
            }}
            onFocus={() => {
              setHighlightIdx(0);
              setOpen(true);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Start typing an ingredient…"
            disabled={isPending}
            autoComplete="off"
            spellCheck={false}
            aria-label={label}
          />
        </div>
      </label>

      {open ? (
        <ul className="ss-list recipe-ingredients-suggestions" role="listbox">
          {suggestions.length ? (
            suggestions.map((suggestion, index) => (
              <li
                key={suggestion.key}
                role="option"
                aria-selected={index === highlightIdx}
                className={`ss-option${index === highlightIdx ? " ss-option-highlight" : ""}${suggestion.kind === "create" ? " recipe-ingredients-create-option" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickSuggestion(suggestion);
                }}
                onMouseEnter={() => setHighlightIdx(index)}
              >
                {suggestion.label}
              </li>
            ))
          ) : (
            <li className="ss-empty">No ingredients found.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function IngredientsTableBody({
  items,
  isPending,
  busyKey,
  onSaveAmount,
  onChangeUnit,
  onRemove,
}: {
  items: RecipeIngredientRow[];
  isPending: boolean;
  busyKey: string | null;
  onSaveAmount: (lineId: number, amount: string) => void;
  onChangeUnit: (lineId: number, unit: string) => void;
  onRemove: (lineId: number) => void;
}) {
  if (!items.length) {
    return (
      <tr>
        <td colSpan={4} className="recipe-ingredients-empty">
          Start typing above to add an ingredient.
        </td>
      </tr>
    );
  }
  return (
    <>
      {items.map((item) => {
        const rowBusy =
          busyKey === `amount-${item.id}` ||
          busyKey === `unit-${item.id}` ||
          busyKey === `remove-${item.id}`;
        return (
          <RecipeIngredientItemRow
            key={`${item.id}-${item.amount ?? ""}-${item.unit ?? ""}`}
            item={item}
            disabled={isPending && rowBusy}
            onSaveAmount={onSaveAmount}
            onChangeUnit={onChangeUnit}
            onRemove={onRemove}
          />
        );
      })}
    </>
  );
}

export function RecipeIngredientsEditor({
  recipeId,
  initialItems,
  initialSections,
  ingredientOptions,
}: Props) {
  const router = useRouter();
  const [sections, setSections] = useState(() => sortSectionsCopy(initialSections));
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const [items, setItems] = useState(() =>
    sortItemsForDisplay(initialItems.map(normalizeRow), initialSections),
  );
  const [knownIngredients, setKnownIngredients] = useState(() =>
    sortIngredientOptions(ingredientOptions),
  );
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSections(sortSectionsCopy(initialSections));
  }, [initialSections]);

  useEffect(() => {
    setItems(sortItemsForDisplay(initialItems.map(normalizeRow), initialSections));
  }, [initialItems, initialSections]);

  useEffect(() => {
    setKnownIngredients(sortIngredientOptions(ingredientOptions));
  }, [ingredientOptions]);

  const useGroupedLayout = sections.length >= 2;

  const runAction = useCallback((nextBusyKey: string, fn: () => Promise<void>) => {
    setError(null);
    setBusyKey(nextBusyKey);
    startTransition(() => {
      void (async () => {
        try {
          await fn();
        } finally {
          setBusyKey(null);
        }
      })();
    });
  }, []);

  const upsertLocalRow = useCallback((row: RecipeIngredientRow) => {
    const normalized = normalizeRow(row);
    setItems((current) =>
      sortItemsForDisplay(
        current.some((item) => item.id === normalized.id)
          ? current.map((item) => (item.id === normalized.id ? normalized : item))
          : [...current, normalized],
        sectionsRef.current,
      ),
    );
  }, []);

  const saveAmount = useCallback(
    (lineId: number, amount: string) => {
      runAction(`amount-${lineId}`, async () => {
        const result = await updateRecipeIngredientAction(recipeId, lineId, {
          amount,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertLocalRow(result.row);
      });
    },
    [recipeId, runAction, upsertLocalRow],
  );

  const changeUnit = useCallback(
    (lineId: number, unit: string) => {
      runAction(`unit-${lineId}`, async () => {
        const result = await updateRecipeIngredientAction(recipeId, lineId, {
          unit: unit || DEFAULT_UNIT,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertLocalRow(result.row);
      });
    },
    [recipeId, runAction, upsertLocalRow],
  );

  const removeIngredient = useCallback(
    (lineId: number) => {
      runAction(`remove-${lineId}`, async () => {
        const result = await deleteRecipeIngredientAction(recipeId, lineId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setItems((current) => current.filter((item) => item.id !== lineId));
      });
    },
    [recipeId, runAction],
  );

  const saveSectionTitle = useCallback(
    (sectionId: string, title: string) => {
      runAction(`section-title-${sectionId}`, async () => {
        const result = await updateRecipeIngredientSectionAction(sectionId, title);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSections((cur) =>
          sortSectionsCopy(cur.map((s) => (s.id === sectionId ? { ...s, title } : s))),
        );
      });
    },
    [runAction],
  );

  const addComponent = useCallback(() => {
    runAction("add-component", async () => {
      const result = await addRecipeIngredientSectionAction(recipeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }, [recipeId, router, runAction]);

  const sectionIdSet = useMemo(() => new Set(sections.map((s) => s.id)), [sections]);
  const orphanItems = useMemo(
    () =>
      useGroupedLayout
        ? items.filter((i) => i.section_id == null || !sectionIdSet.has(i.section_id))
        : [],
    [items, sectionIdSet, useGroupedLayout],
  );

  const isRowBusy = useCallback(
    (lineId: number) =>
      busyKey === `amount-${lineId}` ||
      busyKey === `unit-${lineId}` ||
      busyKey === `remove-${lineId}`,
    [busyKey],
  );

  return (
    <section className="section">
      <h3>Ingredients</h3>
      <div className="recipe-ingredients-editor">
        {error ? (
          <p className="recipe-ingredients-message" role="status">
            {error}
          </p>
        ) : null}

        {!useGroupedLayout ? (
          <>
            <IngredientAddBlock
              recipeId={recipeId}
              sectionId={null}
              label="Add ingredient"
              knownIngredients={knownIngredients}
              setKnownIngredients={setKnownIngredients}
              upsertLocalRow={upsertLocalRow}
              runAction={runAction}
              isPending={isPending}
              setError={setError}
            />
            <div className="table-container recipe-ingredients-table-wrap">
              <table className="ingredients-table recipe-ingredients-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Amount</th>
                    <th>Unit</th>
                    <th className="recipe-ingredient-remove-header">
                      <span className="visually-hidden">Remove ingredient</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <IngredientsTableBody
                    items={items}
                    isPending={isPending}
                    busyKey={busyKey}
                    onSaveAmount={saveAmount}
                    onChangeUnit={changeUnit}
                    onRemove={removeIngredient}
                  />
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="recipe-ingredient-sections">
            {sortSectionsCopy(sections).map((sec) => {
              const blockItems = items.filter((i) => i.section_id === sec.id);
              return (
                <section key={sec.id} className="recipe-ingredient-section-block">
                  <ComponentSectionHeading
                    title={sec.title}
                    disabled={isPending}
                    onCommit={(t) => saveSectionTitle(sec.id, t)}
                  />
                  <IngredientAddBlock
                    recipeId={recipeId}
                    sectionId={sec.id}
                    label="Add ingredient"
                    knownIngredients={knownIngredients}
                    setKnownIngredients={setKnownIngredients}
                    upsertLocalRow={upsertLocalRow}
                    runAction={runAction}
                    isPending={isPending}
                    setError={setError}
                  />
                  <div className="table-container recipe-ingredients-table-wrap">
                    <table className="ingredients-table recipe-ingredients-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Amount</th>
                          <th>Unit</th>
                          <th className="recipe-ingredient-remove-header">
                            <span className="visually-hidden">Remove ingredient</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <IngredientsTableBody
                          items={blockItems}
                          isPending={isPending}
                          busyKey={busyKey}
                          onSaveAmount={saveAmount}
                          onChangeUnit={changeUnit}
                          onRemove={removeIngredient}
                        />
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}

            {orphanItems.length ? (
              <section className="recipe-ingredient-section-block recipe-ingredient-section-orphan">
                <h4 className="recipe-ingredient-section-static-title">Other ingredients</h4>
                <p className="recipe-ingredients-orphan-hint">
                  These ingredients are not assigned to a component—you can still edit them here.
                </p>
                <div className="table-container recipe-ingredients-table-wrap">
                  <table className="ingredients-table recipe-ingredients-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Amount</th>
                        <th>Unit</th>
                        <th className="recipe-ingredient-remove-header">
                          <span className="visually-hidden">Remove ingredient</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orphanItems.map((item) => (
                        <RecipeIngredientItemRow
                          key={`${item.id}-${item.amount ?? ""}-${item.unit ?? ""}`}
                          item={item}
                          disabled={isPending && isRowBusy(item.id)}
                          onSaveAmount={saveAmount}
                          onChangeUnit={changeUnit}
                          onRemove={removeIngredient}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>
        )}

        <div className="recipe-ingredients-add-component-wrap">
          <button
            type="button"
            className="recipe-ingredients-add-component"
            onClick={addComponent}
            disabled={isPending}
          >
            Add component
          </button>
        </div>
      </div>
    </section>
  );
}
