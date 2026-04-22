"use client";

// Tiny module-level pub/sub that tracks which top-layer element (a native
// <dialog> opened via showModal, or a popover) is currently on top of the
// page. The AppToaster subscribes and re-parents itself into that element so
// sonner toasts render in the same top-layer and therefore appear above the
// open dialog instead of being hidden behind it (the browser's top-layer
// cannot be beaten with z-index alone).
//
// When no dialog is open the host is null and the toaster falls back to its
// default body-level mount.

type Listener = () => void;

let currentHost: HTMLElement | null = null;
const listeners = new Set<Listener>();

export function getTopLayerHost(): HTMLElement | null {
  return currentHost;
}

export function setTopLayerHost(el: HTMLElement | null): void {
  if (currentHost === el) return;
  currentHost = el;
  for (const listener of listeners) listener();
}

export function subscribeTopLayerHost(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
