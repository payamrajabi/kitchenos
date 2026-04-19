"use client";

import { useEffect, useState } from "react";

type Variant = "import" | "generate";

const CAPTIONS: Record<Variant, string[]> = {
  import: [
    "Reading the recipe",
    "Understanding ingredients",
    "Measuring it out",
    "Almost ready",
  ],
  generate: [
    "Creating image",
    "Sketching it out",
    "Adding colour",
    "Final touches",
  ],
};

const CAPTION_INTERVAL_MS = 3200;

type Props = {
  variant?: Variant;
  ariaLabel?: string;
  className?: string;
  size?: "compact" | "full";
};

export function AiImagePlaceholder({
  variant = "generate",
  ariaLabel,
  className,
  size = "full",
}: Props) {
  const captions = CAPTIONS[variant];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % captions.length);
    }, CAPTION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [captions.length]);

  const classes = [
    "ai-image-placeholder",
    `ai-image-placeholder--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="status"
      aria-live="polite"
      aria-label={
        ariaLabel ??
        (variant === "import" ? "Importing recipe" : "Generating image")
      }
    >
      <div className="ai-image-placeholder-glow" aria-hidden />
      <div className="ai-image-placeholder-dots" aria-hidden />
      <div className="ai-image-placeholder-caption">
        {captions.map((c, i) => (
          <span
            key={c}
            className={
              "ai-image-placeholder-caption-item" +
              (i === index ? " is-active" : "")
            }
            aria-hidden={i !== index}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
