import type { CSSProperties } from "react";
import {
  formatAlphaLabel,
  runColorAudit,
} from "@/lib/color-audit/scan";
import type {
  ColorRow,
  ColorUsage,
  Family,
  FamilyProposal,
  TokenProposal,
} from "@/lib/color-audit/scan";

export const dynamic = "force-dynamic";

const FAMILY_LABEL: Record<Family, string> = {
  red: "Red",
  amber: "Amber / orange / brown",
  yellow: "Yellow",
  green: "Green",
  cyan: "Cyan",
  blue: "Blue",
  magenta: "Magenta / purple",
};

const FAMILY_NOTE: Record<Family, string> = {
  red:
    "Danger, delete, validation errors, and red-pink surface tints all collapse here.",
  amber:
    "Warm ambers, oranges, and browns — warnings, tag tints, the recipe image browns.",
  yellow: "Pure yellow. The macro-pie 'fat' slice and caution tints land here.",
  green:
    "Success, produce accents, and green-tinted cards.",
  cyan: "Cyan-leaning blues — the 'carb' macro slice and similar.",
  blue:
    "Saturated blues — links, focus rings, info tints, Tailwind indigos.",
  magenta:
    "Magenta / fuchsia — the macro-pie 'protein' slice and any pink-purple tints.",
};

export default async function ColorAuditPage() {
  const result = await runColorAudit();

  const {
    rows,
    neutralRows,
    huedRows,
    familyProposals,
    tokenProposals,
    transparentUsages,
    scannedFileCount,
    generatedAt,
  } = result;

  const neutralUsages = neutralRows.reduce(
    (sum, r) => sum + r.literalUsages.length + r.tokenUsages.length,
    0,
  );
  const huedUsages = huedRows.reduce(
    (sum, r) => sum + r.literalUsages.length + r.tokenUsages.length,
    0,
  );

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={kickerStyle}>Temporary audit · consolidation proposal</p>
          <h1 style={titleStyle}>Color &amp; transparency usage</h1>
          <p style={subtitleStyle}>
            Every near-neutral color in the codebase is rewritten as a black
            (or white) transparency over the page background. Every saturated
            color is bucketed into a single hue family — one red, one amber,
            one yellow, one green, one cyan, one blue, one magenta — with a
            canonical swatch chosen from the existing palette. You can later
            layer hover / border / text distinctions on top of these by
            varying alpha.
          </p>
        </div>
        <dl style={statsStyle}>
          <Stat label="Unique colors" value={rows.length} />
          <Stat label="Neutrals" value={neutralRows.length} />
          <Stat label="Hued" value={huedRows.length} />
          <Stat label="Hue families" value={familyProposals.length} />
          <Stat label="Neutral usages" value={neutralUsages} />
          <Stat label="Hued usages" value={huedUsages} />
          <Stat label="`transparent` uses" value={transparentUsages.length} />
          <Stat label="Files scanned" value={scannedFileCount} />
        </dl>
      </header>

      <Section
        title="Consolidated palette"
        description="What the entire app could be built from: pure black, pure white, and one saturated anchor per hue family. Every other color today folds into one of these."
      >
        <div style={paletteGridStyle}>
          <PaletteCard
            title="INK"
            subtitle="All text, active borders, focus fills"
            swatchColor="#000000"
            label="#000000"
            count={`${
              neutralUsages
            } neutral usages collapse to a black\u00A0α transparency`}
            darkSwatch
          />
          <PaletteCard
            title="PAPER"
            subtitle="Page + card background"
            swatchColor="#ffffff"
            label="#ffffff"
            count="The single canvas color"
          />
          {familyProposals.map((proposal) => (
            <PaletteCard
              key={proposal.family}
              title={FAMILY_LABEL[proposal.family].toUpperCase()}
              subtitle={FAMILY_NOTE[proposal.family]}
              swatchColor={proposal.canonical.label}
              label={proposal.canonical.label}
              count={`${proposal.members.length} colors · ${proposal.totalUsages} usages fold in`}
              darkSwatch={
                proposal.canonical.classification.lightness < 0.55
              }
            />
          ))}
        </div>
      </Section>

      <Section
        title="Proposed :root rewrite"
        description="What the design-system tokens in globals.css would look like if everything anchored on #000/#fff + alpha. Copy-paste ready."
      >
        <TokenRewriteBlock proposals={tokenProposals} />
      </Section>

      <Section
        title="Neutrals → black transparency"
        description="Every grey and near-neutral (greys, Tailwind cool-grey ramp, warm off-whites). Each becomes a black-alpha or white-alpha equivalent that composites to the same luminance. Black-alpha is the recommended default because the app sits on white paper."
      >
        <NeutralTable rows={neutralRows} />
      </Section>

      <Section
        title="Hued → family canonical"
        description="Every saturated color, grouped by hue family. The canonical is the highest-chroma member of each family so it has room to breathe when you later derive hover / border / text shades."
      >
        <div style={{ display: "grid", gap: "var(--space-24)" }}>
          {familyProposals.map((proposal) => (
            <FamilyBlock key={proposal.family} proposal={proposal} />
          ))}
        </div>
      </Section>

      <Section
        title="`transparent` keyword usages"
        description="Explicit `transparent` values — mostly hit-targets, icon-button resets, and gradient endpoints. These are already 'transparencies' so they pass through the consolidation unchanged."
      >
        <TransparentList usages={transparentUsages} />
      </Section>

      <footer style={footerStyle}>
        Generated at{" "}
        <time dateTime={generatedAt}>{generatedAt}</time>. Refresh the page to
        rescan.
      </footer>
    </section>
  );
}

/* ---------------- Section primitives ---------------- */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <header>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <p style={sectionDescStyle}>{description}</p>
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statStyle}>
      <dt style={statLabelStyle}>{label}</dt>
      <dd style={statValueStyle}>{value.toLocaleString()}</dd>
    </div>
  );
}

/* ---------------- Consolidated palette ---------------- */

function PaletteCard({
  title,
  subtitle,
  swatchColor,
  label,
  count,
  darkSwatch = false,
}: {
  title: string;
  subtitle: string;
  swatchColor: string;
  label: string;
  count: string;
  darkSwatch?: boolean;
}) {
  return (
    <article style={paletteCardStyle}>
      <div
        style={{
          ...paletteSwatchStyle,
          background: swatchColor,
          color: darkSwatch ? "#ffffff" : "var(--ink)",
          border: darkSwatch ? "none" : "1px solid var(--hair)",
        }}
      >
        <span style={paletteSwatchLabelStyle}>{label}</span>
      </div>
      <div style={paletteBodyStyle}>
        <h3 style={paletteTitleStyle}>{title}</h3>
        <p style={paletteSubtitleStyle}>{subtitle}</p>
        <p style={paletteCountStyle}>{count}</p>
      </div>
    </article>
  );
}

/* ---------------- Proposed token rewrite ---------------- */

function TokenRewriteBlock({ proposals }: { proposals: TokenProposal[] }) {
  return (
    <div style={codeBlockStyle}>
      <pre style={codeStyle}>
{`:root {
${proposals
  .map((p) => {
    const old = `  ${p.name}: ${p.currentLabel};`;
    const next = `  ${p.name}: ${p.proposedLabel};`;
    const pad = Math.max(0, 40 - next.length);
    const comment = `  /* was ${p.currentLabel} · ${p.description} */`;
    const aliasLine = p.aliases?.length
      ? `\n  ${p.aliases.map((a) => `${a}: var(${p.name});`).join("\n  ")}`
      : "";
    void old;
    void pad;
    return `${next}\n${comment}${aliasLine}`;
  })
  .join("\n\n")}
}`}
      </pre>
    </div>
  );
}

/* ---------------- Neutrals table ---------------- */

function NeutralTable({ rows }: { rows: ColorRow[] }) {
  return (
    <div style={neutralTableWrapStyle}>
      <div style={{ ...neutralRowStyle, ...neutralHeaderStyle }}>
        <span>Current</span>
        <span>Label</span>
        <span>Token</span>
        <span>Luminance</span>
        <span>Proposed (black α)</span>
        <span>Proposed (white α)</span>
        <span style={{ textAlign: "right" }}>Uses</span>
      </div>
      {rows.map((row) => {
        const c = row.classification;
        const blackLabel = formatAlphaLabel(
          "black",
          c.proposedBlackAlpha,
        );
        const whiteLabel = formatAlphaLabel(
          "white",
          c.proposedWhiteAlpha,
        );
        const uses = row.literalUsages.length + row.tokenUsages.length;
        return (
          <details key={row.canonical} style={neutralDetailsStyle}>
            <summary style={neutralSummaryStyle}>
              <span style={neutralRowStyle}>
                <Swatch color={row.label} small />
                <code>{row.label}</code>
                <span>
                  {row.token ? (
                    <code style={tokenPillStyle}>{row.token}</code>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </span>
                <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                  {(
                    0.299 * c.effectiveOnWhite[0] +
                    0.587 * c.effectiveOnWhite[1] +
                    0.114 * c.effectiveOnWhite[2]
                  ).toFixed(0)}
                  /255
                </span>
                <span style={proposedCellStyle}>
                  <Swatch color={blackLabel} small />
                  <code>{blackLabel}</code>
                </span>
                <span style={proposedCellStyle}>
                  <Swatch color={whiteLabel} small darkBacking />
                  <code>{whiteLabel}</code>
                </span>
                <span
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {uses}
                </span>
              </span>
            </summary>
            <UsageDropdown
              literalUsages={row.literalUsages}
              tokenUsages={row.tokenUsages}
              tokenName={row.token}
            />
          </details>
        );
      })}
    </div>
  );
}

/* ---------------- Family consolidation ---------------- */

function FamilyBlock({ proposal }: { proposal: FamilyProposal }) {
  const canonicalLight = proposal.canonical.classification.lightness < 0.55;
  return (
    <article style={familyBlockStyle}>
      <header style={familyHeaderStyle}>
        <div
          style={{
            ...familyCanonicalSwatchStyle,
            background: proposal.canonical.label,
            color: canonicalLight ? "#ffffff" : "var(--ink)",
            border: canonicalLight ? "none" : "1px solid var(--hair)",
          }}
        >
          <span>{proposal.canonical.label}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={familyTitleStyle}>
            {FAMILY_LABEL[proposal.family]}
            <span style={familyTotalStyle}>
              {" "}
              — {proposal.members.length} variants · {proposal.totalUsages}{" "}
              usages
            </span>
          </h3>
          <p style={familyNoteStyle}>{FAMILY_NOTE[proposal.family]}</p>
          <p style={familyCanonicalLineStyle}>
            Canonical:{" "}
            <strong>
              <code>{proposal.canonical.label}</code>
            </strong>{" "}
            <span style={{ color: "var(--muted)" }}>
              (highest chroma in family)
            </span>
          </p>
        </div>
      </header>
      <ul style={familyMemberListStyle}>
        {proposal.members.map((member) => {
          const isCanonical =
            member.canonical === proposal.canonical.canonical;
          const uses = member.literalUsages.length + member.tokenUsages.length;
          return (
            <li key={member.canonical} style={familyMemberItemStyle}>
              <Swatch color={member.label} small />
              <code
                style={{
                  fontWeight: isCanonical ? 600 : 400,
                  color: isCanonical ? "var(--ink)" : "var(--ink)",
                }}
              >
                {member.label}
              </code>
              {isCanonical ? (
                <span style={canonicalPillStyle}>canonical</span>
              ) : (
                <span style={{ color: "var(--muted)" }}>→ folds in</span>
              )}
              <span
                style={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--muted)",
                }}
              >
                {uses} use{uses === 1 ? "" : "s"}
              </span>
              <details style={{ gridColumn: "1 / -1" }}>
                <summary style={memberSummaryStyle}>
                  Show {member.literalUsages.length} occurrence
                  {member.literalUsages.length === 1 ? "" : "s"}
                </summary>
                <UsageDropdown
                  literalUsages={member.literalUsages}
                  tokenUsages={member.tokenUsages}
                  tokenName={member.token}
                  nested
                />
              </details>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/* ---------------- Shared pieces ---------------- */

function Swatch({
  color,
  small = false,
  darkBacking = false,
}: {
  color: string;
  small?: boolean;
  darkBacking?: boolean;
}) {
  const size = small ? 28 : 56;
  const checker = darkBacking
    ? "repeating-conic-gradient(#2a2a2a 0% 25%, #111111 0% 50%)"
    : "repeating-conic-gradient(#e7e7e7 0% 25%, #ffffff 0% 50%)";
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: "inline-block",
        flex: "0 0 auto",
        backgroundImage: `linear-gradient(${color}, ${color}), ${checker}`,
        backgroundSize: "auto, 10px 10px",
        backgroundPosition: "center, 0 0",
        border: "1px solid var(--hair)",
      }}
    />
  );
}

function UsageDropdown({
  literalUsages,
  tokenUsages,
  tokenName,
  nested = false,
}: {
  literalUsages: ColorUsage[];
  tokenUsages: ColorUsage[];
  tokenName?: string;
  nested?: boolean;
}) {
  return (
    <div style={{ padding: nested ? "var(--space-8) 0" : "var(--space-8) var(--space-12) var(--space-12)" }}>
      {literalUsages.length > 0 ? (
        <UsageBlock
          label={`Literal occurrences (${literalUsages.length})`}
          usages={literalUsages}
        />
      ) : null}
      {tokenUsages.length > 0 && tokenName ? (
        <UsageBlock
          label={`var(${tokenName}) references (${tokenUsages.length})`}
          usages={tokenUsages}
        />
      ) : null}
      {literalUsages.length === 0 && tokenUsages.length === 0 ? (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>
          Not used in the codebase (seeded from the token registry).
        </p>
      ) : null}
    </div>
  );
}

function UsageBlock({
  label,
  usages,
}: {
  label: string;
  usages: ColorUsage[];
}) {
  const grouped = new Map<string, ColorUsage[]>();
  for (const u of usages) {
    const list = grouped.get(u.file) ?? [];
    list.push(u);
    grouped.set(u.file, list);
  }
  const groups = Array.from(grouped.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  return (
    <div style={{ marginTop: "var(--space-8)" }}>
      <p style={usageBlockLabelStyle}>{label}</p>
      <ul style={fileListStyle}>
        {groups.map(([file, items]) => (
          <li key={file} style={fileItemStyle}>
            <div style={filePathStyle}>
              <code>{file}</code>
              <span style={fileCountStyle}>
                {items.length} {items.length === 1 ? "hit" : "hits"}
              </span>
            </div>
            <ul style={hitListStyle}>
              {items.map((u, idx) => (
                <li key={`${u.line}-${idx}`} style={hitItemStyle}>
                  <span style={lineNumStyle}>{u.line}</span>
                  <span style={rawStyle}>
                    <code>{u.raw}</code>
                  </span>
                  <span style={contextStyle}>{u.context}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransparentList({ usages }: { usages: ColorUsage[] }) {
  const grouped = new Map<string, ColorUsage[]>();
  for (const u of usages) {
    const list = grouped.get(u.file) ?? [];
    list.push(u);
    grouped.set(u.file, list);
  }
  const groups = Array.from(grouped.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <details style={detailsStyle}>
      <summary style={summaryStyle}>
        {usages.length} reference{usages.length === 1 ? "" : "s"} across{" "}
        {groups.length} file{groups.length === 1 ? "" : "s"}
      </summary>
      <ul style={fileListStyle}>
        {groups.map(([file, items]) => (
          <li key={file} style={fileItemStyle}>
            <div style={filePathStyle}>
              <code>{file}</code>
              <span style={fileCountStyle}>
                {items.length} {items.length === 1 ? "hit" : "hits"}
              </span>
            </div>
            <ul style={hitListStyle}>
              {items.map((u, idx) => (
                <li key={`${u.line}-${idx}`} style={hitItemStyle}>
                  <span style={lineNumStyle}>{u.line}</span>
                  <span style={contextStyle}>{u.context}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ---------------- Styles ---------------- */

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-40)",
  padding: "var(--space-24) 0 var(--space-64)",
};

const headerStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-16)",
};

const kickerStyle: CSSProperties = {
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--muted)",
};

const titleStyle: CSSProperties = {
  margin: "var(--space-4) 0 var(--space-8)",
  fontSize: 28,
  lineHeight: 1.1,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  maxWidth: 720,
  color: "var(--muted)",
  lineHeight: 1.55,
};

const statsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: "var(--space-12)",
  margin: 0,
  padding: "var(--space-16)",
  border: "1px solid var(--hair)",
  background: "var(--fog)",
};

const statStyle: CSSProperties = { display: "grid", gap: 2 };
const statLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--muted)",
};
const statValueStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 600,
  color: "var(--ink)",
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-16)",
};

const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: 22 };
const sectionDescStyle: CSSProperties = {
  margin: "var(--space-4) 0 0",
  color: "var(--muted)",
  lineHeight: 1.5,
  maxWidth: 780,
};

/* palette */
const paletteGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: "var(--space-16)",
};

const paletteCardStyle: CSSProperties = {
  border: "1px solid var(--hair)",
  background: "var(--paper)",
  display: "grid",
};

const paletteSwatchStyle: CSSProperties = {
  aspectRatio: "16/9",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "flex-start",
  padding: "var(--space-12)",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
};

const paletteSwatchLabelStyle: CSSProperties = {
  background: "rgba(0, 0, 0, 0.35)",
  color: "#ffffff",
  padding: "2px 6px",
};

const paletteBodyStyle: CSSProperties = {
  padding: "var(--space-12) var(--space-16) var(--space-16)",
  display: "grid",
  gap: "var(--space-4)",
};

const paletteTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  letterSpacing: "0.04em",
  fontWeight: 600,
};

const paletteSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--muted)",
  lineHeight: 1.45,
};

const paletteCountStyle: CSSProperties = {
  margin: "var(--space-4) 0 0",
  fontSize: 12,
  color: "var(--ink)",
  borderTop: "1px dashed var(--hair)",
  paddingTop: "var(--space-8)",
};

/* code block */
const codeBlockStyle: CSSProperties = {
  border: "1px solid var(--hair)",
  background: "var(--fog)",
  padding: "var(--space-16)",
  overflow: "auto",
};

const codeStyle: CSSProperties = {
  margin: 0,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--ink)",
};

/* neutral table */
const neutralTableWrapStyle: CSSProperties = {
  border: "1px solid var(--hair)",
  background: "var(--paper)",
};

const neutralRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "44px minmax(140px, 1fr) minmax(160px, 1fr) 90px minmax(200px, 1.2fr) minmax(200px, 1.2fr) 60px",
  gap: "var(--space-12)",
  alignItems: "center",
};

const neutralHeaderStyle: CSSProperties = {
  padding: "var(--space-12)",
  borderBottom: "1px solid var(--hair)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
  background: "var(--fog)",
};

const neutralDetailsStyle: CSSProperties = {
  borderBottom: "1px solid var(--hair)",
};

const neutralSummaryStyle: CSSProperties = {
  padding: "var(--space-8) var(--space-12)",
  cursor: "pointer",
  listStyle: "none",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
};

const proposedCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-8)",
  minWidth: 0,
};

const tokenPillStyle: CSSProperties = {
  padding: "2px 6px",
  border: "1px solid var(--ink)",
  background: "var(--mist)",
  fontSize: 11,
};

/* family */
const familyBlockStyle: CSSProperties = {
  border: "1px solid var(--hair)",
  background: "var(--paper)",
  padding: "var(--space-16)",
  display: "grid",
  gap: "var(--space-16)",
};

const familyHeaderStyle: CSSProperties = {
  display: "flex",
  gap: "var(--space-16)",
  alignItems: "flex-start",
};

const familyCanonicalSwatchStyle: CSSProperties = {
  width: 120,
  height: 120,
  flex: "0 0 auto",
  display: "flex",
  alignItems: "flex-end",
  padding: "var(--space-8)",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
};

const familyTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
};

const familyTotalStyle: CSSProperties = {
  fontWeight: 400,
  color: "var(--muted)",
  fontSize: 14,
};

const familyNoteStyle: CSSProperties = {
  margin: "var(--space-4) 0 var(--space-8)",
  color: "var(--muted)",
  fontSize: 13,
  lineHeight: 1.5,
  maxWidth: 720,
};

const familyCanonicalLineStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
};

const familyMemberListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  borderTop: "1px dashed var(--hair)",
};

const familyMemberItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px minmax(120px, 1fr) 120px 100px",
  gap: "var(--space-12)",
  padding: "var(--space-8) 0",
  borderBottom: "1px dashed var(--hair)",
  alignItems: "center",
};

const canonicalPillStyle: CSSProperties = {
  padding: "2px 6px",
  background: "var(--ink)",
  color: "var(--paper)",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  justifySelf: "start",
};

const memberSummaryStyle: CSSProperties = {
  padding: "var(--space-4) 0",
  fontSize: 12,
  color: "var(--muted)",
  cursor: "pointer",
};

/* usage list */
const detailsStyle: CSSProperties = {
  border: "1px solid var(--hair)",
  background: "var(--fog)",
};

const summaryStyle: CSSProperties = {
  padding: "var(--space-8) var(--space-12)",
  fontSize: 13,
  cursor: "pointer",
  userSelect: "none",
  fontWeight: 500,
};

const fileListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: "var(--space-8) 0",
  display: "grid",
  gap: "var(--space-12)",
};

const fileItemStyle: CSSProperties = {
  borderTop: "1px solid var(--hair)",
  paddingTop: "var(--space-8)",
};

const filePathStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--space-8)",
  fontSize: 12,
  color: "var(--ink)",
  marginBottom: "var(--space-4)",
  fontWeight: 500,
};

const fileCountStyle: CSSProperties = {
  color: "var(--muted)",
  fontWeight: 400,
};

const hitListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 2,
};

const hitItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px 180px 1fr",
  gap: "var(--space-8)",
  fontSize: 12,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  color: "var(--muted)",
  alignItems: "baseline",
  padding: "2px 0",
  borderBottom: "1px dashed var(--hair)",
};

const lineNumStyle: CSSProperties = { textAlign: "right", color: "var(--muted)" };
const rawStyle: CSSProperties = {
  color: "var(--ink)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};
const contextStyle: CSSProperties = {
  color: "var(--muted)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};

const usageBlockLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 500,
  color: "var(--ink)",
};

const footerStyle: CSSProperties = {
  borderTop: "1px solid var(--hair)",
  paddingTop: "var(--space-16)",
  color: "var(--muted)",
  fontSize: 12,
};
