"use client";

import { Toaster } from "sonner";
import "sonner/dist/styles.css";

/**
 * Global dismissible toasts (bottom-right). Used for nutrition errors and similar.
 */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      closeButton
      duration={10_000}
      visibleToasts={4}
    />
  );
}
