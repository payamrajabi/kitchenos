/**
 * Thin wrapper around Instacart's Developer Platform API (IDP).
 *
 * We only use the "Create shopping list page" endpoint for now:
 *   POST /idp/v1/products/products_link
 *
 * See https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page/
 *
 * Configured via env:
 *  - `INSTACART_API_KEY` (required) — bearer token issued to kitchenOS in IDP.
 *  - `INSTACART_API_BASE_URL` (optional) — base URL; defaults to the production
 *    host. Use `https://connect.dev.instacart.tools` while building against
 *    a development key.
 */

const DEFAULT_BASE_URL = "https://connect.instacart.com";
const PRODUCTS_LINK_PATH = "/idp/v1/products/products_link";

export type InstacartMeasurement = {
  quantity: number;
  unit: string;
};

export type InstacartLineItem = {
  name: string;
  display_text?: string;
  line_item_measurements?: InstacartMeasurement[];
  /** Mutually exclusive with `product_ids`. We only use UPCs. */
  upcs?: string[];
};

export type CreateShoppingListPageInput = {
  title: string;
  image_url?: string;
  /** One of 'shopping_list' or 'recipe'. Defaults to 'shopping_list' at IDP. */
  link_type?: "shopping_list" | "recipe";
  /** Days until link expires. Max 365. */
  expires_in?: number;
  instructions?: string[];
  line_items: InstacartLineItem[];
  landing_page_configuration?: {
    partner_linkback_url?: string;
    enable_pantry_items?: boolean;
  };
};

export type CreateShoppingListPageResult = {
  url: string;
};

export class InstacartNotConfiguredError extends Error {
  constructor() {
    super("Instacart is not configured.");
    this.name = "InstacartNotConfiguredError";
  }
}

export class InstacartApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Instacart API request failed (${status}).`);
    this.name = "InstacartApiError";
    this.status = status;
    this.body = body;
  }
}

function requireApiKey(): string {
  const key = process.env.INSTACART_API_KEY?.trim();
  if (!key) throw new InstacartNotConfiguredError();
  return key;
}

function baseUrl(): string {
  const raw = process.env.INSTACART_API_BASE_URL?.trim();
  const url = raw && raw.length > 0 ? raw : DEFAULT_BASE_URL;
  return url.replace(/\/+$/, "");
}

/**
 * Create a shoppable shopping-list page on Instacart Marketplace and return
 * the shareable URL users should be redirected to.
 */
export async function createInstacartShoppingListPage(
  input: CreateShoppingListPageInput,
): Promise<CreateShoppingListPageResult> {
  const apiKey = requireApiKey();
  const endpoint = `${baseUrl()}${PRODUCTS_LINK_PATH}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input),
    // IDP is a simple outbound call; never cache between users.
    cache: "no-store",
  });

  const rawBody = await response.text();

  if (!response.ok) {
    throw new InstacartApiError(response.status, rawBody);
  }

  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new InstacartApiError(
      response.status,
      `Could not parse response JSON: ${rawBody.slice(0, 500)}`,
    );
  }

  const url = extractShoppingListUrl(parsed);
  if (!url) {
    throw new InstacartApiError(
      response.status,
      `Missing shopping list URL in response: ${rawBody.slice(0, 500)}`,
    );
  }

  return { url };
}

/**
 * The docs describe the response as `{ products_link_url: "..." }`, but be
 * defensive: accept a handful of plausible field names without blowing up.
 */
function extractShoppingListUrl(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const candidates = ["products_link_url", "url", "shopping_list_url"];
  for (const key of candidates) {
    const value = obj[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}
