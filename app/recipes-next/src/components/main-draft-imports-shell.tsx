"use client";

import { DraftImportsProvider } from "@/components/draft-imports-provider";
import type { ReactNode } from "react";

/**
 * Wraps main content and the parallel `@modal` slot so both share
 * DraftImportsProvider (recipe AI bar + draft import state).
 */
export function MainDraftImportsShell({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <DraftImportsProvider>
      {children}
      {modal}
    </DraftImportsProvider>
  );
}
