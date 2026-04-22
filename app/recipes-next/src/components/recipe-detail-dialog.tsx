"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { getTopLayerHost, setTopLayerHost } from "@/lib/top-layer-host";

// Provides the enclosing modal's close handler to descendants (in particular
// to the <RecipeDetailEditor>, which renders its own overlay chrome when it
// detects it's inside a dialog). When the handler is null, the editor knows
// it's rendering on a full page and does not render any modal-only chrome.
type RecipeDetailDialogContextValue = {
  close: () => void;
} | null;

const RecipeDetailDialogContext =
  createContext<RecipeDetailDialogContextValue>(null);

export function useRecipeDetailDialog() {
  return useContext(RecipeDetailDialogContext);
}

type Props = {
  children: ReactNode;
  // Fallback destination if there's no history to pop (e.g. the user deep-
  // linked to /recipes/[id] in a new tab and still somehow ended up in the
  // intercepted slot). In practice this rarely fires — an intercepted route
  // always has an underlying page to return to.
  closeFallbackHref: string;
  // Accessible label announced by screen readers when the dialog opens.
  ariaLabel?: string;
};

// Wraps recipe detail content (the big <RecipeDetailEditor>) in a native
// <dialog> so we get focus trap, Esc-to-close, and a rendered-above-everything
// stacking context for free. Visual presentation — slide-up on mobile, a
// centered 600px card between 600–1008px, a 960px dual-column card ≥1008,
// backdrop colour, fixed corner chrome — all lives in globals.css under
// `.recipe-detail-dialog` so it responds to viewport changes without JS.
export function RecipeDetailDialog({
  children,
  closeFallbackHref,
  ariaLabel,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Guard against double-close: both the native 'cancel' (Esc) and our own
  // click handlers can race, and we only want one animation + router.back().
  const closingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (!el.open) {
      // showModal() is what gives us focus trap + ::backdrop. Opening with
      // the `open` attribute alone would skip both.
      try {
        el.showModal();
      } catch {
        /* Already open or not supported — harmless. */
      }
    }
    // Register as the active top-layer host so the global <Toaster> re-
    // parents into this dialog and its toasts stack above the dialog
    // content rather than being trapped behind the top-layer.
    setTopLayerHost(el);
    return () => {
      // Only clear if we're still the registered host — another dialog may
      // have registered after us (unlikely in practice, but cheap to guard).
      if (getTopLayerHost() === el) {
        setTopLayerHost(null);
      }
    };
  }, []);

  const dismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    const el = dialogRef.current;

    // Release the toaster host at the start of the close animation so any
    // toasts that arrive mid-close land in the body where they'll be
    // immediately visible, rather than inside a dialog that's sliding away.
    if (el && getTopLayerHost() === el) {
      setTopLayerHost(null);
    }

    const finish = () => {
      // Prefer returning via history so the back stack stays clean; fall back
      // to a hard navigate if there's nothing to pop.
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push(closeFallbackHref);
      }
    };

    if (!el) {
      finish();
      return;
    }

    // Keep this in sync with the transition length in globals.css
    // (.recipe-detail-dialog[data-closing="true"]). Using a timeout rather
    // than transitionend so we don't get stuck if the transition is cancelled
    // (e.g. reduced-motion users).
    const TRANSITION_MS = 220;
    window.setTimeout(() => {
      try {
        el.close();
      } catch {
        /* ignore */
      }
      finish();
    }, TRANSITION_MS);
  }, [closeFallbackHref, router]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (event: Event) => {
      // Intercept the native cancel (Esc) so we can play our own close
      // animation instead of the browser's instant tear-down.
      event.preventDefault();
      dismiss();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [dismiss]);

  // Backdrop click: native <dialog> dispatches clicks that land on the
  // backdrop area with target === the dialog element itself. Clicks inside
  // the surface propagate up with a descendant target and are ignored here.
  const onDialogClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) dismiss();
    },
    [dismiss],
  );

  const contextValue = useMemo<RecipeDetailDialogContextValue>(
    () => ({ close: dismiss }),
    [dismiss],
  );

  return (
    <dialog
      ref={dialogRef}
      className="recipe-detail-dialog"
      data-closing={isClosing ? "true" : undefined}
      aria-label={ariaLabel}
      onClick={onDialogClick}
    >
      <div className="recipe-detail-dialog-surface">
        <RecipeDetailDialogContext.Provider value={contextValue}>
          {children}
        </RecipeDetailDialogContext.Provider>
      </div>
    </dialog>
  );
}
