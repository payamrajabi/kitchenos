"use client";

import { useEffect } from "react";

const COOKIE_NAME = "user_tz";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Writes a `user_tz` cookie with the browser's IANA timezone so the server
 * can render "today" and "is this slot in the past?" in the user's actual
 * time, not the Vercel UTC server.
 *
 * Only touches the cookie when the value changes, so it's a no-op on most loads.
 */
export function TimeZoneSync() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const current = readCookie(COOKIE_NAME);
      if (current === tz) return;
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(tz)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    } catch {
      // ignore — fall back to server-side IP-based guess
    }
  }, []);
  return null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}
