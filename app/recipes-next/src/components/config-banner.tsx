import { isSupabaseConfigured } from "@/lib/env";

export function ConfigBanner() {
  if (isSupabaseConfigured()) return null;

  return (
    <div className="config-banner" role="alert">
      <p>
        <strong>Supabase env vars missing.</strong> In{" "}
        <code>app/recipes-next</code>, copy{" "}
        <code>.env.local.example</code> to <code>.env.local</code> and set{" "}
        <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> from your project&apos;s API
        settings. Never put the <code>service_role</code> key in{" "}
        <code>NEXT_PUBLIC_*</code> variables. Restart <code>npm run dev</code>{" "}
        after saving.
      </p>
    </div>
  );
}
