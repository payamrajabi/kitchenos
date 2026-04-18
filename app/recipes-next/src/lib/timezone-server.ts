import { cookies, headers } from "next/headers";

export const USER_TZ_COOKIE = "user_tz";

/**
 * Resolve the user's IANA timezone on the server, in preference order:
 *  1. `user_tz` cookie — written by the browser on first load from
 *     `Intl.DateTimeFormat().resolvedOptions().timeZone`. Always authoritative.
 *  2. Vercel's `x-vercel-ip-timezone` header — IP-geo guess, good for the
 *     very first render before the cookie exists.
 *  3. The process default timezone (dev machine) or `UTC` (Vercel prod).
 *
 * Never throws; always returns a valid IANA string that `Intl` accepts.
 */
export async function getUserTimeZone(): Promise<string> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(USER_TZ_COOKIE)?.value;
  if (fromCookie && isValidTimeZone(fromCookie)) return fromCookie;

  const headerStore = await headers();
  const fromHeader = headerStore.get("x-vercel-ip-timezone");
  if (fromHeader && isValidTimeZone(fromHeader)) return fromHeader;

  const processTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return processTz;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
