"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_DEBOUNCE_MS = 500;

type CommitResult = { ok: boolean } | void;

/**
 * Optimistic + debounced commit for "click-heavy" controls like the inventory
 * quantity pill or the meal-plan servings pill.
 *
 * - `value` is the server-truth prop coming from a server component.
 * - `update(next)` updates the displayed value immediately (optimistic) and
 *   schedules a debounced server commit.
 * - `flush()` sends the pending commit right now (useful for blur / unmount).
 *
 * While the user is actively clicking, external changes to `value` are
 * ignored so we don't fight the user's input. Once the commit settles and
 * the server data catches up, we resume tracking the prop.
 */
export function useDebouncedCommit<T>(options: {
  value: T;
  commit: (next: T) => Promise<CommitResult> | CommitResult;
  debounceMs?: number;
  equals?: (a: T, b: T) => boolean;
}) {
  const { value, commit, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const equals = options.equals ?? ((a: T, b: T) => a === b);

  const router = useRouter();
  const [, startRefreshTransition] = useTransition();

  const [local, setLocal] = useState<T>(value);
  const [pending, setPending] = useState(false);

  const dirtyRef = useRef(false);
  const latestTargetRef = useRef<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightIdRef = useRef(0);
  const commitRef = useRef(commit);
  const equalsRef = useRef(equals);
  const valueRef = useRef(value);

  // Keep latest-value refs in sync without touching them during render.
  // Writing to refs in the render body violates React's "refs during render"
  // rule, so we sync them in an effect that runs after every commit.
  useEffect(() => {
    commitRef.current = commit;
    equalsRef.current = equals;
    valueRef.current = value;
  });

  // Sync the server-truth `value` prop into our optimistic `local` state.
  // This is the classic "mirror prop into state" pattern: the effect is
  // acting as a subscription to an external source (the router/server
  // refresh that rewrites the prop). React 19's set-state-in-effect lint
  // is designed for the "you might not need an effect" case; here we truly
  // need it because the work is gated on a ref (dirtyRef) that is only
  // meaningful at effect time, not during render.
  useEffect(() => {
    if (dirtyRef.current) {
      if (equalsRef.current(latestTargetRef.current, value)) {
        dirtyRef.current = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocal(value);
      }
      return;
    }
    setLocal(value);
  }, [value]);

  const doCommit = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const target = latestTargetRef.current;
    const myId = ++inflightIdRef.current;
    setPending(true);

    Promise.resolve()
      .then(() => commitRef.current(target))
      .then((result) => {
        if (myId !== inflightIdRef.current) return;
        const ok = !result || (result as { ok?: boolean }).ok !== false;
        if (ok) {
          startRefreshTransition(() => router.refresh());
        } else {
          dirtyRef.current = false;
          setLocal(valueRef.current);
        }
      })
      .catch(() => {
        if (myId !== inflightIdRef.current) return;
        dirtyRef.current = false;
        setLocal(valueRef.current);
      })
      .finally(() => {
        if (myId === inflightIdRef.current) {
          setPending(false);
        }
      });
  }, [router]);

  const update = useCallback(
    (next: T) => {
      dirtyRef.current = true;
      latestTargetRef.current = next;
      setLocal(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        doCommit();
      }, debounceMs);
    },
    [debounceMs, doCommit],
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      doCommit();
    }
  }, [doCommit]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        if (dirtyRef.current) {
          try {
            void commitRef.current(latestTargetRef.current);
          } catch {
            // best-effort on unmount
          }
        }
      }
    };
  }, []);

  return { value: local, update, flush, pending };
}
