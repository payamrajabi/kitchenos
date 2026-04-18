"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type IngredientOption = {
  id: number;
  name: string;
  parentIngredientId?: number | null;
  variantSortOrder?: number;
};

export type IngredientSuggestion =
  | {
      kind: "existing";
      key: string;
      /** Plain full line for accessibility / create rows. */
      label: string;
      ingredient: IngredientOption;
      /** When set, show "Parent > Variant" with parent and separator muted. */
      parentDisplayName?: string;
    }
  | {
      kind: "create";
      key: string;
      label: string;
      name: string;
    };

/** Ingredient name autocomplete: avoid a huge list on focus; wait for a few typed characters. */
export const MIN_INGREDIENT_AUTOCOMPLETE_CHARS = 3;

export function sortIngredientOptions(options: IngredientOption[]) {
  return [...options].sort((a, b) => a.name.localeCompare(b.name));
}

export function IngredientSearchControl({
  knownIngredients,
  disabled,
  placeholder,
  ariaLabel,
  inputId,
  labelHidden,
  defaultQuery = "",
  autoFocus,
  onPickSuggestion,
  onCancel,
}: {
  knownIngredients: IngredientOption[];
  disabled: boolean;
  placeholder: string;
  ariaLabel: string;
  inputId: string;
  labelHidden?: string;
  defaultQuery?: string;
  autoFocus?: boolean;
  onPickSuggestion: (suggestion: IngredientSuggestion) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(defaultQuery);
  }, [defaultQuery]);

  const trimmedQuery = query.trim();
  const loweredQuery = trimmedQuery.toLowerCase();
  const queryMeetsAutocompleteThreshold =
    trimmedQuery.length >= MIN_INGREDIENT_AUTOCOMPLETE_CHARS;

  const parentNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const ing of knownIngredients) {
      if (!ing.parentIngredientId) {
        map.set(ing.id, ing.name);
      }
    }
    return map;
  }, [knownIngredients]);

  const matchingIngredients = useMemo(() => {
    if (!queryMeetsAutocompleteThreshold) return [];
    return knownIngredients.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(loweredQuery),
    );
  }, [knownIngredients, loweredQuery, queryMeetsAutocompleteThreshold]);

  const exactMatchExists = useMemo(
    () =>
      loweredQuery !== "" &&
      knownIngredients.some(
        (ingredient) => ingredient.name.trim().toLowerCase() === loweredQuery,
      ),
    [knownIngredients, loweredQuery],
  );

  const suggestions = useMemo<IngredientSuggestion[]>(() => {
    const next: IngredientSuggestion[] = matchingIngredients.map((ingredient) => {
      const isVariant = !!ingredient.parentIngredientId;
      const parentName = isVariant
        ? parentNameById.get(ingredient.parentIngredientId!) ?? null
        : null;

      const label =
        isVariant && parentName
          ? `${parentName} > ${ingredient.name}`
          : ingredient.name;

      return {
        kind: "existing" as const,
        key: `ingredient-${ingredient.id}`,
        label,
        ingredient,
        ...(isVariant && parentName ? { parentDisplayName: parentName } : {}),
      };
    });
    if (queryMeetsAutocompleteThreshold && trimmedQuery && !exactMatchExists) {
      next.push({
        kind: "create",
        key: `create-${trimmedQuery.toLowerCase()}`,
        label: `Create "${trimmedQuery}"`,
        name: trimmedQuery,
      });
    }
    return next;
  }, [
    exactMatchExists,
    matchingIngredients,
    trimmedQuery,
    parentNameById,
    queryMeetsAutocompleteThreshold,
  ]);

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

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const closePicker = useCallback(() => {
    setOpen(false);
    setQuery(defaultQuery);
    setHighlightIdx(0);
  }, [defaultQuery]);

  const pickSuggestion = useCallback(
    (suggestion: IngredientSuggestion) => {
      onPickSuggestion(suggestion);
    },
    [onPickSuggestion],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const thresholdOk =
        event.currentTarget.value.trim().length >= MIN_INGREDIENT_AUTOCOMPLETE_CHARS;

      if (!open && event.key === "ArrowDown") {
        event.preventDefault();
        if (thresholdOk) setOpen(true);
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
        onCancel?.();
      }
    },
    [closePicker, highlightIdx, onCancel, open, pickSuggestion, suggestions],
  );

  const listOpen = open && queryMeetsAutocompleteThreshold;

  return (
    <div ref={rootRef} className="recipe-ingredients-add-cell-inner">
      {labelHidden ? (
        <label htmlFor={inputId} className="visually-hidden">
          {labelHidden}
        </label>
      ) : null}
      <div className="recipe-ingredients-add-input-wrap">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className="ss-input recipe-ingredients-add-input"
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setHighlightIdx(0);
            setOpen(next.trim().length >= MIN_INGREDIENT_AUTOCOMPLETE_CHARS);
          }}
          onFocus={() => {
            setHighlightIdx(0);
            if (query.trim().length >= MIN_INGREDIENT_AUTOCOMPLETE_CHARS) {
              setOpen(true);
            }
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
        />
      </div>
      {listOpen ? (
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
                {suggestion.kind === "existing" && suggestion.parentDisplayName ? (
                  <>
                    <span className="recipe-ingredients-suggestion-muted">
                      {suggestion.parentDisplayName}
                      {" > "}
                    </span>
                    {suggestion.ingredient.name}
                  </>
                ) : (
                  suggestion.label
                )}
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
