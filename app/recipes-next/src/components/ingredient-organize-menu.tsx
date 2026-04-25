"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowsMerge,
  ArrowLineUp,
  ArrowRight,
  DotsThree,
  X as XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  useTopLayerHost,
  useTopLayerPortalContainer,
} from "@/lib/top-layer-host";
import {
  listIngredientsForPickerAction,
  moveIngredientAsVariantOfAction,
  moveIngredientOutOfParentAction,
  mergeIngredientsAction,
  getIngredientPairForMergeAction,
} from "@/app/actions/ingredient-organize";
import { createClient } from "@/lib/supabase/client";
import {
  MERGE_FIELDS,
  type MergeFieldKey,
  type MergeFieldChoice,
} from "@/lib/ingredient-organize-shared";
import type { IngredientRow } from "@/types/database";

const emptySubscribe = () => () => {};

type PickerRow = {
  id: number;
  name: string;
  variant: string | null;
  parent_ingredient_id: number | null;
  grocery_category: string | null;
};

// Human labels for each "info" field shown side-by-side in the merge modal.
const FIELD_LABELS: Record<MergeFieldKey, string> = {
  name: "Name",
  variant: "Variant",
  category: "Category (legacy)",
  grocery_category: "Grocery section",
  taxonomy_subcategory: "Subcategory",
  food_type: "Food type",
  brand_or_manufacturer: "Brand",
  barcode: "Barcode",
  preferred_vendor: "Preferred vendor",
  notes: "Notes",
  ingredients_text: "Ingredients (label)",
  kcal: "Calories",
  fat_g: "Fat (g)",
  protein_g: "Protein (g)",
  carbs_g: "Carbs (g)",
  nutrition_basis: "Nutrition basis",
  canonical_unit_weight_g: "Unit weight (g)",
  nutrition_source_name: "Nutrition source",
  nutrition_source_record_id: "Source record id",
  nutrition_source_url: "Source URL",
  nutrition_confidence: "Nutrition confidence",
  nutrition_notes: "Nutrition notes",
  nutrition_serving_size_g: "Serving size (g)",
  density_g_per_ml: "Density (g/ml)",
  is_composite: "Composite?",
  packaged_common: "Packaged common?",
};

function fmtFieldValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    return String(Math.round(v * 100) / 100);
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function valuesAreEqual(a: unknown, b: unknown): boolean {
  const na = a === "" ? null : a;
  const nb = b === "" ? null : b;
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  if (typeof na === "number" && typeof nb === "number") {
    return Math.abs(na - nb) < 1e-9;
  }
  return String(na) === String(nb);
}

export function IngredientOrganizeMenu({
  ingredient,
}: {
  ingredient: IngredientRow;
}) {
  const router = useRouter();
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const topLayerHost = useTopLayerHost();
  const [openModal, setOpenModal] = useState<null | "move" | "merge">(null);
  const [parentName, setParentName] = useState<string | null>(null);
  const [, startMoveOutTransition] = useTransition();

  const closeModal = useCallback(() => setOpenModal(null), []);

  // Look up the parent's name when this ingredient has one, so the menu can
  // render "Move out of {Parent}" rather than a generic "Move to top level".
  const parentId = ingredient.parent_ingredient_id ?? null;
  useEffect(() => {
    if (!parentId) {
      setParentName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("ingredients")
        .select("name")
        .eq("id", parentId)
        .maybeSingle();
      if (!cancelled) {
        setParentName(((data as { name?: string } | null)?.name) ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  const handleMoveOut = useCallback(() => {
    startMoveOutTransition(async () => {
      const r = await moveIngredientOutOfParentAction(ingredient.id);
      if (!r.ok) {
        toast.error(r.error);
      } else {
        toast.success(
          parentName
            ? `Moved ${ingredient.name} out of ${parentName}`
            : `Moved ${ingredient.name} to top level`,
        );
        router.refresh();
      }
    });
  }, [ingredient.id, ingredient.name, parentName, router]);

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={
            <button
              type="button"
              className="detail-sheet-icon-btn"
              aria-label="More actions"
            >
              <DotsThree size={20} weight="bold" aria-hidden />
            </button>
          }
        />
        <Menu.Portal container={topLayerHost ?? undefined}>
          <Menu.Positioner
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="detail-sheet-menu-positioner"
          >
            <Menu.Popup className="detail-sheet-menu">
              <Menu.Item
                className="detail-sheet-menu-item"
                onClick={() => setOpenModal("move")}
              >
                <ArrowRight size={16} weight="regular" aria-hidden />
                <span>Move to…</span>
              </Menu.Item>
              {parentId ? (
                <Menu.Item
                  className="detail-sheet-menu-item"
                  onClick={handleMoveOut}
                >
                  <ArrowLineUp size={16} weight="regular" aria-hidden />
                  <span>
                    {parentName ? `Move out of ${parentName}` : "Move to top level"}
                  </span>
                </Menu.Item>
              ) : null}
              <Menu.Item
                className="detail-sheet-menu-item"
                onClick={() => setOpenModal("merge")}
              >
                <ArrowsMerge size={16} weight="regular" aria-hidden />
                <span>Merge with…</span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {isClient && openModal === "move" ? (
        <MoveToModal ingredient={ingredient} onClose={closeModal} />
      ) : null}
      {isClient && openModal === "merge" ? (
        <MergeWithModal ingredient={ingredient} onClose={closeModal} />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared ingredient picker — used by both modals to choose a target ingredient.
// ---------------------------------------------------------------------------

function IngredientPicker({
  excludeId,
  selected,
  onSelect,
  inputId,
}: {
  excludeId: number;
  selected: PickerRow | null;
  onSelect: (row: PickerRow) => void;
  inputId: string;
}) {
  const [rows, setRows] = useState<PickerRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await listIngredientsForPickerAction(excludeId);
      if (cancelled) return;
      setRows(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [excludeId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows.slice(0, 200);
    return rows
      .filter((r) => {
        const hay = `${r.name} ${r.variant ?? ""} ${r.grocery_category ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 200);
  }, [rows, query]);

  return (
    <div className="organize-picker">
      <input
        id={inputId}
        type="text"
        className="organize-picker-input"
        placeholder={loading ? "Loading ingredients…" : "Search ingredients…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-label="Search ingredients"
      />
      <ul className="organize-picker-list" role="listbox">
        {filtered.length === 0 ? (
          <li className="organize-picker-empty">
            {loading ? "Loading…" : "No matches."}
          </li>
        ) : (
          filtered.map((r) => {
            const isSelected = selected?.id === r.id;
            const subline = r.grocery_category ?? r.variant ?? null;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={
                    "organize-picker-row" +
                    (isSelected ? " organize-picker-row--selected" : "")
                  }
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelect(r)}
                >
                  <span className="organize-picker-row-name">{r.name}</span>
                  {subline ? (
                    <span className="organize-picker-row-sub">{subline}</span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Move-to modal — pick a parent, click confirm.
// ---------------------------------------------------------------------------

function MoveToModal({
  ingredient,
  onClose,
}: {
  ingredient: IngredientRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const portalTarget = useTopLayerPortalContainer();
  const [target, setTarget] = useState<PickerRow | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onConfirm = useCallback(() => {
    if (!target || isPending) return;
    setError("");
    startTransition(async () => {
      const r = await moveIngredientAsVariantOfAction(ingredient.id, target.id);
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
      } else {
        toast.success(`Moved ${ingredient.name} to ${target.name}`);
        router.refresh();
        onClose();
      }
    });
  }, [target, ingredient.id, ingredient.name, isPending, onClose, router]);

  const node = (
    <div className="modal open organize-modal-shell" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="modal-card organize-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          type="button"
          className="modal-close icon-ghost"
          aria-label="Close"
          onClick={onClose}
        >
          <XIcon size={18} weight="bold" aria-hidden />
        </button>
        <div className="organize-modal-body">
          <h2 id={titleId} className="organize-modal-title">
            Move <span className="organize-modal-name">{ingredient.name}</span>{" "}
            into…
          </h2>
          <p className="organize-modal-help">
            Pick the ingredient this should become a variant of. All of{" "}
            <strong>{ingredient.name}</strong>&rsquo;s data — inventory,
            preferred products, recipes, nutrition — will stay attached to it.
          </p>

          <IngredientPicker
            excludeId={ingredient.id}
            selected={target}
            onSelect={setTarget}
            inputId={inputId}
          />

          {error ? (
            <p className="organize-modal-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="organize-modal-actions">
            <button
              type="button"
              className="organize-modal-cancel"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="organize-modal-confirm"
              onClick={onConfirm}
              disabled={!target || isPending}
            >
              {isPending
                ? "Moving…"
                : target
                  ? `Move into ${target.name}`
                  : "Move"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(node, portalTarget) : null;
}

// ---------------------------------------------------------------------------
// Merge-with modal — two-step: pick target, then per-field winner picker.
// ---------------------------------------------------------------------------

function MergeWithModal({
  ingredient,
  onClose,
}: {
  ingredient: IngredientRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const portalTarget = useTopLayerPortalContainer();
  const [step, setStep] = useState<"pick" | "fields">("pick");
  const [target, setTarget] = useState<PickerRow | null>(null);
  const [pair, setPair] = useState<{
    source: IngredientRow;
    target: IngredientRow;
  } | null>(null);
  const [choices, setChoices] = useState<
    Partial<Record<MergeFieldKey, MergeFieldChoice>>
  >({});
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [loadingPair, setLoadingPair] = useState(false);
  const titleId = useId();
  const inputId = useId();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const advanceToFields = useCallback(async () => {
    if (!target) return;
    setLoadingPair(true);
    setError("");
    const p = await getIngredientPairForMergeAction(ingredient.id, target.id);
    setLoadingPair(false);
    if (!p) {
      setError("Could not load ingredient details.");
      return;
    }
    setPair(p);
    // Default each field's winner: prefer the side with a non-empty value.
    // When both have a value, keep target's existing value.
    const defaults: Partial<Record<MergeFieldKey, MergeFieldChoice>> = {};
    for (const f of MERGE_FIELDS) {
      const sv = (p.source as unknown as Record<string, unknown>)[f];
      const tv = (p.target as unknown as Record<string, unknown>)[f];
      const sEmpty = sv === null || sv === undefined || sv === "";
      const tEmpty = tv === null || tv === undefined || tv === "";
      if (!sEmpty && tEmpty) defaults[f] = "this";
      else defaults[f] = "other";
    }
    setChoices(defaults);
    setStep("fields");
    bodyRef.current?.scrollTo({ top: 0 });
  }, [ingredient.id, target]);

  const setAll = useCallback((side: MergeFieldChoice) => {
    setChoices((prev) => {
      const next: Partial<Record<MergeFieldKey, MergeFieldChoice>> = { ...prev };
      for (const f of MERGE_FIELDS) next[f] = side;
      return next;
    });
  }, []);

  const onConfirm = useCallback(() => {
    if (!pair || isPending) return;
    setError("");
    startTransition(async () => {
      const r = await mergeIngredientsAction(
        pair.source.id,
        pair.target.id,
        choices,
      );
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
      } else {
        toast.success(`Merged into ${pair.target.name}`);
        router.refresh();
        onClose();
      }
    });
  }, [pair, choices, isPending, onClose, router]);

  const sourceName = pair?.source.name ?? ingredient.name;
  const targetName = pair?.target.name ?? target?.name ?? "—";

  const node = (
    <div className="modal open organize-modal-shell" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="modal-card organize-modal organize-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          type="button"
          className="modal-close icon-ghost"
          aria-label="Close"
          onClick={onClose}
        >
          <XIcon size={18} weight="bold" aria-hidden />
        </button>
        <div className="organize-modal-body" ref={bodyRef}>
          {step === "pick" ? (
            <>
              <h2 id={titleId} className="organize-modal-title">
                Merge{" "}
                <span className="organize-modal-name">{ingredient.name}</span>{" "}
                with…
              </h2>
              <p className="organize-modal-help">
                Pick the ingredient to merge into. The two will be combined
                into one — recipes, inventory, and lists from both sides keep
                pointing at the merged result.
              </p>

              <IngredientPicker
                excludeId={ingredient.id}
                selected={target}
                onSelect={setTarget}
                inputId={inputId}
              />

              {error ? (
                <p className="organize-modal-error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="organize-modal-actions">
                <button
                  type="button"
                  className="organize-modal-cancel"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="organize-modal-confirm"
                  onClick={advanceToFields}
                  disabled={!target || loadingPair}
                >
                  {loadingPair ? "Loading…" : "Continue"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id={titleId} className="organize-modal-title">
                Choose what to keep
              </h2>
              <p className="organize-modal-help">
                For each field, pick the value that should win. Lists like
                preferred products, known portions, micronutrients, and
                aliases are always combined from both sides.
              </p>

              <div className="merge-side-by-side-shortcuts">
                <div className="merge-side-by-side-shortcut">
                  <span className="merge-side-label">{sourceName}</span>
                  <button
                    type="button"
                    className="merge-side-use-all"
                    onClick={() => setAll("this")}
                  >
                    Use all from this side
                  </button>
                </div>
                <div className="merge-side-by-side-shortcut">
                  <span className="merge-side-label">{targetName}</span>
                  <button
                    type="button"
                    className="merge-side-use-all"
                    onClick={() => setAll("other")}
                  >
                    Use all from this side
                  </button>
                </div>
              </div>

              <div className="merge-side-by-side">
                {pair
                  ? MERGE_FIELDS.map((f) => {
                      const sv = (pair.source as unknown as Record<
                        string,
                        unknown
                      >)[f];
                      const tv = (pair.target as unknown as Record<
                        string,
                        unknown
                      >)[f];
                      const same = valuesAreEqual(sv, tv);
                      const choice = choices[f] ?? "other";
                      return (
                        <div
                          key={f}
                          className={
                            "merge-field-row" +
                            (same ? " merge-field-row--same" : "")
                          }
                        >
                          <div className="merge-field-label">
                            {FIELD_LABELS[f]}
                          </div>
                          <button
                            type="button"
                            className={
                              "merge-field-side" +
                              (choice === "this"
                                ? " merge-field-side--picked"
                                : "")
                            }
                            onClick={() =>
                              setChoices((prev) => ({ ...prev, [f]: "this" }))
                            }
                            disabled={same}
                            aria-pressed={choice === "this"}
                          >
                            {fmtFieldValue(sv)}
                          </button>
                          <button
                            type="button"
                            className={
                              "merge-field-side" +
                              (choice === "other"
                                ? " merge-field-side--picked"
                                : "")
                            }
                            onClick={() =>
                              setChoices((prev) => ({ ...prev, [f]: "other" }))
                            }
                            disabled={same}
                            aria-pressed={choice === "other"}
                          >
                            {fmtFieldValue(tv)}
                          </button>
                        </div>
                      );
                    })
                  : null}
              </div>

              {error ? (
                <p className="organize-modal-error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="organize-modal-actions">
                <button
                  type="button"
                  className="organize-modal-cancel"
                  onClick={() => setStep("pick")}
                  disabled={isPending}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="organize-modal-confirm"
                  onClick={onConfirm}
                  disabled={!pair || isPending}
                >
                  {isPending
                    ? "Merging…"
                    : `Merge into ${targetName}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(node, portalTarget) : null;
}
