"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getShoppingListAction } from "@/app/actions/shop";
import {
  createInstacartShoppingListPage,
  InstacartApiError,
  InstacartNotConfiguredError,
} from "@/lib/instacart/client";
import { shoppingListItemsToInstacartLineItems } from "@/lib/instacart/map-line-items";

/**
 * Build the computed weekly shopping list, translate it into the Instacart
 * IDP payload shape, POST it, and return the shoppable-page URL for the
 * client to open in a new tab.
 */
export async function sendShopListToInstacartAction(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const shopping = await getShoppingListAction();
  if (!shopping.ok) return { ok: false, error: shopping.error };
  if (shopping.items.length === 0) {
    return { ok: false, error: "Your shopping list is empty." };
  }

  // Pull the top-ranked barcode per ingredient in a single query, then
  // reduce to one barcode per ingredient (lowest rank wins).
  const ingredientIds = [...new Set(shopping.items.map((i) => i.ingredientId))];
  const { data: productRows } = await supabase
    .from("ingredient_products")
    .select("ingredient_id, rank, barcode")
    .in("ingredient_id", ingredientIds)
    .not("barcode", "is", null)
    .order("ingredient_id", { ascending: true })
    .order("rank", { ascending: true });

  const barcodesByIngredientId = new Map<number, string>();
  for (const row of productRows ?? []) {
    const id = row.ingredient_id as number;
    if (barcodesByIngredientId.has(id)) continue;
    const barcode = typeof row.barcode === "string" ? row.barcode.trim() : "";
    if (barcode) barcodesByIngredientId.set(id, barcode);
  }

  const lineItems = shoppingListItemsToInstacartLineItems(
    shopping.items,
    barcodesByIngredientId,
  );

  try {
    const { url } = await createInstacartShoppingListPage({
      title: "kitchenOS shopping list",
      link_type: "shopping_list",
      expires_in: 14,
      line_items: lineItems,
      landing_page_configuration: {
        partner_linkback_url: await shopLinkbackUrl(),
      },
    });
    return { ok: true, url };
  } catch (err) {
    if (err instanceof InstacartNotConfiguredError) {
      return {
        ok: false,
        error:
          "Instacart isn't hooked up yet. Add your INSTACART_API_KEY and try again.",
      };
    }
    if (err instanceof InstacartApiError) {
      return {
        ok: false,
        error: `Instacart rejected the request (${err.status}). ${extractApiErrorMessage(err.body)}`,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not reach Instacart: ${message}` };
  }
}

/** Try to pull a user-friendly message out of an IDP error body, fall back to a generic line. */
function extractApiErrorMessage(body: string): string {
  if (!body) return "Try again in a moment.";
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const candidates = ["message", "error", "error_description"];
    for (const key of candidates) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  } catch {
    // Not JSON — fall through.
  }
  return "Try again in a moment.";
}

/**
 * Derive the URL to send Instacart as the partner linkback (so the user can
 * get back to kitchenOS from their Instacart page). Uses the request headers
 * so we don't need a hard-coded app URL env var.
 */
async function shopLinkbackUrl(): Promise<string | undefined> {
  try {
    const h = await headers();
    const forwardedHost = h.get("x-forwarded-host") ?? h.get("host");
    if (!forwardedHost) return undefined;
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}/shop`;
  } catch {
    return undefined;
  }
}
