"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  acceptTaxonomySuggestionAction,
  backfillIngredientBackboneAction,
  suggestTaxonomyForUnmatchedAction,
  type BackboneBackfillResult,
  type TaxonomySuggestionEntry,
  type UnmatchedIngredient,
} from "@/app/actions/ingredient-backbone";

const FIELD_LABELS: Record<string, string> = {
  taxonomy_subcategory: "Taxonomy subcategory",
  default_units: "Default units",
  storage_hints: "Storage hints",
  shelf_life_counter_days: "Counter shelf life",
  shelf_life_fridge_days: "Fridge shelf life",
  shelf_life_freezer_days: "Freezer shelf life",
  packaged_common: "Packaged (common)",
  is_composite: "Composite",
};

type AcceptedMap = Record<number, { subcategory: string; fieldCount: number }>;
type DismissedSet = Record<number, true>;

export function IngredientBackboneBackfillPanel() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BackboneBackfillResult | null>(null);
  const [mode, setMode] = useState<"idle" | "dry" | "commit">("idle");

  const [isSuggesting, startSuggestion] = useTransition();
  const [suggestions, setSuggestions] = useState<
    TaxonomySuggestionEntry[] | null
  >(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  const [accepted, setAccepted] = useState<AcceptedMap>({});
  const [dismissed, setDismissed] = useState<DismissedSet>({});
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const run = useCallback((dryRun: boolean) => {
    setMode(dryRun ? "dry" : "commit");
    setSuggestions(null);
    setSuggestionError(null);
    setAccepted({});
    setDismissed({});
    setAcceptError(null);
    startTransition(async () => {
      const res = await backfillIngredientBackboneAction({ dryRun });
      setResult(res);
    });
  }, []);

  const unmatched = useMemo<UnmatchedIngredient[]>(() => {
    if (!result || !result.ok) return [];
    return result.unmatched;
  }, [result]);

  const visibleUnmatched = useMemo(
    () =>
      unmatched.filter((u) => !accepted[u.id] && !dismissed[u.id]),
    [unmatched, accepted, dismissed],
  );

  const suggestAll = useCallback(() => {
    setSuggestionError(null);
    const targets = visibleUnmatched;
    if (!targets.length) return;
    startSuggestion(async () => {
      const res = await suggestTaxonomyForUnmatchedAction(targets);
      if (!res.ok) {
        setSuggestionError(res.error);
        return;
      }
      setSuggestions(res.suggestions);
    });
  }, [visibleUnmatched]);

  const suggestionById = useMemo(() => {
    const m = new Map<number, TaxonomySuggestionEntry>();
    for (const s of suggestions ?? []) m.set(s.id, s);
    return m;
  }, [suggestions]);

  const onAccept = useCallback(
    (id: number, subcategory: string) => {
      setAcceptError(null);
      startSuggestion(async () => {
        const res = await acceptTaxonomySuggestionAction(id, subcategory);
        if (!res.ok) {
          setAcceptError(res.error);
          return;
        }
        setAccepted((prev) => ({
          ...prev,
          [id]: { subcategory, fieldCount: res.filledFields.length },
        }));
      });
    },
    [],
  );

  const onDismiss = useCallback((id: number) => {
    setDismissed((prev) => ({ ...prev, [id]: true }));
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gap: "1.5rem",
        maxWidth: "72rem",
        padding: "1.5rem",
      }}
    >
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          Ingredient backbone backfill
        </h1>
        <p style={{ margin: 0, color: "#555", lineHeight: 1.5 }}>
          Re-applies the rule-based backbone inference (subcategory, storage
          hints, default units, shelf life, packaged/composite flags) to every
          ingredient. Only fills fields that are currently empty — nothing you
          have set by hand will be overwritten. Safe to re-run.
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={isPending}
          style={buttonStyle(isPending && mode === "dry" ? "loading" : "ghost")}
        >
          {isPending && mode === "dry" ? "Previewing…" : "Preview (dry run)"}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={isPending}
          style={buttonStyle(
            isPending && mode === "commit" ? "loading" : "primary",
          )}
        >
          {isPending && mode === "commit" ? "Running…" : "Run backfill"}
        </button>
      </div>

      {result && !result.ok && (
        <div style={errorBoxStyle}>{result.error}</div>
      )}

      {result && result.ok && (
        <ResultSummary
          result={result}
          visibleUnmatched={visibleUnmatched}
          suggestions={suggestions}
          suggestionById={suggestionById}
          isSuggesting={isSuggesting}
          suggestionError={suggestionError}
          acceptError={acceptError}
          accepted={accepted}
          onSuggestAll={suggestAll}
          onAccept={onAccept}
          onDismiss={onDismiss}
        />
      )}
    </div>
  );
}

function ResultSummary({
  result,
  visibleUnmatched,
  suggestions,
  suggestionById,
  isSuggesting,
  suggestionError,
  acceptError,
  accepted,
  onSuggestAll,
  onAccept,
  onDismiss,
}: {
  result: Extract<BackboneBackfillResult, { ok: true }>;
  visibleUnmatched: UnmatchedIngredient[];
  suggestions: TaxonomySuggestionEntry[] | null;
  suggestionById: Map<number, TaxonomySuggestionEntry>;
  isSuggesting: boolean;
  suggestionError: string | null;
  acceptError: string | null;
  accepted: AcceptedMap;
  onSuggestAll: () => void;
  onAccept: (id: number, subcategory: string) => void;
  onDismiss: (id: number) => void;
}) {
  const fieldRows = Object.entries(result.fieldCounts).filter(
    ([, count]) => count > 0,
  );

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <div
        style={{
          padding: "1rem",
          background: result.dryRun ? "#eff6ff" : "#ecfdf5",
          border: `1px solid ${result.dryRun ? "#bfdbfe" : "#a7f3d0"}`,
          borderRadius: "0.5rem",
          color: result.dryRun ? "#1e3a8a" : "#064e3b",
        }}
      >
        <strong>
          {result.dryRun ? "Dry run preview" : "Backfill complete"}
        </strong>
        <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.25rem" }}>
          <div>
            Examined <b>{result.examined}</b> ingredients.
          </div>
          <div>
            {result.dryRun ? (
              <>
                Would update <b>{result.candidates}</b> rows.
              </>
            ) : (
              <>
                Updated <b>{result.updated}</b> rows.
              </>
            )}
          </div>
          <div>
            <b>{result.unmatched.length}</b> names had no rule match.
          </div>
        </div>
      </div>

      {fieldRows.length > 0 && (
        <div>
          <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>
            Fields {result.dryRun ? "that would be" : ""} filled
          </h2>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "0.5rem 0" }}>Field</th>
                <th style={{ padding: "0.5rem 0", textAlign: "right" }}>
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {fieldRows.map(([field, count]) => (
                <tr key={field} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "0.5rem 0" }}>
                    {FIELD_LABELS[field] ?? field}
                  </td>
                  <td style={{ padding: "0.5rem 0", textAlign: "right" }}>
                    {count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.unmatched.length > 0 && (
        <section style={{ display: "grid", gap: "0.75rem" }}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1rem", margin: 0 }}>
                Unmatched ingredients ({visibleUnmatched.length}
                {visibleUnmatched.length !== result.unmatched.length
                  ? ` of ${result.unmatched.length}`
                  : ""}
                )
              </h2>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  color: "#666",
                  fontSize: "0.85rem",
                }}
              >
                Ask the model to propose up to 3 subcategory fits per name.
                Accepting one writes the subcategory plus the storage / units /
                shelf-life defaults that derive from it. Nothing else is
                touched.
              </p>
            </div>
            <button
              type="button"
              onClick={onSuggestAll}
              disabled={isSuggesting || visibleUnmatched.length === 0}
              style={buttonStyle(isSuggesting ? "loading" : "primary")}
            >
              {isSuggesting
                ? "Thinking…"
                : suggestions
                  ? "Re-suggest"
                  : "Suggest with AI"}
            </button>
          </header>

          {suggestionError && (
            <div style={errorBoxStyle}>{suggestionError}</div>
          )}
          {acceptError && <div style={errorBoxStyle}>{acceptError}</div>}

          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: "0.5rem",
            }}
          >
            {visibleUnmatched.map((item) => {
              const suggestion = suggestionById.get(item.id);
              return (
                <UnmatchedRow
                  key={item.id}
                  item={item}
                  candidates={suggestion?.candidates ?? null}
                  suggestionsAttempted={suggestions !== null}
                  onAccept={onAccept}
                  onDismiss={onDismiss}
                  disabled={isSuggesting}
                />
              );
            })}
          </ul>

          {Object.keys(accepted).length > 0 && (
            <AcceptedSection accepted={accepted} unmatched={result.unmatched} />
          )}
        </section>
      )}
    </section>
  );
}

function UnmatchedRow({
  item,
  candidates,
  suggestionsAttempted,
  onAccept,
  onDismiss,
  disabled,
}: {
  item: UnmatchedIngredient;
  candidates: TaxonomySuggestionEntry["candidates"] | null;
  suggestionsAttempted: boolean;
  onAccept: (id: number, subcategory: string) => void;
  onDismiss: (id: number) => void;
  disabled: boolean;
}) {
  return (
    <li
      style={{
        padding: "0.75rem 1rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        display: "grid",
        gap: "0.5rem",
        background: "white",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <span style={{ fontWeight: 500 }}>{item.name}</span>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          style={{
            ...buttonStyle("ghost"),
            padding: "0.2rem 0.55rem",
            fontSize: "0.8rem",
          }}
        >
          Dismiss
        </button>
      </div>

      {candidates === null && !suggestionsAttempted && (
        <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          No suggestions yet. Click “Suggest with AI” above.
        </div>
      )}

      {candidates !== null && candidates.length === 0 && (
        <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          The model returned no confident match for this name.
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: "0.35rem",
          }}
        >
          {candidates.map((c, idx) => (
            <li
              key={`${c.subcategory}-${idx}`}
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.4rem 0.6rem",
                background: "#f9fafb",
                borderRadius: "0.375rem",
              }}
            >
              <div style={{ display: "grid", gap: "0.15rem", minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{c.subcategory}</span>
                  <ConfidenceBadge value={c.confidence} />
                </div>
                {c.rationale && (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#4b5563",
                      lineHeight: 1.3,
                    }}
                  >
                    {c.rationale}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onAccept(item.id, c.subcategory)}
                disabled={disabled}
                style={{
                  ...buttonStyle(disabled ? "loading" : "primary"),
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.85rem",
                }}
              >
                Accept
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  let bg = "#fee2e2";
  let color = "#991b1b";
  if (value >= 0.9) {
    bg = "#dcfce7";
    color = "#166534";
  } else if (value >= 0.7) {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (value >= 0.5) {
    bg = "#e0e7ff";
    color = "#3730a3";
  }
  return (
    <span
      style={{
        fontSize: "0.7rem",
        fontWeight: 600,
        padding: "0.1rem 0.4rem",
        borderRadius: "999px",
        background: bg,
        color,
      }}
    >
      {pct}%
    </span>
  );
}

function AcceptedSection({
  accepted,
  unmatched,
}: {
  accepted: AcceptedMap;
  unmatched: UnmatchedIngredient[];
}) {
  const nameById = new Map(unmatched.map((u) => [u.id, u.name]));
  const entries = Object.entries(accepted);
  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: "0.5rem",
        fontSize: "0.9rem",
        color: "#14532d",
        display: "grid",
        gap: "0.35rem",
      }}
    >
      <strong>
        Accepted {entries.length} suggestion{entries.length === 1 ? "" : "s"}
      </strong>
      <ul style={{ margin: 0, padding: "0 0 0 1.25rem" }}>
        {entries.map(([id, info]) => (
          <li key={id}>
            <b>{nameById.get(Number(id)) ?? `#${id}`}</b> → {info.subcategory}
            {info.fieldCount > 1 && (
              <span style={{ color: "#4b5563" }}>
                {" "}
                (+{info.fieldCount - 1} derived field
                {info.fieldCount - 1 === 1 ? "" : "s"})
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const errorBoxStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  background: "#fee2e2",
  border: "1px solid #fecaca",
  borderRadius: "0.5rem",
  color: "#991b1b",
};

function buttonStyle(variant: "primary" | "ghost" | "loading"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "0.55rem 1rem",
    borderRadius: "0.5rem",
    fontSize: "0.95rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 120ms ease, border-color 120ms ease",
  };
  if (variant === "primary") {
    return {
      ...base,
      background: "#111827",
      color: "white",
      border: "1px solid #111827",
    };
  }
  if (variant === "loading") {
    return {
      ...base,
      background: "#e5e7eb",
      color: "#374151",
      border: "1px solid #d1d5db",
      cursor: "wait",
    };
  }
  return {
    ...base,
    background: "white",
    color: "#111827",
    border: "1px solid #d1d5db",
  };
}
