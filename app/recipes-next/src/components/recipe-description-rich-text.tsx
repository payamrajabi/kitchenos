import { parseRecipeDescriptionToParts } from "@/lib/recipe-description-links";
import type { ReactNode } from "react";

type Tag = "div" | "p" | "span";

export function RecipeDescriptionRichText({
  text,
  className,
  as,
}: {
  text: string;
  className?: string;
  /** Default `div`; use `span` for inline context. */
  as?: Tag;
}) {
  const Component = as ?? "div";
  const parts = parseRecipeDescriptionToParts(text);
  const children: ReactNode[] = parts.map((p, i) => {
    if (p.kind === "text") {
      return <span key={i}>{p.text}</span>;
    }
    return (
      <a
        key={i}
        href={p.href}
        target="_blank"
        rel="noreferrer noopener"
        className="recipe-rich-link"
      >
        {p.label}
      </a>
    );
  });

  return <Component className={className}>{children}</Component>;
}
