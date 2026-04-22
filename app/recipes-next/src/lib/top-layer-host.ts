"use client";

// Tiny module-level pub/sub that tracks which top-layer element (a native
// <dialog> opened via showModal) is currently on top of the page.
//
// Why this exists — the browser renders showModal-ed dialogs in a special
// "top layer" that sits above everything else in the document and that
// `z-index` cannot beat. Anything portaled into <body> (toasts, Radix
// popovers, our own popovers, custom modal cards) therefore renders
// UNDERNEATH the dialog, which is exactly the "my dropdown opens behind
// the modal" bug. Components that portal should ALWAYS target this host
// when it's set so they land inside the same top layer and stack above
// the modal's content; when no dialog is open the host is null and they
// fall back to their default body-level mount.
//
// Every new popover / dropdown / menu / tooltip / modal-card we add should
// use `useTopLayerPortalContainer()` (or read the host directly) for its
// portal target. See `.cursor/rules/popovers-above-modals.mdc`.

import { useSyncExternalStore } from "react";

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

// Server render: no top-layer host exists yet; components should behave as
// if there's no active dialog (i.e. fall back to body).
const getServerSnapshot = () => null;

/**
 * React hook: returns the currently-registered top-layer host (typically a
 * native <dialog>) and subscribes to changes. Null when no top-layer host
 * is active.
 */
export function useTopLayerHost(): HTMLElement | null {
  return useSyncExternalStore(
    subscribeTopLayerHost,
    getTopLayerHost,
    getServerSnapshot,
  );
}

/**
 * Preferred API for any portal that represents a popover, dropdown, menu,
 * tooltip, or floating modal card.
 *
 * Returns the DOM node a `createPortal(..., container)` (or Radix
 * `<…Portal container={…}>`) should render into so the floating surface
 * stacks ABOVE whatever surface triggered it:
 *
 *  - If a native <dialog> is currently open via showModal(), returns that
 *    dialog element. The portal contents then render in the browser's
 *    top layer and sit above the dialog's own content.
 *  - Otherwise returns `document.body` (or `null` during SSR), which is
 *    the normal unaffected body-level mount.
 *
 * Pass this directly as the `container` prop to Radix portals, or use it
 * with React's `createPortal`.
 */
export function useTopLayerPortalContainer(): HTMLElement | null {
  const host = useTopLayerHost();
  if (host) return host;
  if (typeof document === "undefined") return null;
  return document.body;
}
