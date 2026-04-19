"use client";

import { AuthModal } from "@/components/auth-modal";
import {
  addRecipeToLibraryAction,
  duplicateRecipeAction,
  removeRecipeFromLibraryAction,
} from "@/app/actions/recipes";
import { useState, useTransition } from "react";

type Props = {
  recipeId: number;
  inLibrary: boolean;
  isSignedIn: boolean;
};

/**
 * Aside-action UI for the Community recipe detail page. Slotted into the
 * same spot under the recipe image where owners see the "Edit" button, so
 * the rest of the page layout stays identical to /recipes/[id] view mode.
 *
 * Behaviour:
 * - Signed-out visitors: primary "Save Recipe" button opens the auth modal.
 * - Signed-in, not in library: primary "Save Recipe" adds to their library.
 * - Signed-in, in library: primary button becomes "Saved"; clicking it (or
 *   using the hover-advertised action) removes the recipe from their library.
 * - A small secondary "Duplicate to my recipes" button lives underneath and
 *   makes an independent copy (the server action redirects on success).
 */
export function CommunitySaveActions({ recipeId, inLibrary: initialInLibrary, isSignedIn }: Props) {
  const [inLibrary, setInLibrary] = useState(initialInLibrary);
  const [isLibraryPending, startLibraryTransition] = useTransition();
  const [isDuplicatePending, startDuplicateTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");

  const promptSignUp = () => {
    setError(null);
    setAuthMode("signup");
    setAuthOpen(true);
  };

  const handlePrimary = () => {
    if (!isSignedIn) {
      promptSignUp();
      return;
    }
    setError(null);
    startLibraryTransition(async () => {
      if (inLibrary) {
        const r = await removeRecipeFromLibraryAction(recipeId);
        if (r && "error" in r && r.error) {
          setError(r.error);
          return;
        }
        setInLibrary(false);
      } else {
        const r = await addRecipeToLibraryAction(recipeId);
        if (r && "error" in r && r.error) {
          setError(r.error);
          return;
        }
        setInLibrary(true);
      }
    });
  };

  const handleDuplicate = () => {
    if (!isSignedIn) {
      promptSignUp();
      return;
    }
    setError(null);
    startDuplicateTransition(async () => {
      const r = await duplicateRecipeAction(recipeId);
      // duplicateRecipeAction redirects on success; only an error comes back.
      if (r && "error" in r && r.error) {
        setError(r.error);
      }
    });
  };

  const primaryLabel = isLibraryPending
    ? inLibrary
      ? "Removing…"
      : "Saving…"
    : inLibrary
      ? "Saved"
      : "Save Recipe";

  const primaryTitle = inLibrary ? "Remove from library" : undefined;

  return (
    <div className="community-save-actions">
      <button
        type="button"
        className="recipe-detail-mode-btn"
        onClick={handlePrimary}
        disabled={isLibraryPending}
        title={primaryTitle}
        aria-label={
          inLibrary ? "Remove recipe from your library" : "Save recipe to your library"
        }
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        className="community-duplicate-link"
        onClick={handleDuplicate}
        disabled={isDuplicatePending}
        title="Make an independent copy you can edit. Won't stay in sync with the original."
      >
        {isDuplicatePending ? "Duplicating…" : "Duplicate to my recipes"}
      </button>
      {error ? (
        <p className="community-save-actions-error" role="alert">
          {error}
        </p>
      ) : null}
      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onModeChange={setAuthMode}
      />
    </div>
  );
}
