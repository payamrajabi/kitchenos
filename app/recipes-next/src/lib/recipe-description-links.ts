/** Markdown-style links and bare URLs in recipe description / notes. */

export type RichDescPart =
  | { kind: "text"; text: string }
  | { kind: "link"; label: string; href: string };

const MD_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
const BARE_URL_RE = /https?:\/\/[^\s[\]]+/gi;

export function isAllowedHttpUrl(raw: string): boolean {
  const t = raw.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function markdownLinkInsertion(label: string, url: string): string {
  return `[${label}](${url})`;
}

/**
 * When the clipboard is an http(s) URL and there is a non-empty selection,
 * replace the selection with `[selection](url)`.
 * Returns null if the default paste should run instead.
 */
export function applyMarkdownLinkPaste(args: {
  value: string;
  selStart: number;
  selEnd: number;
  pasted: string;
  /** Omit for no length cap (e.g. recipe notes). */
  maxLen?: number;
}): { value: string; caret: number } | null {
  const { value, selStart, selEnd, pasted } = args;
  const maxLen = args.maxLen ?? Number.POSITIVE_INFINITY;
  if (selStart === selEnd) return null;
  if (!isAllowedHttpUrl(pasted)) return null;
  const selected = value.slice(selStart, selEnd);
  if (selected.length === 0) return null;

  const room = maxLen - value.length + (selEnd - selStart);
  let label = selected;
  let ins = markdownLinkInsertion(label, pasted);
  while (ins.length > room && label.length > 0) {
    label = label.slice(0, -1);
    ins = markdownLinkInsertion(label, pasted);
  }
  if (ins.length > room) return null;

  const next = value.slice(0, selStart) + ins + value.slice(selEnd);
  return { value: next, caret: selStart + ins.length };
}

function trimTrailingUrlPunctuation(href: string): string {
  return href.replace(/[),.;:!?]+$/, "");
}

function splitTextWithAutolinks(segment: string): RichDescPart[] {
  const pieces: RichDescPart[] = [];
  let last = 0;
  const re = new RegExp(BARE_URL_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    if (m.index > last) {
      pieces.push({ kind: "text", text: segment.slice(last, m.index) });
    }
    const href = trimTrailingUrlPunctuation(m[0]);
    if (isAllowedHttpUrl(href)) {
      pieces.push({ kind: "link", label: href, href });
    } else {
      pieces.push({ kind: "text", text: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < segment.length) {
    pieces.push({ kind: "text", text: segment.slice(last) });
  }
  return pieces;
}

function mergeAdjacentText(parts: RichDescPart[]): RichDescPart[] {
  const merged: RichDescPart[] = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (p.kind === "text" && prev?.kind === "text") {
      prev.text += p.text;
    } else {
      merged.push(p.kind === "text" ? { kind: "text", text: p.text } : { ...p });
    }
  }
  return merged;
}

/** Parse markdown links and bare http(s) URLs into plain text + link runs (for safe React rendering). */
export function parseRecipeDescriptionToParts(input: string): RichDescPart[] {
  const out: RichDescPart[] = [];
  let last = 0;
  const re = new RegExp(MD_LINK_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) {
      out.push(...splitTextWithAutolinks(input.slice(last, m.index)));
    }
    const href = m[2].trim();
    if (isAllowedHttpUrl(href)) {
      const label = m[1];
      out.push({ kind: "link", label: label.length ? label : href, href });
    } else {
      out.push({ kind: "text", text: m[0] });
    }
    last = re.lastIndex;
  }
  if (last < input.length) {
    out.push(...splitTextWithAutolinks(input.slice(last)));
  }
  return mergeAdjacentText(out);
}

/** Strip markdown links to their visible label for SEO snippets. */
export function recipeDescriptionPlainSnippet(raw: string): string {
  return raw
    .trim()
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, "$1")
    .trim();
}
