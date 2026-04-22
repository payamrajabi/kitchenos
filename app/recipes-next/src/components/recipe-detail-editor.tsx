"use client";

import {
  deleteRecipeAction,
  updateRecipeAction,
} from "@/app/actions/recipes";
import { generateRecipeImageAction } from "@/app/actions/recipe-image";
import { AiImagePlaceholder } from "@/components/ai-image-placeholder";
import { RecipeIngredientsEditor } from "@/components/recipe-ingredients-editor";
import { RecipeInstructionsEditor } from "@/components/recipe-instructions-editor";
import { RecipeEditModeProvider } from "@/components/recipe-edit-mode";
import { RecipeServingsScaleProvider } from "@/components/recipe-servings-scale";
import { RecipeIngredientUnitDisplayProvider } from "@/components/recipe-ingredient-unit-display";
import { Minus, Plus } from "@phosphor-icons/react";
import { RecipeDescriptionRichText } from "@/components/recipe-description-rich-text";
import { useRecipeDetailDialog } from "@/components/recipe-detail-dialog";
import { RecipeDetailOverlayChrome } from "@/components/recipe-detail-overlay-chrome";
import { isSupabaseConfigured, recipeImagesBucket } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { applyMarkdownLinkPaste } from "@/lib/recipe-description-links";
import {
  primaryImageUrl,
  recipeImageFocusYPercent,
  RECIPE_DESCRIPTION_MAX_LENGTH,
} from "@/lib/recipes";
import type {
  RecipeIngredientRow,
  RecipeIngredientSectionRow,
  RecipeInstructionStepRow,
  RecipeRow,
} from "@/types/database";
import { RecipeMealTypesField } from "@/components/recipe-meal-types-field";
import { mealTypesEqual, normalizeMealTypesFromDb } from "@/lib/recipe-meal-types";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

const emptySubscribe = () => () => {};

type RecipeIngredientOption = {
  id: number;
  name: string;
  parentIngredientId?: number | null;
  variantSortOrder?: number;
};

type Props = {
  recipe: RecipeRow;
  recipeIngredients: RecipeIngredientRow[];
  recipeIngredientSections: RecipeIngredientSectionRow[];
  recipeInstructionSteps: RecipeInstructionStepRow[];
  availableIngredients: RecipeIngredientOption[];
  autoGenerating?: boolean;
  // When true, the editor locks itself into view mode and never exposes any
  // owner-only UI (edit toggle, image upload, meal-types picker, delete, etc.).
  // Used by the Community detail page so visitors see the same layout owners
  // see, minus the authoring affordances.
  viewOnly?: boolean;
  // Rendered in the aside under the recipe image, in the slot normally
  // occupied by the "Edit" button. Only used when `viewOnly` is true.
  asideActionSlot?: ReactNode;
  // Extra entries prepended to the modal's kebab menu (above the built-in
  // Edit / Go to source / Delete entries). Only shown when the editor is
  // rendered inside the recipe modal. Used by the community viewer to expose
  // a "Remove from my recipes" shortcut for saved community recipes.
  overlayExtraMenuItems?: import(
    "@/components/recipe-detail-overlay-chrome"
  ).RecipeDetailOverlayMenuItem[];
};

function str(v: string | null | undefined) {
  return v ?? "";
}

function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === "string" && u.trim() !== "");
}

export function RecipeDetailEditor({
  recipe: initial,
  recipeIngredients,
  recipeIngredientSections,
  recipeInstructionSteps,
  availableIngredients,
  autoGenerating = false,
  viewOnly = false,
  asideActionSlot = null,
  overlayExtraMenuItems = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoGenFlag = searchParams?.get("gen") === "1";
  const effectiveAutoGenerating = autoGenerating || autoGenFlag;
  // When the editor is rendered inside the recipe modal (intercepted route),
  // we surface a floating close button + kebab menu that replace the inline
  // Edit button at mobile/medium breakpoints. The dialog context being null
  // means we're on the standalone page and should render no modal chrome.
  const modalCtx = useRecipeDetailDialog();
  const inModal = modalCtx != null;
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const replaceImageClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const cropDragRef = useRef<{ lastY: number; pointerId: number } | null>(null);
  const focusYRef = useRef(50);
  const baselineFocusYRef = useRef(50);
  const [isPending, startTransition] = useTransition();
  const [imageBusy, setImageBusy] = useState(false);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  const [focusY, setFocusY] = useState(() => recipeImageFocusYPercent(initial));
  const [cropMode, setCropMode] = useState(false);
  const [name, setName] = useState(() => str(initial.name));
  const [headnote, setHeadnote] = useState(() => str(initial.headnote));
  const [description, setDescription] = useState(() => str(initial.description));
  const [notes, setNotes] = useState(() => str(initial.notes));
  const [sourceUrl, setSourceUrl] = useState(() => str(initial.source_url));
  const [servings, setServings] = useState(() =>
    initial.servings != null ? String(initial.servings) : "",
  );
  // Base servings = what the author stored. View-mode stepper adjusts
  // `viewServings`; the ratio becomes a display-only multiplier for ingredient
  // amounts (nothing is written back to the DB).
  const baseServings = (() => {
    const n = Math.floor(Number(initial.servings));
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const [viewServings, setViewServings] = useState<number | null>(baseServings);
  useEffect(() => {
    setViewServings(baseServings);
  }, [baseServings]);
  const [calories, setCalories] = useState(() =>
    initial.calories != null ? String(initial.calories) : "",
  );
  const [protein, setProtein] = useState(() =>
    initial.protein_grams != null ? String(initial.protein_grams) : "",
  );
  const [fat, setFat] = useState(() =>
    initial.fat_grams != null ? String(initial.fat_grams) : "",
  );
  const [carbs, setCarbs] = useState(() =>
    initial.carbs_grams != null ? String(initial.carbs_grams) : "",
  );
  const [mealTypes, setMealTypes] = useState(() =>
    normalizeMealTypesFromDb(initial.meal_types),
  );
  const [mealTypesError, setMealTypesError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Recipes always open in read-only "view" mode — whether you came from Plan,
  // the recipe list, or a deep link. Authoring UI lives behind the Edit toggle.
  // `editingRequested` tracks the owner's intent; `isEditing` is the derived
  // value that also respects `viewOnly` so community viewers can never flip
  // into edit mode regardless of what state the component is in.
  const [editingRequested, setEditingRequested] = useState(false);
  const isEditing = !viewOnly && editingRequested;
  const toggleEditing = useCallback(() => {
    if (viewOnly) return;
    setEditingRequested((value) => {
      if (value) {
        // Leaving edit mode — flush any in-progress crop gesture so we don't
        // leave the image panel stuck in crop state.
        setCropMode(false);
      }
      return !value;
    });
  }, [viewOnly]);
  const deleteModalTitleId = useId();
  const deleteModalCancelRef = useRef<HTMLButtonElement>(null);
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  focusYRef.current = focusY;

  useEffect(() => {
    const y = recipeImageFocusYPercent(initial);
    baselineFocusYRef.current = y;
    setFocusY(y);
    focusYRef.current = y;
  }, [initial]);

  useEffect(() => {
    setMealTypes(normalizeMealTypesFromDb(initial.meal_types));
    setMealTypesError(null);
  }, [initial]);

  useEffect(() => {
    return () => {
      if (replaceImageClickTimerRef.current) {
        clearTimeout(replaceImageClickTimerRef.current);
      }
    };
  }, []);

  const hasImage = Boolean(primaryImageUrl(initial));
  const [autoGenTimedOut, setAutoGenTimedOut] = useState(false);
  const isAutoGenerating =
    effectiveAutoGenerating && !hasImage && !autoGenTimedOut;

  useEffect(() => {
    if (!isAutoGenerating) return;
    const startedAt = Date.now();
    const MAX_MS = 150_000;
    const interval = setInterval(() => {
      if (Date.now() - startedAt > MAX_MS) {
        setAutoGenTimedOut(true);
        clearInterval(interval);
        return;
      }
      router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [isAutoGenerating, router]);

  useEffect(() => {
    if (!effectiveAutoGenerating) return;
    if (hasImage || autoGenTimedOut) {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("gen")) {
          url.searchParams.delete("gen");
          router.replace(`${url.pathname}${url.search}${url.hash}`);
        }
      }
    }
  }, [effectiveAutoGenerating, hasImage, autoGenTimedOut, router]);

  const save = useCallback(
    (
      patch: Record<string, unknown>,
      opts?: { onFailed?: (message: string) => void },
    ) => {
      startTransition(async () => {
        const r = await updateRecipeAction(initial.id, patch);
        if (r.ok) router.refresh();
        else opts?.onFailed?.(r.error ?? "Could not save.");
      });
    },
    [initial.id, router],
  );

  const blurName = useCallback(() => {
    const next = name.trim();
    if (!next) {
      setName(str(initial.name));
      return;
    }
    if (next === str(initial.name)) return;
    save({ name: next });
  }, [name, initial.name, save]);

  const blurText = useCallback(
    (
      field: "notes" | "description" | "headnote",
      value: string,
      initialVal: string,
    ) => {
      const next = value;
      if (next === initialVal) return;
      save({ [field]: next });
    },
    [save],
  );

  const onDescriptionPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = e.clipboardData.getData("text/plain").trim();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const res = applyMarkdownLinkPaste({
        value: description,
        selStart: start,
        selEnd: end,
        pasted,
        maxLen: RECIPE_DESCRIPTION_MAX_LENGTH,
      });
      if (!res) return;
      e.preventDefault();
      setDescription(res.value);
      queueMicrotask(() => {
        ta.setSelectionRange(res.caret, res.caret);
      });
    },
    [description],
  );

  const onNotesPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = e.clipboardData.getData("text/plain").trim();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const res = applyMarkdownLinkPaste({
        value: notes,
        selStart: start,
        selEnd: end,
        pasted,
      });
      if (!res) return;
      e.preventDefault();
      setNotes(res.value);
      queueMicrotask(() => {
        ta.setSelectionRange(res.caret, res.caret);
      });
    },
    [notes],
  );

  const blurSource = useCallback(() => {
    const next = sourceUrl.trim();
    if (next === str(initial.source_url)) return;
    save({ source_url: next });
  }, [sourceUrl, initial.source_url, save]);

  const commitMealTypes = useCallback(
    (next: string[]) => {
      if (mealTypesEqual(next, initial.meal_types)) return;
      setMealTypesError(null);
      setMealTypes(next);
      save(
        { meal_types: next.length ? next : null },
        {
          onFailed: (msg) => {
            setMealTypes(normalizeMealTypesFromDb(initial.meal_types));
            setMealTypesError(msg);
          },
        },
      );
    },
    [initial.meal_types, save],
  );

  const recipeDisplayName =
    (name.trim() || str(initial.name)).trim() || "this recipe";

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setDeleteError(null);
  }, []);

  const openDeleteModal = useCallback(() => {
    setDeleteError(null);
    setDeleteModalOpen(true);
  }, []);

  const performDeleteRecipe = useCallback(() => {
    setDeleteError(null);
    startTransition(async () => {
      const r = await deleteRecipeAction(initial.id);
      if (r.ok) {
        setDeleteModalOpen(false);
        router.push("/recipes");
        return;
      }
      setDeleteError(r.error ?? "Could not delete recipe.");
    });
  }, [initial.id, router]);

  useEffect(() => {
    if (!deleteModalOpen) return;
    const id = requestAnimationFrame(() =>
      deleteModalCancelRef.current?.focus(),
    );
    return () => cancelAnimationFrame(id);
  }, [deleteModalOpen]);

  useEffect(() => {
    if (!deleteModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDeleteModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleteModalOpen, closeDeleteModal]);

  const blurMeta = useCallback(
    (
      field:
        | "servings"
        | "calories"
        | "protein_grams"
        | "fat_grams"
        | "carbs_grams",
      value: string,
      initialNum: number | null | undefined,
    ) => {
      const parsed = value.trim() === "" ? null : Number(value.trim());
      const prev =
        initialNum == null || Number.isNaN(Number(initialNum))
          ? null
          : Math.trunc(Number(initialNum));
      const next =
        parsed === null || Number.isNaN(parsed) ? null : Math.trunc(parsed);
      if (next === prev) return;
      save({ [field]: next });
    },
    [save],
  );

  const pickImageFile = useCallback(() => {
    setImageMessage(null);
    fileRef.current?.click();
  }, []);

  const uploadRecipeImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setImageMessage("Please use an image file.");
        return;
      }
      if (!isSupabaseConfigured()) {
        setImageMessage("Supabase is not configured.");
        return;
      }
      setImageBusy(true);
      setImageMessage(null);
      try {
        const supabase = createClient();
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${initial.id}-${Date.now()}.${ext}`;
        const bucket = recipeImagesBucket();
        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          setImageMessage("Could not upload image.");
          return;
        }
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
        const url = pub.publicUrl;
        const existing = normalizeImageUrls(initial.image_urls);
        const nextUrls = [url, ...existing.filter((u) => u !== url)];
        const r = await updateRecipeAction(initial.id, {
          image_url: url,
          image_urls: nextUrls,
          image_focus_y: 50,
        });
        if (!r.ok) {
          setImageMessage(r.error ?? "Could not save image.");
          return;
        }
        router.refresh();
      } finally {
        setImageBusy(false);
      }
    },
    [initial.id, initial.image_urls, router],
  );

  const onImageFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      await uploadRecipeImageFile(file);
    },
    [uploadRecipeImageFile],
  );

  const onPhotoDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (isPending || imageBusy) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    [isPending, imageBusy],
  );

  const onPhotoDragEnter = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (isPending || imageBusy) return;
      e.preventDefault();
      e.stopPropagation();
      setIsImageDragOver(true);
    },
    [isPending, imageBusy],
  );

  const onPhotoDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    const next = e.relatedTarget;
    const root = panelRef.current;
    if (next instanceof Node && root?.contains(next)) return;
    setIsImageDragOver(false);
  }, []);

  const onPhotoDrop = useCallback(
    async (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsImageDragOver(false);
      if (isPending || imageBusy) return;
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      await uploadRecipeImageFile(file);
    },
    [uploadRecipeImageFile, isPending, imageBusy],
  );

  const clearRecipeImage = useCallback(
    (e?: MouseEvent<HTMLButtonElement>) => {
      e?.stopPropagation();
      e?.preventDefault();
      if (!primaryImageUrl(initial)) return;
      setImageMessage(null);
      setCropMode(false);
      startTransition(async () => {
        const r = await updateRecipeAction(initial.id, {
          image_url: null,
          image_urls: null,
          image_focus_y: null,
        });
        if (!r.ok) setImageMessage(r.error ?? "Could not remove image.");
        else router.refresh();
      });
    },
    [initial, router],
  );

  const handleGenerateImage = useCallback(async () => {
    if (isGeneratingImage || imageBusy || isPending) return;
    setIsGeneratingImage(true);
    setImageMessage(null);
    const toastId = toast.loading("Generating recipe image…", {
      description: "This usually takes 15–30 seconds.",
    });
    try {
      const result = await generateRecipeImageAction(initial.id);
      if (result.ok) {
        toast.success("Recipe image generated", { id: toastId });
        router.refresh();
      } else {
        toast.error("Image generation failed", {
          id: toastId,
          description: result.error,
        });
        setImageMessage(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Image generation failed.";
      toast.error("Image generation failed", { id: toastId, description: msg });
      setImageMessage(msg);
    } finally {
      setIsGeneratingImage(false);
    }
  }, [initial.id, isGeneratingImage, imageBusy, isPending, router]);

  const onPhotoAreaClick = useCallback(() => {
    if (cropMode || imageBusy || isPending) return;
    if (replaceImageClickTimerRef.current !== null) {
      clearTimeout(replaceImageClickTimerRef.current);
      replaceImageClickTimerRef.current = null;
      setCropMode(true);
      setImageMessage(null);
      return;
    }
    replaceImageClickTimerRef.current = setTimeout(() => {
      replaceImageClickTimerRef.current = null;
      pickImageFile();
    }, 280);
  }, [cropMode, imageBusy, isPending, pickImageFile]);

  const onPhotoDoubleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (cropMode || imageBusy || isPending) return;
      if (replaceImageClickTimerRef.current) {
        clearTimeout(replaceImageClickTimerRef.current);
        replaceImageClickTimerRef.current = null;
      }
      setCropMode(true);
      setImageMessage(null);
    },
    [cropMode, imageBusy, isPending],
  );

  const persistFocusIfDirty = useCallback(() => {
    const y = focusYRef.current;
    if (y === baselineFocusYRef.current) return;
    save({ image_focus_y: y });
    baselineFocusYRef.current = y;
  }, [save]);

  const exitCropMode = useCallback(() => {
    setCropMode(false);
    persistFocusIfDirty();
  }, [persistFocusIfDirty]);

  useEffect(() => {
    if (!cropMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      exitCropMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cropMode, exitCropMode]);

  useEffect(() => {
    if (!cropMode) return;
    const onDown = (e: globalThis.MouseEvent) => {
      const root = panelRef.current;
      if (!root || root.contains(e.target as Node)) return;
      exitCropMode();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [cropMode, exitCropMode]);

  const onCropPointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    if (!cropMode) return;
    e.preventDefault();
    e.stopPropagation();
    cropDragRef.current = { lastY: e.clientY, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [cropMode]);

  const onCropPointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (!cropMode || !cropDragRef.current || cropDragRef.current.pointerId !== e.pointerId)
        return;
      const dy = e.clientY - cropDragRef.current.lastY;
      cropDragRef.current.lastY = e.clientY;
      const h = panelRef.current?.getBoundingClientRect().height ?? 1;
      const deltaPct = -(dy / h) * 100;
      setFocusY((prev) => {
        const n = Math.min(100, Math.max(0, Math.round(prev + deltaPct)));
        focusYRef.current = n;
        return n;
      });
    },
    [cropMode],
  );

  const onCropPointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (!cropDragRef.current || cropDragRef.current.pointerId !== e.pointerId) return;
      cropDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const y = focusYRef.current;
      if (y !== baselineFocusYRef.current) {
        save({ image_focus_y: y });
        baselineFocusYRef.current = y;
      }
    },
    [save],
  );

  const img = primaryImageUrl(initial);

  // Compact nutrition summary for view mode — only show values that exist.
  // Servings is rendered separately (just above the Ingredients list) per the
  // current design, so it's deliberately omitted from this inline row.
  const viewNutritionParts: { key: string; value: string; unit: string }[] = [];
  if (initial.calories != null)
    viewNutritionParts.push({ key: "calories", value: String(initial.calories), unit: "kcal" });
  if (initial.protein_grams != null)
    viewNutritionParts.push({ key: "protein", value: `${initial.protein_grams}g`, unit: "protein" });
  if (initial.fat_grams != null)
    viewNutritionParts.push({ key: "fat", value: `${initial.fat_grams}g`, unit: "fat" });
  if (initial.carbs_grams != null)
    viewNutritionParts.push({ key: "carbs", value: `${initial.carbs_grams}g`, unit: "carbs" });

  const servingsLabel =
    initial.servings != null && Number(initial.servings) > 0
      ? `Serves ${initial.servings}`
      : null;

  // View-mode ingredient scale: 1 when no base servings, otherwise current /
  // base. Clamp the stepper to a sensible range so users can't divide by zero
  // or ask for 500 servings by accident.
  const VIEW_SERVINGS_MIN = 1;
  const VIEW_SERVINGS_MAX = 99;
  const servingsScale =
    !isEditing && baseServings && viewServings && viewServings > 0
      ? viewServings / baseServings
      : 1;
  const decrementViewServings = useCallback(() => {
    setViewServings((cur) => {
      const n = cur ?? baseServings ?? VIEW_SERVINGS_MIN;
      return Math.max(VIEW_SERVINGS_MIN, n - 1);
    });
  }, [baseServings]);
  const incrementViewServings = useCallback(() => {
    setViewServings((cur) => {
      const n = cur ?? baseServings ?? VIEW_SERVINGS_MIN;
      return Math.min(VIEW_SERVINGS_MAX, n + 1);
    });
  }, [baseServings]);

  const deleteConfirmModal =
    isClient && deleteModalOpen ? (
      <div className="modal open" aria-hidden="false" role="presentation">
        <button
          type="button"
          className="modal-backdrop"
          aria-label="Close delete confirmation"
          onClick={closeDeleteModal}
        />
        <div
          className="modal-card modal-delete-recipe"
          role="dialog"
          aria-modal="true"
          aria-labelledby={deleteModalTitleId}
        >
          <button
            type="button"
            className="modal-close icon-ghost"
            aria-label="Close"
            onClick={closeDeleteModal}
          >
            <i className="ph ph-x" aria-hidden="true" />
          </button>
          <div className="delete-ingredient-modal-body">
            <h2 id={deleteModalTitleId} className="delete-ingredient-modal-title">
              Delete recipe
            </h2>
            <p className="delete-ingredient-modal-warning">
              Delete <strong>{recipeDisplayName}</strong>? This cannot be undone.
            </p>
            {deleteError ? (
              <p className="delete-ingredient-modal-error" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="delete-ingredient-modal-actions">
              <button
                ref={deleteModalCancelRef}
                type="button"
                className="delete-ingredient-modal-cancel"
                onClick={closeDeleteModal}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-ingredient-modal-confirm"
                onClick={performDeleteRecipe}
                disabled={isPending}
              >
                {isPending ? "Deleting…" : "Delete recipe"}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <RecipeEditModeProvider mode={isEditing ? "edit" : "view"}>
    <RecipeServingsScaleProvider scale={servingsScale}>
    <article
      className={[
        "recipe-detail",
        `recipe-detail--${isEditing ? "edit" : "view"}`,
        inModal ? "recipe-detail--in-modal" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {inModal ? (
        <RecipeDetailOverlayChrome
          onClose={() => modalCtx?.close()}
          onEdit={viewOnly ? null : toggleEditing}
          onDelete={viewOnly ? null : openDeleteModal}
          sourceUrl={initial.source_url}
          extraMenuItems={overlayExtraMenuItems}
        />
      ) : null}
      <div className="recipe-detail-layout">
        <div className="recipe-detail-main">
          {isEditing ? (
            <input
              type="text"
              className="recipe-detail-title-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={blurName}
              disabled={isPending}
              aria-label="Recipe name"
            />
          ) : (
            (() => {
              const primary =
                str(initial.title_primary).trim() ||
                str(initial.name).trim();
              const qualifier = str(initial.title_primary).trim()
                ? str(initial.title_qualifier).trim()
                : "";
              return (
                <h1 className="recipe-detail-title-static">
                  {primary || "Untitled recipe"}
                  {qualifier ? (
                    <>
                      {" "}
                      <span className="recipe-detail-title-qualifier-static">
                        {qualifier}
                      </span>
                    </>
                  ) : null}
                </h1>
              );
            })()
          )}
          {isEditing ? (
            <textarea
              className="recipe-pre recipe-detail-textarea recipe-detail-headnote-input"
              value={headnote}
              onChange={(e) => setHeadnote(e.target.value)}
              onBlur={() =>
                blurText("headnote", headnote, str(initial.headnote))
              }
              disabled={isPending}
              rows={3}
              aria-label="Recipe headnote"
              placeholder="Editorial intro / headnote (optional)…"
            />
          ) : str(initial.headnote).trim() ? (
            <p className="recipe-pre recipe-detail-headnote-static">
              {str(initial.headnote)}
            </p>
          ) : null}
          {isEditing ? (
            <textarea
              className="recipe-pre recipe-detail-textarea recipe-detail-description-input"
              value={description}
              onChange={(e) =>
                setDescription(
                  e.target.value.slice(0, RECIPE_DESCRIPTION_MAX_LENGTH),
                )
              }
              onPaste={onDescriptionPaste}
              onBlur={() =>
                blurText("description", description, str(initial.description))
              }
              disabled={isPending}
              rows={3}
              maxLength={RECIPE_DESCRIPTION_MAX_LENGTH}
              aria-label="Recipe description"
              placeholder="Short description…"
            />
          ) : str(initial.description).trim() ? (
            <RecipeDescriptionRichText
              as="p"
              className="recipe-pre recipe-detail-description-static"
              text={str(initial.description)}
            />
          ) : null}
      <RecipeIngredientUnitDisplayProvider>
      {!isEditing && (baseServings || servingsLabel || recipeIngredients.length > 0) ? (
        <div className="recipe-detail-ingredients-meta-row">
          {baseServings ? (
            <div
              className="recipe-detail-servings-stepper"
              role="group"
              aria-label="Adjust servings to scale ingredient amounts"
            >
              <button
                type="button"
                className="recipe-detail-servings-stepper-btn"
                onClick={decrementViewServings}
                disabled={(viewServings ?? baseServings) <= VIEW_SERVINGS_MIN}
                aria-label="Decrease servings"
              >
                <Minus size={12} weight="bold" aria-hidden />
              </button>
              <span className="recipe-detail-servings-stepper-label">
                {viewServings ?? baseServings} servings
              </span>
              <button
                type="button"
                className="recipe-detail-servings-stepper-btn"
                onClick={incrementViewServings}
                disabled={(viewServings ?? baseServings) >= VIEW_SERVINGS_MAX}
                aria-label="Increase servings"
              >
                <Plus size={12} weight="bold" aria-hidden />
              </button>
            </div>
          ) : str(initial.yield_display).trim() ? (
            <p className="recipe-detail-servings-static">
              {str(initial.yield_display)}
            </p>
          ) : servingsLabel ? (
            <p className="recipe-detail-servings-static">{servingsLabel}</p>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      ) : null}
      <RecipeIngredientsEditor
        recipeId={initial.id}
        initialItems={recipeIngredients}
        initialSections={recipeIngredientSections}
        ingredientOptions={availableIngredients}
      />
      </RecipeIngredientUnitDisplayProvider>
      <section className="section">
        <h3>Instructions</h3>
        <RecipeInstructionsEditor recipeId={initial.id} recipeName={initial.name} initialSteps={recipeInstructionSteps} />
      </section>
      {(() => {
        const noteTypeLabels: Record<string, string> = {
          note: "Note",
          variation: "Variation",
          storage: "Storage",
          substitution: "Substitution",
        };
        const noteHeading =
          str(initial.notes_title).trim() ||
          (initial.notes_type ? noteTypeLabels[initial.notes_type] : null) ||
          "Notes";

        if (isEditing) {
          return (
            <section className="section">
              <h3>{noteHeading}</h3>
              <textarea
                className="recipe-pre recipe-detail-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onPaste={onNotesPaste}
                onBlur={() => blurText("notes", notes, str(initial.notes))}
                disabled={isPending}
                rows={4}
                aria-label="Notes"
                placeholder="Optional notes…"
              />
            </section>
          );
        }

        return str(initial.notes).trim() ? (
          <section className="section">
            <h3>{noteHeading}</h3>
            <p className="recipe-pre recipe-detail-notes-static">
              {str(initial.notes)}
            </p>
          </section>
        ) : null;
      })()}
      {isEditing ? (
      <div className="meta recipe-detail-meta-editable">
        <label className="recipe-meta-field recipe-meta-field--nutrition recipe-meta-field--nutrition-servings">
          <span className="recipe-meta-label">Servings</span>
          <span className="recipe-nutrition-field">
            <input
              type="text"
              inputMode="numeric"
              className="recipe-nutrition-value-input"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              onBlur={() => blurMeta("servings", servings, initial.servings)}
              disabled={isPending}
              aria-label="Number of servings"
            />
            <span className="recipe-nutrition-unit" aria-hidden="true">
              servings
            </span>
          </span>
        </label>
        <label className="recipe-meta-field recipe-meta-field--nutrition recipe-meta-field--nutrition-grow">
          <span className="recipe-meta-label">Calories</span>
          <span className="recipe-nutrition-field">
            <input
              type="text"
              inputMode="numeric"
              className="recipe-nutrition-value-input"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              onBlur={() => blurMeta("calories", calories, initial.calories)}
              disabled={isPending}
              aria-label="Calories"
            />
            <span className="recipe-nutrition-unit" aria-hidden="true">
              kcal
            </span>
          </span>
        </label>
        <label className="recipe-meta-field recipe-meta-field--nutrition recipe-meta-field--nutrition-grow">
          <span className="recipe-meta-label">Protein</span>
          <span className="recipe-nutrition-field">
            <input
              type="text"
              inputMode="numeric"
              className="recipe-nutrition-value-input"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              onBlur={() => blurMeta("protein_grams", protein, initial.protein_grams)}
              disabled={isPending}
              aria-label="Protein in grams"
            />
            <span className="recipe-nutrition-unit" aria-hidden="true">
              g
            </span>
          </span>
        </label>
        <label className="recipe-meta-field recipe-meta-field--nutrition recipe-meta-field--nutrition-grow">
          <span className="recipe-meta-label">Fat</span>
          <span className="recipe-nutrition-field">
            <input
              type="text"
              inputMode="numeric"
              className="recipe-nutrition-value-input"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              onBlur={() => blurMeta("fat_grams", fat, initial.fat_grams)}
              disabled={isPending}
              aria-label="Fat in grams"
            />
            <span className="recipe-nutrition-unit" aria-hidden="true">
              g
            </span>
          </span>
        </label>
        <label className="recipe-meta-field recipe-meta-field--nutrition recipe-meta-field--nutrition-grow">
          <span className="recipe-meta-label">Carb</span>
          <span className="recipe-nutrition-field">
            <input
              type="text"
              inputMode="numeric"
              className="recipe-nutrition-value-input"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              onBlur={() => blurMeta("carbs_grams", carbs, initial.carbs_grams)}
              disabled={isPending}
              aria-label="Carbohydrate in grams"
            />
            <span className="recipe-nutrition-unit" aria-hidden="true">
              g
            </span>
          </span>
        </label>
      </div>
      ) : viewNutritionParts.length ? (
        <ul className="recipe-detail-meta-static">
          {viewNutritionParts.map((part) => (
            <li key={part.key} className="recipe-detail-meta-static-item">
              <span className="recipe-detail-meta-static-value">{part.value}</span>
              <span className="recipe-detail-meta-static-unit">{part.unit}</span>
            </li>
          ))}
        </ul>
      ) : null}
        </div>
        <aside className="recipe-detail-aside" aria-label="Recipe image and recipe options">
          <div className="recipe-detail-aside-stack">
          {isAutoGenerating ? (
            <AiImagePlaceholder
              variant="generate"
              size="full"
              ariaLabel="Generating recipe image"
            />
          ) : effectiveAutoGenerating && autoGenTimedOut && !img && isEditing ? (
            <p className="recipe-detail-image-message" role="status">
              Image is still being generated. Try refreshing in a moment, or click Regenerate image below.
            </p>
          ) : null}
          {isEditing && !isAutoGenerating ? (
          <div
            ref={panelRef}
            className={[
              "recipe-detail-photo-panel",
              !img ? "recipe-detail-photo-panel--empty" : "",
              isImageDragOver ? "recipe-detail-photo-panel--drag-over" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onDragEnter={onPhotoDragEnter}
            onDragLeave={onPhotoDragLeave}
            onDragOver={onPhotoDragOver}
            onDrop={onPhotoDrop}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="visually-hidden"
              aria-hidden
              tabIndex={-1}
              onChange={onImageFileChange}
            />
            {img ? (
              <>
                <button
                  type="button"
                  className={[
                    "recipe-detail-photo",
                    cropMode ? "recipe-detail-photo--crop-mode" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={onPhotoAreaClick}
                  onDoubleClick={onPhotoDoubleClick}
                  onDragEnter={onPhotoDragEnter}
                  onDragLeave={onPhotoDragLeave}
                  onDragOver={onPhotoDragOver}
                  onDrop={onPhotoDrop}
                  onPointerDown={onCropPointerDown}
                  onPointerMove={onCropPointerMove}
                  onPointerUp={onCropPointerUp}
                  onPointerCancel={onCropPointerUp}
                  disabled={isPending || imageBusy}
                  aria-pressed={cropMode}
                  aria-label={
                    cropMode
                      ? "Drag up or down to set framing. Press Escape when done."
                      : "Click once to replace image, or two quick clicks to adjust framing. You can also drop a file."
                  }
                  style={{
                    backgroundImage: `url('${img}')`,
                    backgroundPosition: `center ${focusY}%`,
                  }}
                />
                {cropMode ? (
                  <p className="recipe-detail-crop-hint">Drag up or down · Esc to finish</p>
                ) : null}
                <button
                  type="button"
                  className="recipe-detail-image-remove"
                  onClick={clearRecipeImage}
                  disabled={isPending || imageBusy}
                  aria-label="Remove recipe image"
                >
                  ×
                </button>
              </>
            ) : (
              <button
                type="button"
                className="recipe-detail-photo-add"
                onClick={pickImageFile}
                onDragEnter={onPhotoDragEnter}
                onDragLeave={onPhotoDragLeave}
                onDragOver={onPhotoDragOver}
                onDrop={onPhotoDrop}
                disabled={isPending || imageBusy || !isSupabaseConfigured()}
                aria-label="Add recipe image. You can also drop an image file here."
              >
                {imageBusy ? "…" : isImageDragOver ? "Drop image" : "Add image"}
              </button>
            )}
          </div>
          ) : img ? (
            <div
              className="recipe-detail-photo-panel recipe-detail-photo-panel--static"
              aria-label="Recipe image"
            >
              <div
                className="recipe-detail-photo recipe-detail-photo--static"
                role="img"
                aria-label={`Image for ${str(initial.name).trim() || "recipe"}`}
                style={{
                  backgroundImage: `url('${img}')`,
                  backgroundPosition: `center ${focusY}%`,
                }}
              />
            </div>
          ) : null}
          {!isEditing ? (
            <div className="recipe-detail-aside-edit-wrap">
              {viewOnly ? (
                asideActionSlot
              ) : (
                <button
                  type="button"
                  className="recipe-detail-mode-btn"
                  onClick={toggleEditing}
                  aria-label="Edit recipe"
                >
                  Edit
                </button>
              )}
            </div>
          ) : null}
          {isEditing && !isAutoGenerating ? (
            <div className="recipe-detail-generate-image-wrap">
              <button
                type="button"
                className="secondary recipe-detail-generate-image-btn"
                onClick={handleGenerateImage}
                disabled={isGeneratingImage || imageBusy || isPending}
                aria-label={
                  img
                    ? "Regenerate recipe image with AI"
                    : "Generate a recipe image with AI"
                }
              >
                {isGeneratingImage
                  ? "Generating…"
                  : img
                    ? "Regenerate image"
                    : "Generate image"}
              </button>
            </div>
          ) : null}
          {isEditing && imageMessage ? (
            <p className="recipe-detail-image-message" role="status">
              {imageMessage}
            </p>
          ) : null}
          {isEditing ? (
            <RecipeMealTypesField
              value={mealTypes}
              disabled={isPending}
              onCommit={commitMealTypes}
            />
          ) : null}
          {isEditing && mealTypesError ? (
            <p className="recipe-detail-image-message" role="alert">
              {mealTypesError}
            </p>
          ) : null}
          {isEditing ? (
            <section className="section recipe-source-section">
              <p className="recipe-source-row">
                <label className="recipe-source-label" htmlFor="recipe-source-url">
                  Recipe link
                </label>
                <input
                  id="recipe-source-url"
                  type="url"
                  className="recipe-source-input"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  onBlur={blurSource}
                  disabled={isPending}
                  placeholder="https://…"
                />
              </p>
              {sourceUrl.trim() ? (
                <p className="recipe-source-open-wrap">
                  <a className="source-link" href={sourceUrl.trim()} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                </p>
              ) : null}
            </section>
          ) : null}
          {isEditing ? (
            <div className="recipe-detail-delete-wrap">
              <button
                type="button"
                className="recipe-detail-mode-btn recipe-detail-mode-btn--editing"
                onClick={toggleEditing}
                aria-pressed={isEditing}
                aria-label="Finish editing recipe"
              >
                Done
              </button>
              <button
                type="button"
                className="recipe-detail-delete"
                onClick={openDeleteModal}
                disabled={isPending}
              >
                Delete recipe
              </button>
            </div>
          ) : null}
          </div>
        </aside>
      </div>
    </article>
    {deleteConfirmModal ? createPortal(deleteConfirmModal, document.body) : null}
    </RecipeServingsScaleProvider>
    </RecipeEditModeProvider>
  );
}
