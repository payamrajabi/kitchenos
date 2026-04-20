"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowSquareOut, DotsThree, PencilSimple, Trash, X } from "@phosphor-icons/react";
import { useSyncExternalStore, type MouseEvent } from "react";
import {
  getTopLayerHost,
  subscribeTopLayerHost,
} from "@/lib/top-layer-host";

const getServerSnapshot = () => null;

type Props = {
  onClose: () => void;
  // When null the editor is not in an owner context (e.g. community view) so
  // the kebab menu should not offer Edit / Delete.
  onEdit?: (() => void) | null;
  onDelete?: (() => void) | null;
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
  sourceUrl,
  hideMenu = false,
  extraMenuItems = [],
}: Props) {
  const trimmedSource = sourceUrl?.trim() || "";
  const hasBuiltInActions = !!(onEdit || onDelete || trimmedSource);
  const showMenu = !hideMenu && (hasBuiltInActions || extraMenuItems.length > 0);

  // When the editor is rendered inside the recipe modal, Radix's default
  // portal target (document.body) renders the menu underneath the native
  // <dialog> top-layer — so it opens but is invisible and unclickable.
  // We read the current top-layer host from our shared store and portal the
  // menu into it so the menu stacks above the dialog content.
  const topLayerHost = useSyncExternalStore(
    subscribeTopLayerHost,
    getTopLayerHost,
    getServerSnapshot,
  );

  const handleCloseClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
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
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="recipe-detail-overlay-btn recipe-detail-overlay-menu-trigger"
              aria-label="Recipe actions"
            >
              <DotsThree size={24} weight="bold" aria-hidden />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal container={topLayerHost ?? undefined}>
            <DropdownMenu.Content
              className="recipe-detail-overlay-menu"
              align="end"
              sideOffset={6}
              collisionPadding={12}
            >
              {extraMenuItems.map((item) => (
                <DropdownMenu.Item
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
                  onSelect={(event) => {
                    event.preventDefault();
                    item.onSelect();
                  }}
                >
                  {item.label}
                </DropdownMenu.Item>
              ))}

              {onEdit ? (
                <DropdownMenu.Item
                  className="recipe-detail-overlay-menu-item"
                  onSelect={(event) => {
                    event.preventDefault();
                    onEdit();
                  }}
                >
                  <PencilSimple size={16} weight="regular" aria-hidden />
                  <span>Edit</span>
                </DropdownMenu.Item>
              ) : null}

              {trimmedSource ? (
                <DropdownMenu.Item
                  className="recipe-detail-overlay-menu-item"
                  onSelect={(event) => {
                    event.preventDefault();
                    if (typeof window !== "undefined") {
                      window.open(trimmedSource, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  <ArrowSquareOut size={16} weight="regular" aria-hidden />
                  <span>Go to source</span>
                </DropdownMenu.Item>
              ) : null}

              {onDelete && onEdit ? (
                <DropdownMenu.Separator className="recipe-detail-overlay-menu-separator" />
              ) : null}

              {onDelete ? (
                <DropdownMenu.Item
                  className="recipe-detail-overlay-menu-item recipe-detail-overlay-menu-item--destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    onDelete();
                  }}
                >
                  <Trash size={16} weight="regular" aria-hidden />
                  <span>Delete recipe</span>
                </DropdownMenu.Item>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
    </div>
  );
}
