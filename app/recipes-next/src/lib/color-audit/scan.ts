/**
 * Temporary color audit: walks the app source tree and extracts every color
 * literal (hex, rgb/rgba), every `transparent` usage, and every `var(--…)`
 * reference so the /admin/color-audit page can list them alongside the
 * design-system tokens defined in globals.css.
 */

import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_ROOT = path.join(process.cwd(), "src");
const EXTRA_ROOTS: string[] = [path.join(process.cwd(), "public/icons")];

const SCANNABLE_EXT = new Set([".ts", ".tsx", ".css", ".scss", ".svg"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "storybook-static",
  "dist",
  "build",
]);

export type Rgba = [number, number, number, number];

export type ColorUsage = {
  file: string; // path relative to the Next.js app (app/recipes-next)
  line: number;
  raw: string;
  context: string;
};

export type Family =
  | "red"
  | "amber"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "magenta";

export type Classification = {
  kind: "neutral" | "hued";
  family: Family | null;
  hue: number | null; // degrees 0-360, null for neutrals
  saturation: number; // 0-1 HSL
  lightness: number; // 0-1 HSL of effective colour on white
  chroma: number; // (max-min)/255 of effective colour on white
  effectiveOnWhite: Rgba; // what this colour renders as on a white page
  proposedBlackAlpha: number; // 0-1, composites to same luminance on white
  proposedWhiteAlpha: number; // 0-1, composites to same luminance on black
};

export type ColorRow = {
  canonical: string;
  label: string; // "#0a0a0a" or "rgba(0, 0, 0, 0.2)"
  rgba: Rgba;
  token?: string;
  tokenAliases?: string[];
  tokenDescription?: string;
  literalUsages: ColorUsage[]; // raw hex / rgb matches
  tokenUsages: ColorUsage[]; // `var(--token)` matches (any alias)
  classification: Classification;
};

export type FamilyProposal = {
  family: Family;
  canonical: ColorRow;
  members: ColorRow[];
  totalUsages: number;
};

export type TokenProposal = {
  name: string;
  aliases?: string[];
  currentLabel: string;
  proposedLabel: string;
  proposedKind: "black-alpha" | "white-alpha" | "identity";
  description: string;
};

export type TransparentUsage = ColorUsage;

export type AuditResult = {
  rows: ColorRow[];
  neutralRows: ColorRow[];
  huedRows: ColorRow[];
  familyProposals: FamilyProposal[];
  tokenProposals: TokenProposal[];
  transparentUsages: TransparentUsage[];
  scannedFileCount: number;
  generatedAt: string;
};

/* ---------- Token registry (hand-curated from globals.css :root) -------- */

type TokenDef = {
  name: string;
  canonical: string; // matches ColorRow canonical keys
  aliases?: string[];
  description: string;
};

const TOKEN_DEFS: TokenDef[] = [
  {
    name: "--ink",
    canonical: "#0a0a0a",
    description: "Primary ink — text, borders, and active foreground.",
  },
  {
    name: "--paper",
    canonical: "#ffffff",
    description: "Canvas background — page and card surfaces.",
  },
  {
    name: "--mist",
    canonical: "#ebebeb",
    description:
      "Soft fill — active/hover chip and menu-item background.",
  },
  {
    name: "--fog",
    canonical: "#f5f5f5",
    aliases: ["--surface"],
    description: "Muted surface behind sections, stripes, and inset fields.",
  },
  {
    name: "--muted",
    canonical: "#5a5a5a",
    description: "Secondary text — labels, helper copy, inactive tabs.",
  },
  {
    name: "--hair",
    canonical: "#c8c8c8",
    aliases: ["--hairline"],
    description: "Hairline dividers and subtle borders.",
  },
  {
    name: "--stripe-a",
    canonical: "#e2e2e2",
    description: "Darker zebra stripe for table rows.",
  },
  {
    name: "--stripe-b",
    canonical: "#f0f0f0",
    description: "Lighter zebra stripe for table rows.",
  },
  {
    name: "--control-border-rest",
    canonical: "rgba(0, 0, 0, 0.2)",
    description: "Default input/select/button outline before focus.",
  },
  {
    name: "--hover-fill-overlay",
    canonical: "rgba(0, 0, 0, 0.05)",
    description:
      "5% black overlay used by row/control hover so nested surfaces stack.",
  },
];

/* ---------- Colour parsing --------------------------------------------- */

const HEX_RE = /#[0-9a-fA-F]+/g;
const RGB_RE = /rgba?\s*\([^)]+\)/gi;
const VAR_RE = /var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,[^)]*)?\)/g;
const TRANSPARENT_RE = /\btransparent\b/g;

function parseHex(raw: string): Rgba | null {
  const hex = raw.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) return null;
  let r: number;
  let g: number;
  let b: number;
  let a = 1;
  if (hex.length === 3 || hex.length === 4) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
    if (hex.length === 4) a = parseInt(hex[3] + hex[3], 16) / 255;
  } else {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
  }
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b, a];
}

function parseChannel(token: string, max: number): number {
  const t = token.trim();
  if (t.endsWith("%")) return (parseFloat(t) / 100) * max;
  return parseFloat(t);
}

function parseRgb(raw: string): Rgba | null {
  const inside = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"));
  let rgbTokens: string[];
  let alphaToken: string | undefined;

  if (inside.includes("/")) {
    const [rgbPart, alphaPart] = inside.split("/").map((s) => s.trim());
    rgbTokens = rgbPart.split(/[\s,]+/).filter(Boolean);
    alphaToken = alphaPart;
  } else {
    const tokens = inside.split(/[\s,]+/).filter(Boolean);
    if (tokens.length === 4) {
      rgbTokens = tokens.slice(0, 3);
      alphaToken = tokens[3];
    } else {
      rgbTokens = tokens;
    }
  }

  if (rgbTokens.length < 3) return null;
  const r = parseChannel(rgbTokens[0], 255);
  const g = parseChannel(rgbTokens[1], 255);
  const b = parseChannel(rgbTokens[2], 255);
  const a = alphaToken ? parseChannel(alphaToken, 1) : 1;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return [clamp255(r), clamp255(g), clamp255(b), clampAlpha(a)];
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clampAlpha(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/* ---------- Colour classification (neutral vs hued) -------------------- */

// Anything below this chroma — i.e. spread between RGB max and min — is
// treated as a neutral grey. 0.12 catches the Tailwind "cool grey" ramp
// (#4B5563, #6B7280, #374151…) the user called out as "close to neutral".
const NEUTRAL_CHROMA_THRESHOLD = 0.12;

export function luminance(rgba: Rgba): number {
  const [r, g, b] = rgba;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function compositeOverWhite(rgba: Rgba): Rgba {
  const [r, g, b, a] = rgba;
  return [
    Math.round(r * a + 255 * (1 - a)),
    Math.round(g * a + 255 * (1 - a)),
    Math.round(b * a + 255 * (1 - a)),
    1,
  ];
}

function toHsl(r: number, g: number, b: number): {
  h: number;
  s: number;
  l: number;
  chroma: number;
} {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const cmax = Math.max(rN, gN, bN);
  const cmin = Math.min(rN, gN, bN);
  const d = cmax - cmin;
  const l = (cmax + cmin) / 2;
  let s = 0;
  let h = 0;
  if (d > 0) {
    s = l < 0.5 ? d / (cmax + cmin) : d / (2 - cmax - cmin);
    if (cmax === rN) h = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60;
    else if (cmax === gN) h = ((bN - rN) / d + 2) * 60;
    else h = ((rN - gN) / d + 4) * 60;
  }
  return { h, s, l, chroma: d };
}

function classifyHue(h: number): Family {
  if (h < 20 || h >= 345) return "red";
  if (h < 50) return "amber";
  if (h < 75) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "cyan";
  if (h < 260) return "blue";
  return "magenta";
}

export function classify(rgba: Rgba): Classification {
  const effective = compositeOverWhite(rgba);
  const [r, g, b] = effective;
  const { h, s, l, chroma } = toHsl(r, g, b);
  const lum = luminance(effective);
  const proposedBlackAlpha = round2(1 - lum);
  const proposedWhiteAlpha = round2(lum);
  const isNeutral = chroma < NEUTRAL_CHROMA_THRESHOLD;
  return {
    kind: isNeutral ? "neutral" : "hued",
    family: isNeutral ? null : classifyHue(h),
    hue: chroma > 0 ? h : null,
    saturation: s,
    lightness: l,
    chroma,
    effectiveOnWhite: effective,
    proposedBlackAlpha,
    proposedWhiteAlpha,
  };
}

function round2(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

export function formatAlphaLabel(
  base: "black" | "white",
  alpha: number,
): string {
  if (alpha >= 1) return base === "black" ? "#000000" : "#ffffff";
  if (alpha <= 0) return base === "black" ? "transparent" : "transparent";
  const channel = base === "black" ? 0 : 255;
  return `rgba(${channel}, ${channel}, ${channel}, ${alpha})`;
}

function canonicalize(rgba: Rgba): { canonical: string; label: string } {
  const [r, g, b, a] = rgba;
  if (a >= 1) {
    const hex = `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return { canonical: hex, label: hex };
  }
  const rounded = Math.round(a * 1000) / 1000;
  const label = `rgba(${r}, ${g}, ${b}, ${rounded})`;
  return { canonical: label, label };
}

/* ---------- Directory walk --------------------------------------------- */

async function walk(dir: string, acc: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      await walk(full, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SCANNABLE_EXT.has(path.extname(entry.name))) acc.push(full);
  }
}

async function listScanFiles(): Promise<string[]> {
  const files: string[] = [];
  await walk(SOURCE_ROOT, files);
  for (const extra of EXTRA_ROOTS) await walk(extra, files);
  return files;
}

/* ---------- Main scanner ---------------------------------------------- */

export async function runColorAudit(): Promise<AuditResult> {
  const files = await listScanFiles();
  const rowMap = new Map<string, ColorRow>();
  const transparentUsages: TransparentUsage[] = [];

  function ensureRow(canonical: string, label: string, rgba: Rgba): ColorRow {
    let row = rowMap.get(canonical);
    if (!row) {
      row = {
        canonical,
        label,
        rgba,
        literalUsages: [],
        tokenUsages: [],
        classification: classify(rgba),
      };
      rowMap.set(canonical, row);
    }
    return row;
  }

  // Seed every known token so they always appear, even if unused.
  for (const def of TOKEN_DEFS) {
    const parsed = parseAnyColor(def.canonical);
    if (!parsed) continue;
    const { canonical, label } = canonicalize(parsed);
    const row = ensureRow(canonical, label, parsed);
    row.token = def.name;
    row.tokenAliases = def.aliases;
    row.tokenDescription = def.description;
  }

  const projectRoot = process.cwd();

  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(projectRoot, file);
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const context = line.trim();
      const isTokenDefinitionLine =
        /^\s*--[a-zA-Z0-9-]+\s*:/.test(line) && rel.endsWith("globals.css");

      // Hex
      for (const match of line.matchAll(HEX_RE)) {
        const raw = match[0];
        if (![3, 4, 6, 8].includes(raw.length - 1)) continue;
        const rgba = parseHex(raw);
        if (!rgba) continue;
        const { canonical, label } = canonicalize(rgba);
        const row = ensureRow(canonical, label, rgba);
        row.literalUsages.push({ file: rel, line: lineNumber, raw, context });
      }

      // rgb/rgba
      for (const match of line.matchAll(RGB_RE)) {
        const raw = match[0];
        const rgba = parseRgb(raw);
        if (!rgba) continue;
        const { canonical, label } = canonicalize(rgba);
        const row = ensureRow(canonical, label, rgba);
        row.literalUsages.push({ file: rel, line: lineNumber, raw, context });
      }

      // var(--token) — only count as token usage when it's a known colour token.
      for (const match of line.matchAll(VAR_RE)) {
        const name = match[1];
        const def = findTokenDef(name);
        if (!def) continue;
        const parsed = parseAnyColor(def.canonical);
        if (!parsed) continue;
        const { canonical, label } = canonicalize(parsed);
        const row = ensureRow(canonical, label, parsed);
        row.tokenUsages.push({
          file: rel,
          line: lineNumber,
          raw: match[0],
          context,
        });
      }

      // `transparent` keyword — count excluding CSS property names like
      // `background-color: transparent;` inside comments; we keep all of
      // them but filter out obvious non-CSS mentions by requiring the
      // word to be preceded by `:` or whitespace + `=`, etc. Simpler:
      // include only when preceded by `:` or `"` or `'` (style props).
      for (const match of line.matchAll(TRANSPARENT_RE)) {
        const idx = match.index ?? -1;
        if (idx < 0) continue;
        const before = line.slice(Math.max(0, idx - 2), idx);
        if (!/[:\s"'`>=,(]/.test(before)) continue;
        // Skip if it's inside a commented explanation and not a real value:
        transparentUsages.push({
          file: rel,
          line: lineNumber,
          raw: "transparent",
          context,
        });
      }

      // If this is a token definition line we already captured the hex,
      // but we want to annotate that row so it isn't lost in the "literal"
      // list above. (No-op here — sorting handles it downstream.)
      void isTokenDefinitionLine;
    }
  }

  const rows = Array.from(rowMap.values()).sort(sortRows);
  const neutralRows = rows
    .filter((r) => r.classification.kind === "neutral")
    .sort(sortNeutrals);
  const huedRows = rows.filter((r) => r.classification.kind === "hued");
  const familyProposals = buildFamilyProposals(huedRows);
  const tokenProposals = buildTokenProposals(rows);

  return {
    rows,
    neutralRows,
    huedRows,
    familyProposals,
    tokenProposals,
    transparentUsages,
    scannedFileCount: files.length,
    generatedAt: new Date().toISOString(),
  };
}

/* ---------- Family consolidation --------------------------------------- */

const FAMILY_ORDER: Family[] = [
  "red",
  "amber",
  "yellow",
  "green",
  "cyan",
  "blue",
  "magenta",
];

function buildFamilyProposals(hued: ColorRow[]): FamilyProposal[] {
  const buckets = new Map<Family, ColorRow[]>();
  for (const row of hued) {
    const f = row.classification.family;
    if (!f) continue;
    const list = buckets.get(f) ?? [];
    list.push(row);
    buckets.set(f, list);
  }
  const proposals: FamilyProposal[] = [];
  for (const [family, members] of buckets.entries()) {
    const canonical = pickCanonical(members);
    const totalUsages = members.reduce(
      (sum, m) => sum + m.literalUsages.length + m.tokenUsages.length,
      0,
    );
    proposals.push({ family, canonical, members: sortMembers(members), totalUsages });
  }
  proposals.sort(
    (a, b) =>
      FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family),
  );
  return proposals;
}

function pickCanonical(members: ColorRow[]): ColorRow {
  // Pick the most saturated / high-chroma colour, tie-broken by lightness
  // closest to 0.5 — that gives the best base colour to later derive a
  // hover/border/text ramp from.
  const sorted = [...members].sort((a, b) => {
    const ca = a.classification.chroma;
    const cb = b.classification.chroma;
    if (Math.abs(ca - cb) > 0.05) return cb - ca;
    const da = Math.abs(a.classification.lightness - 0.5);
    const db = Math.abs(b.classification.lightness - 0.5);
    if (Math.abs(da - db) > 0.05) return da - db;
    const au = a.literalUsages.length + a.tokenUsages.length;
    const bu = b.literalUsages.length + b.tokenUsages.length;
    return bu - au;
  });
  return sorted[0];
}

function sortMembers(members: ColorRow[]): ColorRow[] {
  return [...members].sort(
    (a, b) => b.classification.lightness - a.classification.lightness,
  );
}

function sortNeutrals(a: ColorRow, b: ColorRow): number {
  // Darker first (lower luminance), then by usage.
  const la = luminance(a.rgba);
  const lb = luminance(b.rgba);
  if (Math.abs(la - lb) > 0.005) return la - lb;
  const au = a.literalUsages.length + a.tokenUsages.length;
  const bu = b.literalUsages.length + b.tokenUsages.length;
  return bu - au;
}

/* ---------- Proposed :root token rewrite ------------------------------- */

function buildTokenProposals(rows: ColorRow[]): TokenProposal[] {
  const out: TokenProposal[] = [];
  for (const def of TOKEN_DEFS) {
    const row = rows.find((r) => r.token === def.name);
    if (!row) continue;
    const { proposedLabel, proposedKind } = proposeTokenRewrite(
      def.name,
      row,
    );
    out.push({
      name: def.name,
      aliases: def.aliases,
      currentLabel: row.label,
      proposedLabel,
      proposedKind,
      description: def.description,
    });
  }
  return out;
}

function proposeTokenRewrite(
  name: string,
  row: ColorRow,
): { proposedLabel: string; proposedKind: TokenProposal["proposedKind"] } {
  // Anchor tokens stay concrete; everything else becomes a black transparency.
  if (name === "--ink") {
    return { proposedLabel: "#000000", proposedKind: "identity" };
  }
  if (name === "--paper") {
    return { proposedLabel: "#ffffff", proposedKind: "identity" };
  }
  const alpha = row.classification.proposedBlackAlpha;
  return {
    proposedLabel: formatAlphaLabel("black", alpha),
    proposedKind: "black-alpha",
  };
}

function parseAnyColor(raw: string): Rgba | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("#")) return parseHex(trimmed);
  if (/^rgba?\s*\(/i.test(trimmed)) return parseRgb(trimmed);
  return null;
}

function findTokenDef(name: string): TokenDef | null {
  for (const def of TOKEN_DEFS) {
    if (def.name === name) return def;
    if (def.aliases?.includes(name)) return def;
  }
  return null;
}

function sortRows(a: ColorRow, b: ColorRow): number {
  // Tokens first, then by total usage desc, then alpha asc (opaque first).
  const at = a.token ? 0 : 1;
  const bt = b.token ? 0 : 1;
  if (at !== bt) return at - bt;
  if (a.token && b.token) return a.token.localeCompare(b.token);
  const au = a.literalUsages.length + a.tokenUsages.length;
  const bu = b.literalUsages.length + b.tokenUsages.length;
  if (au !== bu) return bu - au;
  if (a.rgba[3] !== b.rgba[3]) return b.rgba[3] - a.rgba[3];
  return a.canonical.localeCompare(b.canonical);
}
