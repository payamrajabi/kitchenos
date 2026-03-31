"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useState } from "react";

type Mode = "signin" | "signup";

export function AuthModal({
  open,
  mode,
  onClose,
  onModeChange,
}: {
  open: boolean;
  mode: Mode;
  onClose: () => void;
  onModeChange: (m: Mode) => void;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setMessage("");
      const form = e.currentTarget;
      const email = (form.elements.namedItem("email") as HTMLInputElement)
        .value;
      const password = (form.elements.namedItem("password") as HTMLInputElement)
        .value;
      const supabase = createClient();
      setPending(true);
      try {
        if (mode === "signin") {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          setMessage("Signed in.");
          onClose();
        } else {
          const { data, error } = await supabase.auth.signUp({ email, password });
          if (error) throw error;
          if (data?.session) {
            setMessage("Signed in — your account is ready.");
            onClose();
          } else {
            setMessage(
              "Account created — open the confirmation link in your email, then sign in.",
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setMessage(
          mode === "signin" ? `Sign-in failed: ${msg}` : `Sign-up failed: ${msg}`,
        );
      } finally {
        setPending(false);
      }
    },
    [mode, onClose],
  );

  if (!open) return null;

  return (
    <div
      id="authModal"
      className="modal open"
      aria-hidden="false"
      role="presentation"
    >
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close sign in"
        onClick={onClose}
      />
      <div
        className="modal-card modal-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="authModalTitle"
      >
        <button
          className="modal-close icon-ghost"
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          <i className="ph ph-x" aria-hidden="true" />
        </button>
        <div className="modal-body modal-body-single auth-modal-body">
          <h2 id="authModalTitle" className="auth-modal-title">
            {mode === "signin" ? "Sign in" : "Sign up"}
          </h2>
          <div className="auth-mode-tabs" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              className={`auth-tab${mode === "signin" ? " active" : ""}`}
              aria-selected={mode === "signin"}
              onClick={() => onModeChange("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              className={`auth-tab${mode === "signup" ? " active" : ""}`}
              aria-selected={mode === "signup"}
              onClick={() => onModeChange("signup")}
            >
              Sign up
            </button>
          </div>
          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            <label className="auth-field">
              Email
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="you@example.com"
                required
              />
            </label>
            <label className="auth-field">
              Password
              <input
                type="password"
                name="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </label>
            <p className="auth-modal-message" role="status">
              {message}
            </p>
            <button type="submit" className="primary auth-submit" disabled={pending}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
