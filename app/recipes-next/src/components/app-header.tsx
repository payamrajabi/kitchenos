"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthModal } from "@/components/auth-modal";
import { dispatchPlanScrollToToday } from "@/lib/plan-board-scroll";
import { useTopbarUnifiedNav } from "@/lib/use-topbar-unified-nav";

const PRIMARY = [
  { href: "/plan", label: "Plan" },
  { href: "/recipes", label: "Recipes" },
  { href: "/inventory", label: "Inventory" },
  { href: "/shop", label: "Shop" },
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

  const { rowRef, leftProbeRef, rightProbeRef, useUnifiedStrip } =
    useTopbarUnifiedNav({ pathname, user, menuOpen });

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

  const avatarUrl = (() => {
    if (!user) return undefined;
    const m = user.user_metadata as Record<string, unknown> | undefined;
    const raw = m?.avatar_url ?? m?.picture ?? m?.avatar;
    return typeof raw === "string" && raw.length > 0 ? raw : undefined;
  })();

  const onPlanTabClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const { atTop } = primaryTabState(pathname, "/plan");
    if (!atTop) return;
    e.preventDefault();
    dispatchPlanScrollToToday();
  };

  const tabLink = (
    href: string,
    label: string,
    extraClass?: string,
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void,
  ) => {
    const { inSection, atTop } = primaryTabState(pathname, href);
    const tabClass = [
      "page-tab-button",
      extraClass,
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
        aria-current={inSection && atTop ? "page" : undefined}
        onClick={onClick}
      >
        {label}
      </Link>
    );
  };

  const headerAuth = (
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
              data-has-photo={avatarUrl ? "true" : undefined}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {avatarUrl ? (
                <Image
                  className="user-avatar-image"
                  src={avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="user-avatar-initial">{initial}</span>
              )}
            </button>
            {menuOpen ? (
              <div
                className="user-menu-dropdown open"
                role="menu"
                aria-label="Account"
              >
                <div className="user-menu-email">{user.email}</div>
                <Link
                  href="/people"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  Family members
                </Link>
                <button type="button" role="menuitem" onClick={signOut}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <header className={`topbar${useUnifiedStrip ? " topbar--unified-nav" : ""}`}>
        {/* Off-screen width probe: same tab + auth styles as the split bar. */}
        <div className="topbar-layout-probe" aria-hidden inert>
          <div ref={leftProbeRef} className="page-tabs">
            {PRIMARY.map(({ href, label }) =>
              tabLink(
                href,
                label,
                undefined,
                href === "/plan" ? onPlanTabClick : undefined,
              ),
            )}
          </div>
          <div ref={rightProbeRef} className="header-right">
            {headerAuth}
          </div>
        </div>

        <div ref={rowRef} className="topbar-row topbar-tabs">
          <div
            className="topbar-nav-cluster topbar-nav-cluster--narrow"
            hidden={!useUnifiedStrip}
          >
            <nav
              className="page-tabs-scroll topbar-nav-scroll"
              aria-label="Primary navigation"
            >
              <div className="page-tabs page-tabs--with-auth">
                {PRIMARY.map(({ href, label }) =>
                  tabLink(
                    href,
                    label,
                    undefined,
                    href === "/plan" ? onPlanTabClick : undefined,
                  ),
                )}
                {headerAuth}
              </div>
            </nav>
          </div>

          <div
            className="topbar-nav-cluster topbar-nav-cluster--wide"
            hidden={useUnifiedStrip}
          >
            <nav
              className="topbar-tabs-inner"
              aria-label="Primary navigation"
            >
              <div className="page-tabs-scroll">
                <div className="page-tabs">
                  {PRIMARY.map(({ href, label }) =>
                    tabLink(
                      href,
                      label,
                      undefined,
                      href === "/plan" ? onPlanTabClick : undefined,
                    ),
                  )}
                </div>
              </div>
              <div className="header-right">{headerAuth}</div>
            </nav>
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
