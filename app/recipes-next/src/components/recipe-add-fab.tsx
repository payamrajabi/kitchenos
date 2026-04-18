"use client";

import { createRecipeAndRedirectAction } from "@/app/actions/recipes";
import {
  importRecipeFromUrlAction,
  importRecipeFromImagesAction,
  importRecipeFromTextAction,
} from "@/app/actions/recipe-import";
import { useDraftImports } from "@/components/draft-imports-provider";
import { prepareImagesForRecipeImport } from "@/lib/recipe-import/prepare-image-for-import";
import {
  Plus,
  NotePencil,
  Link,
  Camera,
  ClipboardText,
  X,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";

export const DRAFT_STORAGE_KEY = "kitchenos-recipe-draft";

type MenuView = "closed" | "menu" | "url" | "text";
type TextTab = "write" | "preview";

export function RecipeAddFab() {
  const { startImport } = useDraftImports();
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ignoreOutsideCloseUntilRef = useRef(0);
  const [view, setView] = useState<MenuView>("closed");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [textTab, setTextTab] = useState<TextTab>("write");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showPopover = view === "menu" || view === "url";
  const showTextModal = view === "text";
  const showPanel = view !== "closed";

  useEffect(() => {
    if (!showTextModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showTextModal]);

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
        if (view === "text") {
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
    setText("");
    setTextTab("write");
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

  const handleImageFiles = useCallback(
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

      startImport("Importing from image…", async () => {
        try {
          const dataUrls = await prepareImagesForRecipeImport(imageFiles);
          return importRecipeFromImagesAction(dataUrls);
        } catch (err) {
          return {
            ok: false as const,
            error:
              err instanceof Error
                ? err.message
                : "Could not process images.",
          };
        }
      });
      reset();
    },
    [startImport, reset],
  );

  const handleTextSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    startImport("Importing from text…", () =>
      importRecipeFromTextAction(trimmed),
    );
    reset();
  }, [text, startImport, reset]);

  const toggleMenu = useCallback(() => {
    setView((v) => (v === "closed" ? "menu" : "closed"));
    setError(null);
  }, []);

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
                  ignoreOutsideCloseUntilRef.current = Date.now() + 3000;
                  fileRef.current?.click();
                  setError(null);
                }}
              >
                <Camera size={18} weight="bold" aria-hidden />
                From image
              </button>
              <button
                type="button"
                className="recipe-add-menu-item"
                onClick={() => {
                  setTextTab("write");
                  setView("text");
                  setError(null);
                }}
              >
                <ClipboardText size={18} weight="bold" aria-hidden />
                From text
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

      {showTextModal && (
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
            aria-labelledby="recipe-add-modal-title"
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
              <h2 id="recipe-add-modal-title" className="recipe-add-modal-title">
                From text
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
              <div className="recipe-add-text-modal">
                <div
                  className="recipe-add-md-tabs"
                  role="tablist"
                  aria-label="Markdown"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={textTab === "write"}
                    className={`recipe-add-md-tab${textTab === "write" ? " is-active" : ""}`}
                    onClick={() => setTextTab("write")}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={textTab === "preview"}
                    className={`recipe-add-md-tab${textTab === "preview" ? " is-active" : ""}`}
                    onClick={() => setTextTab("preview")}
                  >
                    Preview
                  </button>
                </div>
                {textTab === "write" ? (
                  <textarea
                    className="recipe-add-text-input recipe-add-text-input--modal"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste recipe name, ingredients, and instructions. Markdown is supported (headings, lists, **bold**, links…)"
                    autoFocus
                  />
                ) : (
                  <div className="recipe-add-md-preview-wrap">
                    {text.trim() ? (
                      <div className="recipe-add-md-preview">
                        <ReactMarkdown>{text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="recipe-add-md-preview-empty">
                        Nothing to preview yet — switch to Write and paste your
                        recipe.
                      </p>
                    )}
                  </div>
                )}
                <div className="recipe-add-text-modal-footer">
                  <button
                    type="button"
                    className="recipe-add-submit"
                    onClick={handleTextSubmit}
                    disabled={!text.trim()}
                  >
                    Import
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        aria-hidden
        tabIndex={-1}
        onChange={handleImageFiles}
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
