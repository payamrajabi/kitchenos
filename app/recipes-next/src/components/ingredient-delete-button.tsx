"use client";

import {
  deleteIngredientAction,
  fetchRecipesUsingIngredientAction,
} from "@/app/actions/inventory";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

type LinkedRecipe = { id: number; name: string };

export function IngredientDeleteButton({
  ingredientId,
  ingredientName,
}: {
  ingredientId: number;
  ingredientName: string;
}) {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [recipes, setRecipes] = useState<LinkedRecipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!modalOpen) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [modalOpen]);

  const expected = ingredientName.trim();
  const nameMatches = confirmText.trim() === expected;
  const hasRecipes = recipes.length > 0;

  const close = useCallback(() => {
    setModalOpen(false);
    setConfirmText("");
    setError("");
    setRecipes([]);
  }, []);

  const handleDeleteClick = useCallback(async () => {
    setLoadingRecipes(true);
    setError("");
    try {
      const used = await fetchRecipesUsingIngredientAction(ingredientId);
      if (used.length > 0) {
        setRecipes(used);
        setModalOpen(true);
      } else {
        startTransition(async () => {
          const res = await deleteIngredientAction(ingredientId);
          if (!res.ok) setError(res.error);
        });
      }
    } finally {
      setLoadingRecipes(false);
    }
  }, [ingredientId]);

  const handleConfirmDelete = useCallback(() => {
    if (!nameMatches || isPending) return;
    setError("");
    startTransition(async () => {
      const res = await deleteIngredientAction(ingredientId);
      if (res.ok) close();
      else setError(res.error);
    });
  }, [close, ingredientId, nameMatches, isPending]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, close]);

  const modal =
    isClient && modalOpen ? (
      <div
        className="modal open"
        aria-hidden="false"
        role="presentation"
      >
        <button
          type="button"
          className="modal-backdrop"
          aria-label="Close delete confirmation"
          onClick={close}
        />
        <div
          className="modal-card modal-delete-ingredient"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="modal-close icon-ghost"
            aria-label="Close"
            onClick={close}
          >
            <i className="ph ph-x" aria-hidden="true" />
          </button>
          <div className="delete-ingredient-modal-body">
            <h2 id={titleId} className="delete-ingredient-modal-title">
              Delete ingredient
            </h2>
            <p className="delete-ingredient-modal-warning">
              Deleting <strong>{ingredientName}</strong> removes it from your
              inventory and from every recipe that uses it. This cannot be
              undone.
            </p>

            {hasRecipes && (
              <div className="delete-ingredient-recipe-list">
                <p className="delete-ingredient-recipe-list-label">
                  Used in {recipes.length} recipe{recipes.length !== 1 ? "s" : ""}:
                </p>
                <ul>
                  {recipes.map((r) => (
                    <li key={r.id}>
                      <a
                        href={`/recipes/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label htmlFor={inputId} className="delete-ingredient-modal-label">
              Type the ingredient name to confirm:
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              className="delete-ingredient-modal-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={isPending}
              aria-invalid={confirmText.length > 0 && !nameMatches}
            />
            {error ? (
              <p className="delete-ingredient-modal-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="delete-ingredient-modal-actions">
              <button
                type="button"
                className="delete-ingredient-modal-cancel"
                onClick={close}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-ingredient-modal-confirm"
                onClick={handleConfirmDelete}
                disabled={!nameMatches || isPending}
              >
                {isPending ? "Deleting…" : "Delete ingredient"}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        className="inventory-row-delete"
        aria-label={`Delete ${ingredientName}`}
        onClick={handleDeleteClick}
        disabled={isPending || loadingRecipes}
      >
        {loadingRecipes ? "Checking…" : "Delete"}
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
