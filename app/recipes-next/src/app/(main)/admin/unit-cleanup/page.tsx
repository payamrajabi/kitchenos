import type { CSSProperties } from "react";
import { UnitCleanupReviewTable } from "@/components/unit-cleanup-review-table";
import { loadLatestUnitCleanupReview } from "@/lib/inventory-unit-cleanup/review-file-server";

export const dynamic = "force-dynamic";

export default async function UnitCleanupReviewPage() {
  const loaded = await loadLatestUnitCleanupReview();

  if ("error" in loaded) {
    return (
      <section style={pageStyle}>
        <header style={headerStyle}>
          <p style={kickerStyle}>Temporary tool</p>
          <h1 style={titleStyle}>Inventory unit cleanup</h1>
          <p style={subtitleStyle}>{loaded.error}</p>
        </header>
      </section>
    );
  }

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={kickerStyle}>Temporary review tool</p>
          <h1 style={titleStyle}>Inventory unit cleanup</h1>
          <p style={subtitleStyle}>
            Review the LLM suggestions visually, approve individual fields or
            whole rows, then generate the SQL file for Supabase.
          </p>
        </div>
        <div style={fileMetaStyle}>
          <span>JSON</span>
          <code>{loaded.fileName}</code>
          <span>Markdown</span>
          <code>{loaded.markdownFileName}</code>
        </div>
      </header>

      <UnitCleanupReviewTable
        fileName={loaded.fileName}
        initialReview={loaded.review}
      />
    </section>
  );
}

const pageStyle = {
  display: "grid",
  gap: "var(--space-24)",
  paddingBlock: "var(--space-20) var(--space-48)",
} satisfies CSSProperties;

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--space-24)",
  alignItems: "end",
  borderBottom: "1px solid var(--hair)",
  paddingBottom: "var(--space-16)",
} satisfies CSSProperties;

const kickerStyle = {
  margin: 0,
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
} satisfies CSSProperties;

const titleStyle = {
  margin: "var(--space-4) 0",
  fontSize: 28,
  lineHeight: 1.1,
  letterSpacing: "-0.04em",
} satisfies CSSProperties;

const subtitleStyle = {
  margin: 0,
  maxWidth: 760,
  color: "var(--ink-soft)",
} satisfies CSSProperties;

const fileMetaStyle = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: "var(--space-4) var(--space-8)",
  minWidth: 360,
  fontSize: 12,
  color: "var(--ink-muted)",
} satisfies CSSProperties;
