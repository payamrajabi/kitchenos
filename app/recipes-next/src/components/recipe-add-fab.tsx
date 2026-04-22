"use client";

import { createRecipeAndRedirectAction } from "@/app/actions/recipes";
import {
  importRecipeFromUrlAction,
  importRecipeFromIntakeAction,
} from "@/app/actions/recipe-import";
import { useDraftImports } from "@/components/draft-imports-provider";
import { useRecipeDetailDialog } from "@/components/recipe-detail-dialog";
import { prepareImagesForRecipeImport } from "@/lib/recipe-import/prepare-image-for-import";
import {
  PencilLine,
  Plus,
  ArrowUp,
  ShuffleAngular,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

const PLACEHOLDER_WIDE =
  "Paste a recipe link, describe a recipe, or drop photos…";
const PLACEHOLDER_NARROW = "Add recipe link, text or image";
const NARROW_VIEWPORT_QUERY = "(max-width: 640px)";

export const DRAFT_STORAGE_KEY = "kitchenos-recipe-draft";

type AttachedImage = {
  id: string;
  previewUrl: string;
  file: File;
};

function makeAttachedImage(file: File): AttachedImage {
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    previewUrl: URL.createObjectURL(file),
    file,
  };
}

// A conservative URL detector: a single token starting with http(s)://.
function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/\s/.test(trimmed)) return false;
  return /^https?:\/\/\S+$/i.test(trimmed);
}

// Fallback cap for the textarea height before the viewport-aware cap has
// been measured (runs once per resize). The live cap leaves at least
// VIEWPORT_TOP_GUTTER px of breathing room above the top of the pill.
const FALLBACK_MAX_INPUT_HEIGHT = 256;
const VIEWPORT_TOP_GUTTER = 128;
// Extra headroom added above the bar so the progressive blur has room to
// fade out cleanly into the page content above it.
const BLUR_EXTRA_TOP = 128;
// Anything taller than this counts as "multi-line" and drops the buttons
// into a footer row below the text. Single-line height ≈ 36px, so a little
// headroom avoids flicker from sub-pixel measurements.
const MULTILINE_THRESHOLD = 44;
// How far the user has to scroll before the refine bar collapses into a
// FAB. Small enough to react to intentional scrolling, big enough that
// momentum overshoots on the first paint don't trigger a false collapse.
const COLLAPSE_SCROLL_THRESHOLD = 80;

type RecipeAddFabProps = {
  /** When set (recipe detail), imports refine this recipe and jump to draft review. */
  baseRecipeId?: number;
  /** Gallery: show “blank recipe” pencil. Recipe detail: hide (refine uses the bar only). */
  showManualButton?: boolean;
};

export function RecipeAddFab({
  baseRecipeId,
  showManualButton = true,
}: RecipeAddFabProps = {}) {
  const router = useRouter();
  const { startImport, getDraftData } = useDraftImports();
  // When this component is rendered inside the recipe-detail <dialog>
  // (the intercepted route used when you tap a recipe from the gallery),
  // this context is non-null. We use that to switch the bar from a
  // viewport-fixed overlay into a sticky footer inside the modal card.
  const modalCtx = useRecipeDetailDialog();
  const isInModalFooter = modalCtx != null;
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const dragDepthRef = useRef(0);
  const [isPending, startTransition] = useTransition();
  const [placeholder, setPlaceholder] = useState(PLACEHOLDER_WIDE);

  // Scroll-driven collapse: on recipe detail, once the user scrolls past
  // COLLAPSE_SCROLL_THRESHOLD the bar tucks away into a small FAB in the
  // bottom-right. userExpanded is set when the user explicitly taps the
  // FAB, which forces the full bar open until they scroll back to the top.
  const [isScrolledPast, setIsScrolledPast] = useState(false);
  const [userExpanded, setUserExpanded] = useState(false);

  // Avoid infinite oscillation when a layout switch changes the textarea's
  // effective width, which in turn changes scrollHeight measurements.
  const skipModeUpdateRef = useRef(false);

  // Resize the textarea to fit its content, capped so the top of the bar
  // always stays at least VIEWPORT_TOP_GUTTER px below the top of the
  // viewport. Also flags whether we've wrapped past a single line so the
  // layout can switch.
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scroll = el.scrollHeight;

    // Compute the tallest the textarea can be without the pill's top edge
    // rising above the 128px gutter at the top of the viewport. "Chrome"
    // here is everything in the bar other than the textarea itself
    // (padding, borders, attached image thumbs, footer row, etc.).
    let maxHeight = FALLBACK_MAX_INPUT_HEIGHT;
    const bar = barRef.current;
    if (bar && typeof window !== "undefined") {
      const barRect = bar.getBoundingClientRect();
      const textareaRect = el.getBoundingClientRect();
      const chrome = Math.max(0, barRect.height - textareaRect.height);
      const bottomGap = Math.max(0, window.innerHeight - barRect.bottom);
      const ceiling =
        window.innerHeight - VIEWPORT_TOP_GUTTER - bottomGap - chrome;
      if (ceiling > MULTILINE_THRESHOLD) {
        maxHeight = ceiling;
      }
    }

    const next = Math.min(scroll, maxHeight);
    el.style.height = `${next}px`;
    if (!skipModeUpdateRef.current) {
      setIsMultiLine(scroll > MULTILINE_THRESHOLD);
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  // After the layout mode flips, the textarea's effective width changes, so
  // re-measure the height at the new width. Guard the flag so this call
  // doesn't toggle the mode back and cause oscillation.
  useLayoutEffect(() => {
    skipModeUpdateRef.current = true;
    autoResize();
    skipModeUpdateRef.current = false;
  }, [isMultiLine, autoResize]);

  // Keep the blur height in sync with the live bar height. The blur itself
  // is a fixed-position element spanning the full viewport width, and its
  // vertical extent is driven by the --ai-bar-blur-height custom property
  // we set on the wrap: bar height + 64px of extra headroom above + the
  // gap between the bar and the bottom of the viewport.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wrap = wrapRef.current;
    const bar = barRef.current;
    if (!wrap || !bar) return;

    const update = () => {
      const rect = bar.getBoundingClientRect();
      const bottomGap = Math.max(0, window.innerHeight - rect.bottom);
      const total = Math.round(rect.height + BLUR_EXTRA_TOP + bottomGap);
      wrap.style.setProperty("--ai-bar-blur-height", `${total}px`);
    };

    update();

    // Re-measure whenever the bar resizes (textarea grows, thumbs appear,
    // layout flips between single- and multi-line) or the viewport changes.
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(bar);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // When the viewport resizes, recompute the textarea's allowed height so
  // the 128px top-gutter guarantee survives rotation / window resize.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => autoResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [autoResize]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const update = () => {
      setPlaceholder(mq.matches ? PLACEHOLDER_NARROW : PLACEHOLDER_WIDE);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Track whether the scroll container has moved past the collapse
  // threshold. When the bar is rendered as a footer inside the recipe
  // detail <dialog>, the scrolling happens inside the dialog surface (it
  // has overflow-y: auto), not on the window. Otherwise we track the
  // window scroll as usual. rAF-throttled so we don't thrash React state
  // on every scroll event.
  const modalSurfaceEl = modalCtx?.surfaceEl ?? null;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const useSurface = isInModalFooter && modalSurfaceEl != null;
    const target: HTMLElement | Window = useSurface
      ? modalSurfaceEl
      : window;
    let raf = 0;
    const read = () => {
      raf = 0;
      const scrollY = useSurface
        ? (modalSurfaceEl as HTMLElement).scrollTop
        : window.scrollY;
      const next = scrollY > COLLAPSE_SCROLL_THRESHOLD;
      setIsScrolledPast((prev) => (prev === next ? prev : next));
      // When the user scrolls back to the top, drop the "explicitly
      // expanded" flag so the next scroll-down collapses cleanly.
      if (!next) setUserExpanded(false);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(read);
    };
    read();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isInModalFooter, modalSurfaceEl]);

  const imagesRef = useRef<AttachedImage[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) {
        URL.revokeObjectURL(img.previewUrl);
      }
    };
  }, []);

  const reset = useCallback(() => {
    setText("");
    setImages((prev) => {
      for (const img of prev) URL.revokeObjectURL(img.previewUrl);
      return [];
    });
    setError(null);
  }, []);

  const handleFromScratch = useCallback(() => {
    setError(null);
    startTransition(async () => {
      await createRecipeAndRedirectAction();
    });
  }, []);

  const navigateToDraftWhenRefining = useCallback(
    (draftId: string) => {
      if (baseRecipeId == null) return;
      const data = getDraftData(draftId);
      if (!data) return;
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
      sessionStorage.setItem("kitchenos-active-draft-id", draftId);
      router.push("/recipe-draft");
    },
    [baseRecipeId, getDraftData, router],
  );

  const importReadyOpts = useMemo(
    () =>
      baseRecipeId != null
        ? { onReady: navigateToDraftWhenRefining }
        : undefined,
    [baseRecipeId, navigateToDraftWhenRefining],
  );

  const handleFiles = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length) return;
    const imageFiles = Array.from(files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!imageFiles.length) {
      setError("Please select image files.");
      return;
    }
    setError(null);
    setImages((prev) => [...prev, ...imageFiles.map(makeAttachedImage)]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const next: AttachedImage[] = [];
      for (const img of prev) {
        if (img.id === id) {
          URL.revokeObjectURL(img.previewUrl);
        } else {
          next.push(img);
        }
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    const attached = images;

    // Link-only submission: no images + single URL token.
    if (!attached.length && looksLikeUrl(trimmed)) {
      startImport(
        "Importing from recipe link…",
        () => importRecipeFromUrlAction(trimmed, { baseRecipeId }),
        importReadyOpts,
      );
      reset();
      return;
    }

    if (!trimmed && !attached.length) return;

    const label = attached.length
      ? trimmed
        ? "Importing from image and text…"
        : "Importing from image…"
      : "Importing from text…";

    const files = attached.map((img) => img.file);
    startImport(
      label,
      async () => {
        try {
          const blobs = files.length
            ? await prepareImagesForRecipeImport(files)
            : [];
          return importRecipeFromIntakeAction(trimmed, blobs, {
            baseRecipeId,
          });
        } catch (err) {
          return {
            ok: false as const,
            error:
              err instanceof Error ? err.message : "Could not process images.",
          };
        }
      },
      importReadyOpts,
    );
    reset();
  }, [text, images, startImport, reset, baseRecipeId, importReadyOpts]);

  const addImageFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) {
      setError("Please drop image files.");
      return false;
    }
    setError(null);
    setImages((prev) => [...prev, ...imageFiles.map(makeAttachedImage)]);
    return true;
  }, []);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        if (types[i] === "Files") return true;
      }
      return false;
    };

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFiles(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingFiles(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      addImageFiles(files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [addImageFiles]);

  const onPaste = useCallback((e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (!imageFiles.length) return;
    e.preventDefault();
    setError(null);
    setImages((prev) => [...prev, ...imageFiles.map(makeAttachedImage)]);
  }, []);

  const onKey = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      // Enter submits; Shift+Enter inserts a newline (ChatGPT-style).
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const canSend = text.trim().length > 0 || images.length > 0;

  // Only the recipe-detail refine bar collapses into a FAB. On gallery we
  // always show the full bar so the "add recipe" call-to-action stays
  // front and center. Never collapse while the user has a draft in flight
  // (typed text or attached images) so in-progress work never disappears.
  // This applies in both the standalone recipe page and the intercepted
  // modal — in the modal we switch the scroll source to the dialog
  // surface (see the scroll-tracking effect above).
  const canCollapse = baseRecipeId != null;
  const isCollapsed =
    canCollapse && isScrolledPast && !userExpanded && !canSend;

  const handleExpandFromFab = useCallback(() => {
    setUserExpanded(true);
    // Wait for the expand animation to settle before focusing so the
    // mobile keyboard doesn't pop up over a still-collapsing pill.
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 240);
  }, []);

  return (
    <div
      className="recipe-ai-bar-wrap"
      ref={wrapRef}
      data-collapsed={isCollapsed ? "true" : "false"}
      data-modal-footer={isInModalFooter ? "true" : undefined}
      // When rendered on top of a recipe (either the intercepted modal
      // or the standalone recipe detail page), swap the progressive
      // backdrop blur for a progressive white fade that matches the
      // paper-coloured recipe surface.
      data-on-recipe={baseRecipeId != null ? "true" : undefined}
    >
      {isDraggingFiles && (
        <div className="recipe-add-drop-overlay" aria-hidden>
          <div className="recipe-add-drop-overlay-card">
            {baseRecipeId != null
              ? "Drop image to refine this recipe"
              : "Drop image to start a new recipe"}
          </div>
        </div>
      )}

      {/* Progressive backdrop blur so the bar stands out against content.
          Four stacked layers with increasing blur radii + gradient masks
          approximate a true progressive blur (fades to 0 at the top). */}
      <div className="recipe-ai-bar-blur" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>

      <div
        ref={barRef}
        className="recipe-ai-bar"
        role="group"
        aria-label={baseRecipeId != null ? "Refine recipe" : "Add recipe"}
        // While collapsed, hide the bar from keyboard focus + screen
        // readers. Only the FAB below should be reachable.
        inert={isCollapsed ? true : undefined}
      >
        <div
          className={`recipe-ai-bar-composer${
            isMultiLine ? " is-multiline" : ""
          }`}
        >
          {images.length > 0 && (
            <ul className="recipe-ai-bar-thumbs" aria-label="Attached images">
              {images.map((img) => (
                <li key={img.id} className="recipe-ai-bar-thumb">
                  <img
                    src={img.previewUrl}
                    alt=""
                    className="recipe-ai-bar-thumb-img"
                  />
                  <button
                    type="button"
                    className="recipe-ai-bar-thumb-remove"
                    onClick={() => removeImage(img.id)}
                    aria-label="Remove image"
                  >
                    <X size={12} weight="bold" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Grid layout — same DOM order for both states; CSS rearranges the
              cells when .is-multiline drops the buttons into a footer row. */}
          <button
            type="button"
            className="recipe-ai-bar-attach"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach images"
          >
            <Plus size={20} weight="bold" aria-hidden />
          </button>

          <textarea
            ref={inputRef}
            className="recipe-ai-bar-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            placeholder={placeholder}
            rows={1}
          />

          <button
            type="button"
            className="recipe-ai-bar-send"
            onClick={handleSubmit}
            disabled={!canSend}
            aria-label="Send"
          >
            <ArrowUp size={16} weight="bold" aria-hidden />
          </button>

          {error && (
            <p className="recipe-ai-bar-error" role="alert">
              {error}
            </p>
          )}
        </div>

        {showManualButton ? (
          <button
            type="button"
            className="recipe-ai-bar-manual"
            onClick={handleFromScratch}
            disabled={isPending}
            aria-label="Create blank recipe"
            title="Create blank recipe"
          >
            <PencilLine size={18} weight="regular" aria-hidden />
          </button>
        ) : null}
      </div>

      {canCollapse ? (
        <button
          type="button"
          className="recipe-ai-bar-refine-fab"
          onClick={handleExpandFromFab}
          aria-label="Refine recipe"
          aria-expanded={!isCollapsed}
          // When expanded, the FAB is visually hidden and must not be
          // reachable by keyboard or assistive tech.
          inert={!isCollapsed ? true : undefined}
          tabIndex={isCollapsed ? 0 : -1}
        >
          <ShuffleAngular size={20} weight="regular" aria-hidden />
        </button>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        aria-hidden
        tabIndex={-1}
        onChange={handleFiles}
      />
    </div>
  );
}
