"use client";

import { updateRecipeAction } from "@/app/actions/recipes";
import { RecipeIngredientsEditor } from "@/components/recipe-ingredients-editor";
import { isSupabaseConfigured, recipeImagesBucket } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { primaryImageUrl, recipeImageFocusYPercent } from "@/lib/recipes";
import type {
  RecipeIngredientRow,
  RecipeIngredientSectionRow,
  RecipeRow,
} from "@/types/database";
import { LimitedRecipeTextField } from "@/components/limited-recipe-text-field";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

type RecipeIngredientOption = {
  id: number;
  name: string;
};

type Props = {
  recipe: RecipeRow;
  recipeIngredients: RecipeIngredientRow[];
  recipeIngredientSections: RecipeIngredientSectionRow[];
  availableIngredients: RecipeIngredientOption[];
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
  availableIngredients,
}: Props) {
  const router = useRouter();
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
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  const [focusY, setFocusY] = useState(() => recipeImageFocusYPercent(initial));
  const [cropMode, setCropMode] = useState(false);
  const [name, setName] = useState(() => str(initial.name));
  const [instructions, setInstructions] = useState(() => str(initial.instructions));
  const [notes, setNotes] = useState(() => str(initial.notes));
  const [sourceUrl, setSourceUrl] = useState(() => str(initial.source_url));
  const [servings, setServings] = useState(() =>
    initial.servings != null ? String(initial.servings) : "",
  );
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

  focusYRef.current = focusY;

  useEffect(() => {
    const y = recipeImageFocusYPercent(initial);
    baselineFocusYRef.current = y;
    setFocusY(y);
    focusYRef.current = y;
  }, [initial]);

  useEffect(() => {
    return () => {
      if (replaceImageClickTimerRef.current) {
        clearTimeout(replaceImageClickTimerRef.current);
      }
    };
  }, []);

  const save = useCallback(
    (patch: Record<string, unknown>) => {
      startTransition(async () => {
        const r = await updateRecipeAction(initial.id, patch);
        if (r.ok) router.refresh();
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
    (field: "ingredients" | "instructions" | "notes", value: string, initialVal: string) => {
      const next = value;
      if (next === initialVal) return;
      save({ [field]: next });
    },
    [save],
  );

  const blurSource = useCallback(() => {
    const next = sourceUrl.trim();
    if (next === str(initial.source_url)) return;
    save({ source_url: next });
  }, [sourceUrl, initial.source_url, save]);

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

  return (
    <article className="recipe-detail">
      <div className="recipe-detail-layout">
        <div className="recipe-detail-main">
          <input
            type="text"
            className="recipe-detail-title-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={blurName}
            disabled={isPending}
            aria-label="Recipe name"
          />
          {imageMessage ? (
            <p className="recipe-detail-image-message" role="status">
              {imageMessage}
            </p>
          ) : null}
          <div className="meta recipe-detail-meta-editable">
        <label className="recipe-meta-field">
          <span className="recipe-meta-label">Servings</span>
          <input
            type="text"
            inputMode="numeric"
            className="recipe-meta-input"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            onBlur={() => blurMeta("servings", servings, initial.servings)}
            disabled={isPending}
            aria-label="Servings"
          />
        </label>
        <label className="recipe-meta-field">
          <span className="recipe-meta-label">Cal</span>
          <input
            type="text"
            inputMode="numeric"
            className="recipe-meta-input"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            onBlur={() => blurMeta("calories", calories, initial.calories)}
            disabled={isPending}
            aria-label="Calories"
          />
        </label>
        <label className="recipe-meta-field">
          <span className="recipe-meta-label">P g</span>
          <input
            type="text"
            inputMode="numeric"
            className="recipe-meta-input"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            onBlur={() => blurMeta("protein_grams", protein, initial.protein_grams)}
            disabled={isPending}
            aria-label="Protein grams"
          />
        </label>
        <label className="recipe-meta-field">
          <span className="recipe-meta-label">F g</span>
          <input
            type="text"
            inputMode="numeric"
            className="recipe-meta-input"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            onBlur={() => blurMeta("fat_grams", fat, initial.fat_grams)}
            disabled={isPending}
            aria-label="Fat grams"
          />
        </label>
        <label className="recipe-meta-field">
          <span className="recipe-meta-label">C g</span>
          <input
            type="text"
            inputMode="numeric"
            className="recipe-meta-input"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            onBlur={() => blurMeta("carbs_grams", carbs, initial.carbs_grams)}
            disabled={isPending}
            aria-label="Carbs grams"
          />
        </label>
      </div>
      <RecipeIngredientsEditor
        recipeId={initial.id}
        initialItems={recipeIngredients}
        initialSections={recipeIngredientSections}
        ingredientOptions={availableIngredients}
      />
      <section className="section">
        <h3>Instructions</h3>
        <LimitedRecipeTextField
          variant="instructions"
          value={instructions}
          onChange={setInstructions}
          onBlur={() =>
            blurText("instructions", instructions, str(initial.instructions))
          }
          disabled={isPending}
          rows={12}
          ariaLabel="Instructions"
          placeholder="Steps…"
        />
      </section>
      <section className="section">
        <h3>Notes</h3>
        <textarea
          className="recipe-pre recipe-detail-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => blurText("notes", notes, str(initial.notes))}
          disabled={isPending}
          rows={4}
          aria-label="Notes"
          placeholder="Optional notes…"
        />
      </section>
      <section className="section recipe-source-section">
        <p className="recipe-source-row">
          <label className="recipe-source-label" htmlFor="recipe-source-url">
            Source URL
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
        </div>
        <aside className="recipe-detail-aside" aria-label="Recipe image">
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
        </aside>
      </div>
    </article>
  );
}
