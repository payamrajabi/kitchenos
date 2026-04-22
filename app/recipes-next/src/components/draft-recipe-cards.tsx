"use client";

import { AiImagePlaceholder } from "@/components/ai-image-placeholder";
import {
  useDraftImports,
  type DraftImport,
} from "@/components/draft-imports-provider";
import { DRAFT_STORAGE_KEY } from "@/components/recipe-add-fab";
import { X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

function DraftCard({ draft }: { draft: DraftImport }) {
  const { removeDraft, getDraftData } = useDraftImports();
  const router = useRouter();

  const handleClick = useCallback(() => {
    if (draft.status !== "ready") return;
    const data = getDraftData(draft.id);
    if (!data) return;
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
    sessionStorage.setItem("kitchenos-active-draft-id", draft.id);
    router.push("/recipes/draft");
  }, [draft, getDraftData, router]);

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeDraft(draft.id);
    },
    [draft.id, removeDraft],
  );

  if (draft.status === "importing") {
    return (
      <div className="card draft-card draft-card--importing">
        <AiImagePlaceholder
          variant="import"
          size="compact"
          ariaLabel={`Importing ${draft.label}`}
        />
        <div className="card-content">
          <h4 className="card-title draft-card-label">{draft.label}</h4>
        </div>
      </div>
    );
  }

  if (draft.status === "error") {
    return (
      <div className="card draft-card draft-card--error">
        <div className="draft-card-image draft-card-image--error">!</div>
        <div className="card-content">
          <h4 className="card-title draft-card-label">Import failed</h4>
          <p className="card-meta draft-card-error-text">{draft.error}</p>
        </div>
        <button
          type="button"
          className="draft-card-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="card draft-card draft-card--ready"
      onClick={handleClick}
    >
      <div className="draft-card-image draft-card-image--ready">
        <span className="draft-card-ready-badge">DRAFT</span>
      </div>
      <div className="card-content">
        <h4 className="card-title">{draft.previewName ?? "Untitled"}</h4>
        <div className="card-meta">Tap to review</div>
      </div>
      <button
        type="button"
        className="draft-card-dismiss"
        onClick={handleDismiss}
        aria-label="Discard draft"
      >
        <X size={14} weight="bold" aria-hidden />
      </button>
    </button>
  );
}

export function DraftRecipeCards() {
  const { drafts } = useDraftImports();
  if (!drafts.length) return null;
  return (
    <>
      {drafts.map((d) => (
        <DraftCard key={d.id} draft={d} />
      ))}
    </>
  );
}
