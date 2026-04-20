"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Toaster } from "sonner";
import "sonner/dist/styles.css";
import {
  getTopLayerHost,
  subscribeTopLayerHost,
} from "@/lib/top-layer-host";

/**
 * Global dismissible toasts (bottom-right). Used for nutrition errors,
 * step-timer "done" alarms, and similar.
 *
 * When a top-layer element is active (e.g. the recipe-detail <dialog>
 * rendered via showModal), we portal the toaster into that element so its
 * toasts render in the same top-layer and stack ABOVE the dialog content.
 * Otherwise the browser renders the dialog above everything in the normal
 * stacking context — including toasts with high z-index — and a timer
 * "done" alarm becomes impossible to dismiss without first closing the
 * dialog. Sonner's toast queue lives in a module-level store, so moving the
 * Toaster between hosts is safe — in-flight toasts are picked up by the
 * freshly-mounted Toaster.
 */
const getServerSnapshot = () => null;

export function AppToaster() {
  const host = useSyncExternalStore(
    subscribeTopLayerHost,
    getTopLayerHost,
    getServerSnapshot,
  );

  const toaster = (
    <Toaster
      position="bottom-right"
      closeButton
      duration={10_000}
      visibleToasts={4}
    />
  );

  if (host) {
    return createPortal(toaster, host);
  }
  return toaster;
}
