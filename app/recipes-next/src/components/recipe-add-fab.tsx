"use client";

import { createRecipeAndRedirectAction } from "@/app/actions/recipes";
import {
  importRecipeFromUrlAction,
  importRecipeFromIntakeAction,
} from "@/app/actions/recipe-import";
import { useDraftImports } from "@/components/draft-imports-provider";
import { prepareImagesForRecipeImport } from "@/lib/recipe-import/prepare-image-for-import";
import {
  PencilLine,
  Plus,
  ArrowUp,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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

// Input grows from a single line (~36px) up to MAX_INPUT_HEIGHT, then scrolls.
const MAX_INPUT_HEIGHT = 256;
// Anything taller than this counts as "multi-line" and drops the buttons
// into a footer row below the text. Single-line height ≈ 36px, so a little
// headroom avoids flicker from sub-pixel measurements.
const MULTILINE_THRESHOLD = 44;

export function RecipeAddFab() {
  const { startImport } = useDraftImports();
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const dragDepthRef = useRef(0);
  const [isPending, startTransition] = useTransition();
  const [placeholder, setPlaceholder] = useState(PLACEHOLDER_WIDE);

  // Avoid infinite oscillation when a layout switch changes the textarea's
  // effective width, which in turn changes scrollHeight measurements.
  const skipModeUpdateRef = useRef(false);

  // Resize the textarea to fit its content up to MAX_INPUT_HEIGHT, and flag
  // whether we've wrapped past a single line so the layout can switch.
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scroll = el.scrollHeight;
    const next = Math.min(scroll, MAX_INPUT_HEIGHT);
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
      startImport("Importing from recipe link…", () =>
        importRecipeFromUrlAction(trimmed),
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
    startImport(label, async () => {
      try {
        const blobs = files.length
          ? await prepareImagesForRecipeImport(files)
          : [];
        return importRecipeFromIntakeAction(trimmed, blobs);
      } catch (err) {
        return {
          ok: false as const,
          error:
            err instanceof Error ? err.message : "Could not process images.",
        };
      }
    });
    reset();
  }, [text, images, startImport, reset]);

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

  return (
    <div className="recipe-ai-bar-wrap">
      {isDraggingFiles && (
        <div className="recipe-add-drop-overlay" aria-hidden>
          <div className="recipe-add-drop-overlay-card">
            Drop image to start a new recipe
          </div>
        </div>
      )}

      <div className="recipe-ai-bar" role="group" aria-label="Add recipe">
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
      </div>

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
