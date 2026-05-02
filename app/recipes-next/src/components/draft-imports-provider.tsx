"use client";

import type { DraftRecipeData } from "@/lib/recipe-import/types";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type DraftImportStatus = "importing" | "ready" | "error";

export type DraftImport = {
  id: string;
  status: DraftImportStatus;
  label: string;
  previewName?: string;
  error?: string;
};

type DraftResult =
  | { ok: true; draft: DraftRecipeData }
  | { ok: false; error: string };

type DirectImportResult =
  | { ok: true; recipeId: number; recipeName: string }
  | { ok: false; error: string };

export type StartImportOptions = {
  /** Called after a successful import, before state settles (same tick as storage write). */
  onReady?: (draftId: string) => void;
};

type DraftImportsContextType = {
  drafts: DraftImport[];
  startImport: (
    label: string,
    importFn: () => Promise<DraftResult>,
    options?: StartImportOptions,
  ) => void;
  /**
   * Same on-screen progress chip as `startImport`, but the import function
   * writes the recipe to the DB itself (no draft review). On success the
   * chip is removed and the route tree is refreshed so the new recipe
   * surfaces in the gallery; on error the chip flips to the error state.
   */
  startDirectImport: (
    label: string,
    importFn: () => Promise<DirectImportResult>,
  ) => void;
  removeDraft: (id: string) => void;
  getDraftData: (id: string) => DraftRecipeData | null;
};

/* ------------------------------------------------------------------ */
/*  SessionStorage persistence                                        */
/* ------------------------------------------------------------------ */

const STORED_DRAFTS_KEY = "kitchenos-recipe-drafts";

type StoredDraft = {
  id: string;
  label: string;
  previewName: string;
  draftData: DraftRecipeData;
};

function loadStoredDrafts(): StoredDraft[] {
  try {
    const raw = sessionStorage.getItem(STORED_DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as StoredDraft[]) : [];
  } catch {
    return [];
  }
}

function saveStoredDrafts(drafts: StoredDraft[]) {
  try {
    sessionStorage.setItem(STORED_DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    /* storage full — silently ignore */
  }
}

export function removeDraftFromStorage(id: string) {
  const drafts = loadStoredDrafts();
  saveStoredDrafts(drafts.filter((d) => d.id !== id));
}

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

const DraftImportsContext = createContext<DraftImportsContextType | null>(null);

export function useDraftImports() {
  const ctx = useContext(DraftImportsContext);
  if (!ctx)
    throw new Error(
      "useDraftImports must be used inside <DraftImportsProvider>",
    );
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export function DraftImportsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftImport[]>([]);
  const dataRef = useRef(new Map<string, DraftRecipeData>());

  // Hydrate drafts from sessionStorage on mount. SessionStorage is unavailable
  // during SSR, so this must run in an effect.
  useEffect(() => {
    const stored = loadStoredDrafts();
    if (!stored.length) return;
    for (const s of stored) dataRef.current.set(s.id, s.draftData);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(
      stored.map((s) => ({
        id: s.id,
        status: "ready" as const,
        label: s.label,
        previewName: s.previewName,
      })),
    );
  }, []);

  const startImport = useCallback(
    (
      label: string,
      importFn: () => Promise<DraftResult>,
      options?: StartImportOptions,
    ) => {
      const id = crypto.randomUUID();
      setDrafts((prev) => [{ id, status: "importing", label }, ...prev]);

      importFn()
        .then((result) => {
          if (result.ok) {
            const { draft } = result;
            dataRef.current.set(id, draft);
            const stored = loadStoredDrafts();
            stored.push({
              id,
              label,
              previewName: draft.parsed.name,
              draftData: draft,
            });
            saveStoredDrafts(stored);
            setDrafts((prev) =>
              prev.map((d) =>
                d.id === id
                  ? {
                      ...d,
                      status: "ready" as const,
                      previewName: draft.parsed.name,
                    }
                  : d,
              ),
            );
            options?.onReady?.(id);
          } else {
            setDrafts((prev) =>
              prev.map((d) =>
                d.id === id
                  ? { ...d, status: "error" as const, error: result.error }
                  : d,
              ),
            );
          }
        })
        .catch((err: unknown) => {
          setDrafts((prev) =>
            prev.map((d) =>
              d.id === id
                ? {
                    ...d,
                    status: "error" as const,
                    error:
                      err instanceof Error ? err.message : "Import failed.",
                  }
                : d,
            ),
          );
        });
    },
    [],
  );

  const removeDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    dataRef.current.delete(id);
    removeDraftFromStorage(id);
  }, []);

  const startDirectImport = useCallback(
    (label: string, importFn: () => Promise<DirectImportResult>) => {
      const id = crypto.randomUUID();
      setDrafts((prev) => [{ id, status: "importing", label }, ...prev]);

      importFn()
        .then((result) => {
          if (result.ok) {
            // Recipe is already saved to the DB. Drop the chip and ask
            // the router to refresh so the gallery surfaces the new
            // recipe (revalidatePath was called server-side too).
            setDrafts((prev) => prev.filter((d) => d.id !== id));
            router.refresh();
          } else {
            setDrafts((prev) =>
              prev.map((d) =>
                d.id === id
                  ? { ...d, status: "error" as const, error: result.error }
                  : d,
              ),
            );
          }
        })
        .catch((err: unknown) => {
          setDrafts((prev) =>
            prev.map((d) =>
              d.id === id
                ? {
                    ...d,
                    status: "error" as const,
                    error:
                      err instanceof Error ? err.message : "Import failed.",
                  }
                : d,
            ),
          );
        });
    },
    [router],
  );

  const getDraftData = useCallback((id: string): DraftRecipeData | null => {
    return dataRef.current.get(id) ?? null;
  }, []);

  return (
    <DraftImportsContext.Provider
      value={{
        drafts,
        startImport,
        startDirectImport,
        removeDraft,
        getDraftData,
      }}
    >
      {children}
    </DraftImportsContext.Provider>
  );
}
