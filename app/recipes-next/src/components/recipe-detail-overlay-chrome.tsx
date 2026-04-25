"use client";

import { Menu } from "@base-ui/react/menu";
import {
  ArrowSquareOut,
  DotsThree,
  PencilSimple,
  ShuffleAngular,
  Trash,
  X,
} from "@phosphor-icons/react";
import { type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRecipeDetailDialog } from "@/components/recipe-detail-dialog";
import { useTopLayerHost } from "@/lib/top-layer-host";

type Props = {
  onClose: () => void;
  // When null the editor is not in an owner context (e.g. community view) so
  // the kebab menu should not offer Edit / Delete.
  onEdit?: (() => void) | null;
  onDelete?: (() => void) | null;
  // When provided, a "Remix" entry is rendered in the kebab menu. Toggling
  // it is what reveals the bottom refine bar on the recipe detail view.
  onRemix?: (() => void) | null;
  // Reflects whether remix mode is currently active so the menu label can
  // flip between "Remix" and "Cancel remix".
  isRemixing?: boolean;
  sourceUrl?: string | null;
  // When true the kebab menu is suppressed entirely — useful for a read-only
  // community context where there are no recipe-scoped actions.
  hideMenu?: boolean;
  // Additional menu items rendered above the standard actions (e.g. community
  // "Save to library"). Callers pass a RecipeDetailOverlayMenuItem array.
  extraMenuItems?: RecipeDetailOverlayMenuItem[];
};

export type RecipeDetailOverlayMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

// Floating chrome shown over the top of the recipe detail when it's rendered
// inside the modal at mobile + medium breakpoints. On desktop (≥1008px) CSS
// hides it entirely and we fall back to the existing inline Edit button.
export function RecipeDetailOverlayChrome({
  onClose,
  onEdit,
  onDelete,
  onRemix,
  isRemixing = false,
  sourceUrl,
  hideMenu = false,
  extraMenuItems = [],
}: Props) {
  const trimmedSource = sourceUrl?.trim() || "";
  const hasBuiltInActions = !!(onEdit || onDelete || onRemix || trimmedSource);
  const showMenu = !hideMenu && (hasBuiltInActions || extraMenuItems.length > 0);

  // When the editor is rendered inside the recipe modal, Base UI's default
  // portal target (document.body) renders the menu underneath the native
  // <dialog> top-layer — so it opens but is invisible and unclickable.
  // We portal the menu into the active top-layer host so it stacks above
  // the dialog content. See `lib/top-layer-host.ts` for the pattern.
  const topLayerHost = useTopLayerHost();

  // Portal the chrome into the dialog's scroll container so it becomes a
  // direct child of the scrolling element. That makes `position: sticky`
  // track the full scroll extent — otherwise, for short recipes, the chrome
  // would scroll off the top once its immediate (article) parent's bottom
  // rose into view.
  const dialogCtx = useRecipeDetailDialog();
  const portalTarget = dialogCtx?.surfaceEl ?? null;

  const handleCloseClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const chrome = (
    <div className="recipe-detail-overlay-chrome" aria-hidden={false}>
      <button
        type="button"
        className="recipe-detail-overlay-btn recipe-detail-overlay-close"
        onClick={handleCloseClick}
        aria-label="Close recipe"
      >
        <X size={20} weight="bold" aria-hidden />
      </button>

      {showMenu ? (
        <Menu.Root>
          <Menu.Trigger
            render={
              <button
                type="button"
                className="recipe-detail-overlay-btn recipe-detail-overlay-menu-trigger"
                aria-label="Recipe actions"
              >
                <DotsThree size={24} weight="bold" aria-hidden />
              </button>
            }
          />
          <Menu.Portal container={topLayerHost ?? undefined}>
            <Menu.Positioner align="end" sideOffset={6} collisionPadding={12}>
              <Menu.Popup className="recipe-detail-overlay-menu">
                {extraMenuItems.map((item) => (
                  <Menu.Item
                    key={item.key}
                    className={[
                      "recipe-detail-overlay-menu-item",
                      item.destructive
                        ? "recipe-detail-overlay-menu-item--destructive"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={item.disabled}
                    onClick={() => item.onSelect()}
                  >
                    {item.label}
                  </Menu.Item>
                ))}

                {onRemix ? (
                  <Menu.Item
                    className="recipe-detail-overlay-menu-item"
                    onClick={() => onRemix()}
                  >
                    <ShuffleAngular size={16} weight="regular" aria-hidden />
                    <span>{isRemixing ? "Cancel remix" : "Remix"}</span>
                  </Menu.Item>
                ) : null}

                {onEdit ? (
                  <Menu.Item
                    className="recipe-detail-overlay-menu-item"
                    onClick={() => onEdit()}
                  >
                    <PencilSimple size={16} weight="regular" aria-hidden />
                    <span>Edit</span>
                  </Menu.Item>
                ) : null}

                {trimmedSource ? (
                  <Menu.Item
                    className="recipe-detail-overlay-menu-item"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.open(trimmedSource, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <ArrowSquareOut size={16} weight="regular" aria-hidden />
                    <span>Go to source</span>
                  </Menu.Item>
                ) : null}

                {onDelete && onEdit ? (
                  <Menu.Separator className="recipe-detail-overlay-menu-separator" />
                ) : null}

                {onDelete ? (
                  <Menu.Item
                    className="recipe-detail-overlay-menu-item recipe-detail-overlay-menu-item--destructive"
                    onClick={() => onDelete()}
                  >
                    <Trash size={16} weight="regular" aria-hidden />
                    <span>Delete recipe</span>
                  </Menu.Item>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
    </div>
  );

  return portalTarget ? createPortal(chrome, portalTarget) : chrome;
}
