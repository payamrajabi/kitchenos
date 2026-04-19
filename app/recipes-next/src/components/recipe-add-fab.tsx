"use client";

import { createRecipeAndRedirectAction } from "@/app/actions/recipes";
import {
  importRecipeFromUrlAction,
  importRecipeFromIntakeAction,
} from "@/app/actions/recipe-import";
import { useDraftImports } from "@/components/draft-imports-provider";
import { prepareImagesForRecipeImport } from "@/lib/recipe-import/prepare-image-for-import";
import {
  Plus,
  NotePencil,
  Link,
  Sparkle,
  Paperclip,
  ArrowUp,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export const DRAFT_STORAGE_KEY = "kitchenos-recipe-draft";

type MenuView = "closed" | "menu" | "url" | "intake";

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

export function RecipeAddFab() {
  const { startImport } = useDraftImports();
  const wrapRef = useRef<HTMLDivElement>(null);
  const intakeFileRef = useRef<HTMLInputElement>(null);
  const intakeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const ignoreOutsideCloseUntilRef = useRef(0);
  const [view, setView] = useState<MenuView>("closed");
  const [url, setUrl] = useState("");
  const [intakeText, setIntakeText] = useState("");
  const [intakeImages, setIntakeImages] = useState<AttachedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showPopover = view === "menu" || view === "url";
  const showIntakeModal = view === "intake";
  const showPanel = view !== "closed";

  useEffect(() => {
    if (!showIntakeModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showIntakeModal]);

  const autoResizeIntake = useCallback(() => {
    const el = intakeTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (!showIntakeModal) return;
    autoResizeIntake();
  }, [showIntakeModal, intakeText, intakeImages.length, autoResizeIntake]);

  const intakeImagesRef = useRef<AttachedImage[]>([]);
  useEffect(() => {
    intakeImagesRef.current = intakeImages;
  }, [intakeImages]);

  useEffect(() => {
    return () => {
      for (const img of intakeImagesRef.current) {
        URL.revokeObjectURL(img.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!showPanel) return;
    const onDoc = (e: MouseEvent) => {
      if (Date.now() < ignoreOutsideCloseUntilRef.current) return;
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setView("closed");
        setError(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showPanel]);

  useEffect(() => {
    if (!showPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "intake") {
          setView("menu");
          setError(null);
        } else {
          setView("closed");
          setError(null);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPanel, view]);

  const reset = useCallback(() => {
    setView("closed");
    setUrl("");
    setIntakeText("");
    setIntakeImages((prev) => {
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

  const handleUrlSubmit = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    startImport("Importing from URL…", () =>
      importRecipeFromUrlAction(trimmed),
    );
    reset();
  }, [url, startImport, reset]);

  const handleIntakeFiles = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
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
      setIntakeImages((prev) => [
        ...prev,
        ...imageFiles.map(makeAttachedImage),
      ]);
    },
    [],
  );

  const removeIntakeImage = useCallback((id: string) => {
    setIntakeImages((prev) => {
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

  const handleIntakeSubmit = useCallback(() => {
    const trimmedText = intakeText.trim();
    const images = intakeImages;
    if (!trimmedText && !images.length) return;

    const label = images.length
      ? trimmedText
        ? "Importing from image and text…"
        : "Importing from image…"
      : "Importing from text…";

    const files = images.map((img) => img.file);

    startImport(label, async () => {
      try {
        const blobs = files.length
          ? await prepareImagesForRecipeImport(files)
          : [];
        return importRecipeFromIntakeAction(trimmedText, blobs);
      } catch (err) {
        return {
          ok: false as const,
          error:
            err instanceof Error ? err.message : "Could not process images.",
        };
      }
    });
    reset();
  }, [intakeText, intakeImages, startImport, reset]);

  const toggleMenu = useCallback(() => {
    setView((v) => (v === "closed" ? "menu" : "closed"));
    setError(null);
  }, []);

  const onIntakePaste = useCallback(
    (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
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
      setIntakeImages((prev) => [
        ...prev,
        ...imageFiles.map(makeAttachedImage),
      ]);
    },
    [],
  );

  const onIntakeKey = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleIntakeSubmit();
      }
    },
    [handleIntakeSubmit],
  );

  const intakeCanSend =
    intakeText.trim().length > 0 || intakeImages.length > 0;

  return (
    <div className="inventory-add-fab-wrap" ref={wrapRef}>
      {showPopover && (
        <div
          className="recipe-add-panel"
          role="dialog"
          aria-label="Add recipe"
        >
          {error && (
            <p className="recipe-add-panel-error" role="alert">
              {error}
            </p>
          )}

          {view === "menu" && (
            <div className="recipe-add-menu">
              <button
                type="button"
                className="recipe-add-menu-item"
                onClick={handleFromScratch}
                disabled={isPending}
              >
                <NotePencil size={18} weight="bold" aria-hidden />
                {isPending ? "Creating…" : "From scratch"}
              </button>
              <button
                type="button"
                className="recipe-add-menu-item"
                onClick={() => {
                  setView("url");
                  setError(null);
                }}
              >
                <Link size={18} weight="bold" aria-hidden />
                From URL
              </button>
              <button
                type="button"
                className="recipe-add-menu-item"
                onClick={() => {
                  setView("intake");
                  setError(null);
                }}
              >
                <Sparkle size={18} weight="bold" aria-hidden />
                Image and text
              </button>
            </div>
          )}

          {view === "url" && (
            <div className="recipe-add-input-group">
              <button
                type="button"
                className="recipe-add-back icon-ghost"
                onClick={() => {
                  setView("menu");
                  setError(null);
                }}
                aria-label="Back to menu"
              >
                <X size={14} weight="bold" aria-hidden />
              </button>
              <input
                type="url"
                className="recipe-add-url-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUrlSubmit();
                }}
                placeholder="Paste recipe URL…"
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
              <button
                type="button"
                className="recipe-add-submit"
                onClick={handleUrlSubmit}
                disabled={!url.trim()}
              >
                Import
              </button>
            </div>
          )}
        </div>
      )}

      {showIntakeModal && (
        <>
          <button
            type="button"
            className="recipe-add-modal-backdrop"
            aria-label="Close"
            onClick={reset}
          />
          <div
            className="recipe-add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recipe-add-intake-title"
          >
            <header className="recipe-add-modal-header">
              <button
                type="button"
                className="recipe-add-back icon-ghost"
                onClick={() => {
                  setView("menu");
                  setError(null);
                }}
                aria-label="Back to menu"
              >
                <X size={14} weight="bold" aria-hidden />
              </button>
              <h2
                id="recipe-add-intake-title"
                className="recipe-add-modal-title"
              >
                New recipe
              </h2>
              <button
                type="button"
                className="recipe-add-modal-close icon-ghost"
                onClick={reset}
                aria-label="Close"
              >
                <X size={18} weight="bold" aria-hidden />
              </button>
            </header>

            <div className="recipe-add-modal-body">
              {error && (
                <p className="recipe-add-panel-error" role="alert">
                  {error}
                </p>
              )}

              <div className="recipe-intake-composer">
                {intakeImages.length > 0 && (
                  <ul className="recipe-intake-thumbs" aria-label="Attached images">
                    {intakeImages.map((img) => (
                      <li key={img.id} className="recipe-intake-thumb">
                        <img
                          src={img.previewUrl}
                          alt=""
                          className="recipe-intake-thumb-img"
                        />
                        <button
                          type="button"
                          className="recipe-intake-thumb-remove"
                          onClick={() => removeIntakeImage(img.id)}
                          aria-label="Remove image"
                        >
                          <X size={12} weight="bold" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <textarea
                  ref={intakeTextareaRef}
                  className="recipe-intake-textarea"
                  value={intakeText}
                  onChange={(e) => setIntakeText(e.target.value)}
                  onKeyDown={onIntakeKey}
                  onPaste={onIntakePaste}
                  placeholder="Describe the recipe, paste notes or ingredients, or attach photos — anything you give is used to draft the recipe."
                  autoFocus
                />

                <div className="recipe-intake-toolbar">
                  <button
                    type="button"
                    className="recipe-intake-attach icon-ghost"
                    onClick={() => intakeFileRef.current?.click()}
                    aria-label="Attach images"
                  >
                    <Paperclip size={16} weight="bold" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="recipe-intake-send"
                    onClick={handleIntakeSubmit}
                    disabled={!intakeCanSend}
                    aria-label="Send"
                  >
                    <ArrowUp size={16} weight="bold" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <input
        ref={intakeFileRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        aria-hidden
        tabIndex={-1}
        onChange={handleIntakeFiles}
      />

      <button
        type="button"
        className="inventory-add-fab"
        aria-label={view === "closed" ? "Add recipe" : "Close"}
        aria-expanded={view !== "closed"}
        onClick={view === "closed" ? toggleMenu : reset}
      >
        {view === "closed" ? (
          <Plus size={20} weight="bold" color="var(--paper)" aria-hidden />
        ) : (
          <X size={20} weight="bold" color="var(--paper)" aria-hidden />
        )}
      </button>
    </div>
  );
}
