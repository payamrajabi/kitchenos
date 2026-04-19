import { AppHeader } from "@/components/app-header";
import { Suspense } from "react";

function HeaderFallback() {
  return (
    <header className="topbar" style={{ minHeight: "var(--space-72)" }}>
      <div className="topbar-row topbar-tabs" />
    </header>
  );
}

export default function MainLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  // Parallel-route slot used by intercepting routes such as
  // @modal/(.)recipes/[id] to render recipe detail as an overlay on top of
  // whichever tab the user was on. On hard-load the intercepted route is
  // bypassed and the user lands on the full standalone page instead.
  modal: React.ReactNode;
}>) {
  return (
    <>
      <Suspense fallback={<HeaderFallback />}>
        <AppHeader />
      </Suspense>
      <main className="container">{children}</main>
      {modal}
    </>
  );
}
