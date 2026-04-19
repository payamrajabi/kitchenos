"use client";

import { useCallback, useState, useTransition } from "react";
import {
  applyCatalogueToExistingIngredientsAction,
  seedIngredientBackboneCatalogueAction,
  type ApplyCatalogueResult,
  type SeedCatalogueResult,
} from "@/app/actions/ingredient-backbone-catalogue";

const FIELD_LABELS: Record<string, string> = {
  backbone_id: "Backbone ID",
  variant: "Variant",
  taxonomy_subcategory: "Taxonomy subcategory",
  grocery_category: "Grocery category",
  default_units: "Default units",
  storage_hints: "Storage hints",
  shelf_life_counter_days: "Counter shelf life",
  shelf_life_fridge_days: "Fridge shelf life",
  shelf_life_freezer_days: "Freezer shelf life",
  packaged_common: "Packaged (common)",
  is_composite: "Composite",
  density_g_per_ml: "Density (g/ml)",
  canonical_unit_weight_g: "Unit weight (g)",
};

export function IngredientBackboneCataloguePanel() {
  const [seedPending, startSeed] = useTransition();
  const [seedResult, setSeedResult] = useState<SeedCatalogueResult | null>(null);

  const [applyPending, startApply] = useTransition();
  const [applyMode, setApplyMode] = useState<"idle" | "dry" | "commit">("idle");
  const [applyResult, setApplyResult] = useState<ApplyCatalogueResult | null>(
    null,
  );

  const runSeed = useCallback(() => {
    startSeed(async () => {
      const res = await seedIngredientBackboneCatalogueAction();
      setSeedResult(res);
    });
  }, []);

  const runApply = useCallback((dryRun: boolean) => {
    setApplyMode(dryRun ? "dry" : "commit");
    startApply(async () => {
      const res = await applyCatalogueToExistingIngredientsAction({ dryRun });
      setApplyResult(res);
    });
  }, []);

  return (
    <section
      style={{
        display: "grid",
        gap: "1.5rem",
        maxWidth: "72rem",
        padding: "1.5rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        background: "#fafafa",
      }}
    >
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          Backbone catalogue (Pass B)
        </h2>
        <p style={{ margin: 0, color: "#555", lineHeight: 1.5 }}>
          A small curated set of canonical ingredients powers deterministic
          autofill. Seed the catalogue from the TypeScript source of truth, then
          apply it to existing ingredient rows — the catalogue wins over the
          regex pass when a name matches.
        </p>
      </header>

      {/* ---- Seed / refresh --------------------------------------- */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
          1. Seed or refresh the catalogue table
        </h3>
        <p style={{ margin: 0, color: "#555", fontSize: "0.9rem" }}>
          Upserts every entry in the TypeScript seed into the
          <code style={inlineCode}>ingredient_backbone_catalogue</code> table.
          Idempotent — safe to re-run after editing the seed.
        </p>
        <div>
          <button
            type="button"
            onClick={runSeed}
            disabled={seedPending}
            style={buttonStyle(seedPending ? "loading" : "primary")}
          >
            {seedPending ? "Seeding…" : "Seed catalogue"}
          </button>
        </div>
        {seedResult && !seedResult.ok && (
          <div style={errorBoxStyle}>{seedResult.error}</div>
        )}
        {seedResult && seedResult.ok && (
          <div style={infoBoxStyle("success")}>
            <div>
              <strong>Catalogue upserted.</strong>
            </div>
            <div>
              Entries: <b>{seedResult.upserted}</b> of{" "}
              <b>{seedResult.total}</b>. Aliases normalised:{" "}
              <b>{seedResult.aliasesNormalised}</b>.
            </div>
            {seedResult.skippedDuplicates.length > 0 && (
              <div style={{ marginTop: "0.35rem" }}>
                Duplicate normalised names detected:
                <ul
                  style={{
                    margin: "0.35rem 0 0",
                    padding: "0 0 0 1.25rem",
                    color: "#9a3412",
                  }}
                >
                  {seedResult.skippedDuplicates.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Apply to existing ---------------------------------- */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
          2. Apply catalogue to existing ingredients
        </h3>
        <p style={{ margin: 0, color: "#555", fontSize: "0.9rem" }}>
          Walks every ingredient, looks it up in the catalogue, and fills any
          fields the catalogue knows about that are currently empty. Never
          overwrites a value you have set by hand.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => runApply(true)}
            disabled={applyPending}
            style={buttonStyle(
              applyPending && applyMode === "dry" ? "loading" : "ghost",
            )}
          >
            {applyPending && applyMode === "dry"
              ? "Previewing…"
              : "Preview (dry run)"}
          </button>
          <button
            type="button"
            onClick={() => runApply(false)}
            disabled={applyPending}
            style={buttonStyle(
              applyPending && applyMode === "commit" ? "loading" : "primary",
            )}
          >
            {applyPending && applyMode === "commit"
              ? "Applying…"
              : "Apply catalogue"}
          </button>
        </div>

        {applyResult && !applyResult.ok && (
          <div style={errorBoxStyle}>{applyResult.error}</div>
        )}

        {applyResult && applyResult.ok && (
          <ApplyResultSummary result={applyResult} />
        )}
      </div>
    </section>
  );
}

function ApplyResultSummary({
  result,
}: {
  result: Extract<ApplyCatalogueResult, { ok: true }>;
}) {
  const fieldRows = Object.entries(result.fieldCounts).filter(
    ([, count]) => count > 0,
  );
  const unmatchedPreview = result.unmatched.slice(0, 25);
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <div style={infoBoxStyle(result.dryRun ? "preview" : "success")}>
        <strong>
          {result.dryRun ? "Dry run preview" : "Catalogue applied"}
        </strong>
        <div
          style={{
            marginTop: "0.4rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            gap: "0.25rem 1rem",
          }}
        >
          <div>
            Examined <b>{result.examined}</b> ingredients.
          </div>
          <div>
            Matched <b>{result.matched}</b> ({result.matchedByCanonical} by
            canonical name, {result.matchedByAlias} by alias).
          </div>
          <div>
            {result.dryRun ? (
              <>
                Would touch <b>{result.matched}</b> rows (
                {sumCounts(result.fieldCounts)} field writes).
              </>
            ) : (
              <>
                Updated <b>{result.updated}</b> rows.
              </>
            )}
          </div>
          <div>
            <b>{result.unmatched.length}</b> names had no catalogue entry.
          </div>
        </div>
      </div>

      {fieldRows.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>
            Fields {result.dryRun ? "that would be" : ""} filled
          </h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr
                style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}
              >
                <th style={{ padding: "0.5rem 0" }}>Field</th>
                <th style={{ padding: "0.5rem 0", textAlign: "right" }}>
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {fieldRows.map(([field, count]) => (
                <tr
                  key={field}
                  style={{ borderBottom: "1px solid #f3f4f6" }}
                >
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

      {unmatchedPreview.length > 0 && (
        <div>
          <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>
            Sample of unmatched names{" "}
            <span style={{ color: "#6b7280", fontWeight: 400 }}>
              (first {unmatchedPreview.length} of {result.unmatched.length})
            </span>
          </h3>
          <ul
            style={{
              margin: 0,
              padding: "0.5rem 0.75rem",
              listStyle: "disc inside",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "0.375rem",
              fontSize: "0.9rem",
              color: "#374151",
              maxHeight: "14rem",
              overflowY: "auto",
            }}
          >
            {unmatchedPreview.map((name, i) => (
              <li key={`${name}-${i}`} style={{ padding: "0.1rem 0" }}>
                {name}
              </li>
            ))}
          </ul>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
            These will still be caught by the regex backfill below if they match
            a rule, or you can extend the catalogue seed in code to include them.
          </p>
        </div>
      )}
    </div>
  );
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

const inlineCode: React.CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  fontSize: "0.85em",
  background: "#f3f4f6",
  padding: "0.05rem 0.35rem",
  borderRadius: "0.25rem",
};

const errorBoxStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  background: "#fee2e2",
  border: "1px solid #fecaca",
  borderRadius: "0.5rem",
  color: "#991b1b",
};

function infoBoxStyle(variant: "preview" | "success"): React.CSSProperties {
  if (variant === "preview") {
    return {
      padding: "1rem",
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      borderRadius: "0.5rem",
      color: "#1e3a8a",
    };
  }
  return {
    padding: "1rem",
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: "0.5rem",
    color: "#064e3b",
  };
}

function buttonStyle(
  variant: "primary" | "ghost" | "loading",
): React.CSSProperties {
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
