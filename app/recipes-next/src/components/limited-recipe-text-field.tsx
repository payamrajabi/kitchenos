"use client";

import {
  Fragment,
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type Variant = "ingredients" | "instructions";

const ORDERED_LINE = /^(\s*)(\d+)\.\s(.*)$/;

function renderInlineBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function parseInstructionBlocks(text: string) {
  const rawLines = text.split("\n");
  const blocks: ({ ol: string[] } | { para: string[] })[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (ORDERED_LINE.test(line)) {
      const items: string[] = [];
      while (i < rawLines.length) {
        const l = rawLines[i];
        const m = l.match(ORDERED_LINE);
        if (!m) break;
        items.push(m[3]);
        i++;
      }
      blocks.push({ ol: items });
    } else {
      const para: string[] = [];
      while (i < rawLines.length) {
        const l = rawLines[i];
        if (ORDERED_LINE.test(l)) break;
        para.push(l);
        i++;
      }
      blocks.push({ para });
    }
  }
  return blocks;
}

function InstructionsReadView({ value }: { value: string }) {
  const blocks = parseInstructionBlocks(value);
  return (
    <>
      {blocks.map((b, bi) => {
        if ("ol" in b) {
          return (
            <ol key={bi} className="recipe-md-ol">
              {b.ol.map((item, ii) => (
                <li key={ii}>{renderInlineBold(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <div key={bi} className="recipe-md-para">
            {b.para.map((ln, li) => (
              <Fragment key={li}>
                {li > 0 ? <br /> : null}
                {renderInlineBold(ln)}
              </Fragment>
            ))}
          </div>
        );
      })}
    </>
  );
}

function IngredientsReadView({ value }: { value: string }) {
  const lines = value.split("\n");
  return (
    <div className="recipe-md-ingredients">
      {lines.map((line, i) => (
        <p key={i} className="recipe-md-ing-line">
          {line === "" ? "\u00a0" : renderInlineBold(line)}
        </p>
      ))}
    </div>
  );
}

function lineBounds(text: string, cursor: number): { start: number; end: number } {
  const before = text.slice(0, cursor);
  const start = before.lastIndexOf("\n") + 1;
  const nl = text.indexOf("\n", cursor);
  const end = nl === -1 ? text.length : nl;
  return { start, end };
}

function instructionsKeyDown(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  setValue: (v: string) => void,
) {
  const ta = e.currentTarget;
  const { selectionStart: start, selectionEnd: end } = ta;

  if (e.key === "Enter" && !e.shiftKey) {
    if (start !== end) return;
    const { start: lineStart, end: lineEnd } = lineBounds(value, start);
    const line = value.slice(lineStart, lineEnd);
    const m = line.match(ORDERED_LINE);
    if (m && start === lineEnd) {
      e.preventDefault();
      const indent = m[1];
      const n = parseInt(m[2], 10);
      const insert = `\n${indent}${n + 1}. `;
      const next = value.slice(0, start) + insert + value.slice(start);
      setValue(next);
      requestAnimationFrame(() => {
        const pos = start + insert.length;
        ta.setSelectionRange(pos, pos);
      });
    }
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
    e.preventDefault();
    const sel = value.slice(start, end);
    if (start !== end) {
      const wrapped = `**${sel}**`;
      const next = value.slice(0, start) + wrapped + value.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        const pos = start + wrapped.length;
        ta.setSelectionRange(pos, pos);
      });
    } else {
      const ins = "****";
      const next = value.slice(0, start) + ins + value.slice(start);
      setValue(next);
      requestAnimationFrame(() => {
        const mid = start + 2;
        ta.setSelectionRange(mid, mid);
      });
    }
  }
}

function ingredientsKeyDown(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  setValue: (v: string) => void,
) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
    e.preventDefault();
    const ta = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = ta;
    const sel = value.slice(start, end);
    if (start !== end) {
      const wrapped = `**${sel}**`;
      const next = value.slice(0, start) + wrapped + value.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        const pos = start + wrapped.length;
        ta.setSelectionRange(pos, pos);
      });
    } else {
      const ins = "****";
      const next = value.slice(0, start) + ins + value.slice(start);
      setValue(next);
      requestAnimationFrame(() => {
        const mid = start + 2;
        ta.setSelectionRange(mid, mid);
      });
    }
  }
}

export function LimitedRecipeTextField({
  value,
  onChange,
  onBlur,
  disabled,
  rows = 8,
  placeholder,
  ariaLabel,
  variant,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  ariaLabel: string;
  variant: Variant;
}) {
  const [editing, setEditing] = useState(() => !value.trim());
  const taRef = useRef<HTMLTextAreaElement>(null);

  const openEdit = useCallback(() => {
    if (disabled) return;
    setEditing(true);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      const len = value.length;
      taRef.current?.setSelectionRange(len, len);
    });
  }, [disabled, value.length]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (variant === "instructions") {
        instructionsKeyDown(e, value, onChange);
      } else {
        ingredientsKeyDown(e, value, onChange);
      }
    },
    [variant, value, onChange],
  );

  const minH = `calc(${rows} * 1.45em + var(--space-12) + var(--space-6))`;

  if (editing) {
    return (
      <textarea
        ref={taRef}
        className="recipe-pre recipe-detail-textarea"
        rows={rows}
        style={{ minHeight: minH }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setEditing(false);
          onBlur();
        }}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <div
      tabIndex={disabled ? -1 : 0}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline
      className={[
        "recipe-limited-md-readonly",
        "recipe-pre",
        "recipe-detail-textarea",
        disabled ? "recipe-limited-md-readonly--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ minHeight: minH }}
      onClick={openEdit}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openEdit();
        }
      }}
    >
      {value.trim() === "" ? (
        <span className="recipe-md-placeholder">{placeholder}</span>
      ) : variant === "instructions" ? (
        <InstructionsReadView value={value} />
      ) : (
        <IngredientsReadView value={value} />
      )}
    </div>
  );
}
