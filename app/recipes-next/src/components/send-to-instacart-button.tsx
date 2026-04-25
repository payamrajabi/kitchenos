"use client";

import { useTransition } from "react";
import { ArrowSquareOut, ShoppingCart } from "@phosphor-icons/react";
import { toast } from "sonner";
import { sendShopListToInstacartAction } from "@/app/actions/instacart";

/**
 * "Send to Instacart" button shown on the /shop page above the computed
 * shopping list. Calls the server action, then opens the returned Instacart
 * Marketplace URL in a new tab. Errors surface as toasts; the button never
 * navigates the current tab away from kitchenOS.
 */
export function SendToInstacartButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await sendShopListToInstacartAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const opened = window.open(result.url, "_blank", "noopener,noreferrer");
      if (!opened) {
        // Popup was blocked; surface the URL so the user can still act on it.
        toast.message("Tap to open your Instacart list", {
          action: {
            label: "Open",
            onClick: () => {
              window.location.href = result.url;
            },
          },
        });
      }
    });
  }

  return (
    <div className="shop-cta-bar">
      <button
        type="button"
        className="send-to-instacart-btn"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
      >
        <ShoppingCart size={16} weight="regular" aria-hidden />
        <span>{isPending ? "Sending to Instacart…" : "Send to Instacart"}</span>
        <ArrowSquareOut size={14} weight="regular" aria-hidden />
      </button>
    </div>
  );
}
