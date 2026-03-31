"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthModal } from "@/components/auth-modal";

const PRIMARY = [
  { href: "/plan", label: "Plan" },
  { href: "/recipes", label: "Recipes" },
  { href: "/inventory", label: "Inventory" },
  { href: "/shop", label: "Shop" },
  { href: "/people", label: "People" },
] as const;

function primaryTabState(pathname: string, href: string) {
  const inSection = pathname === href || pathname.startsWith(`${href}/`);
  const atTop = pathname === href;
  return { inSection, atTop };
}

export function AppHeader() {
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const signOut = useCallback(async () => {
    setMenuOpen(false);
    await createClient().auth.signOut();
  }, []);

  const initial = user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      <header className="topbar">
        <div className="topbar-row topbar-tabs">
          <div className="topbar-tabs-inner">
            <div className="page-tabs" role="tablist" aria-label="Primary views">
              {PRIMARY.map(({ href, label }) => {
                const { inSection, atTop } = primaryTabState(pathname, href);
                const tabClass = [
                  "page-tab-button",
                  inSection && atTop ? "active" : "",
                  inSection && !atTop ? "active-parent" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={tabClass}
                    role="tab"
                    aria-selected={inSection}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
            <div className="header-auth">
              {!user ? (
                <div className="header-auth-guest">
                  <button
                    type="button"
                    className="secondary header-auth-btn"
                    onClick={() => {
                      setAuthMode("signin");
                      setAuthOpen(true);
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className="secondary header-auth-btn"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthOpen(true);
                    }}
                  >
                    Sign up
                  </button>
                </div>
              ) : (
                <div className="header-auth-user">
                  <div className="user-menu">
                    <button
                      type="button"
                      className="user-avatar-button"
                      aria-haspopup="true"
                      aria-expanded={menuOpen}
                      aria-label="Account menu"
                        onClick={() => setMenuOpen((o) => !o)}
                    >
                      <span className="user-avatar-initial">{initial}</span>
                    </button>
                    {menuOpen ? (
                      <div
                        className="user-menu-dropdown"
                        role="menu"
                        aria-label="Account"
                      >
                        <div className="user-menu-email">{user.email}</div>
                        <button type="button" role="menuitem" onClick={signOut}>
                          Sign out
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onModeChange={setAuthMode}
      />
    </>
  );
}
