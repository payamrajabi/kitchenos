import { AppHeader } from "@/components/app-header";
import { Suspense } from "react";

function HeaderFallback() {
  return (
    <header className="topbar" style={{ minHeight: "var(--triad-72)" }}>
      <div className="topbar-row topbar-tabs" />
    </header>
  );
}

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Suspense fallback={<HeaderFallback />}>
        <AppHeader />
      </Suspense>
      <main className="container">{children}</main>
    </>
  );
}
