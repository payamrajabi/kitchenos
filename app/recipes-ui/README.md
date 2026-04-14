# Recipes UI

Browser UI for KitchenOS backed by **Supabase** (Postgres + Auth + optional Storage).

## 1) Supabase setup

1. Run `app/database/supabase_setup.sql` in the SQL editor (initial tables + legacy policies).
2. Run `app/database/supabase_migration_kitchenos_v2.sql` for per-user RLS, `inventory_items`, `user_equipment`, `meal_plans`, and meal-plan entries.
3. Enable **Email** authentication in the Supabase dashboard.
4. **Google OAuth (optional but recommended):**
   - In [Google Cloud Console](https://console.cloud.google.com/), create an OAuth **Web client** and set the authorized redirect URI to your Supabase callback: `https://<project-ref>.supabase.co/auth/v1/callback` (shown under **Authentication → Providers → Google** in the Supabase dashboard).
   - In Supabase: **Authentication → Providers → Google** — paste the Google **Client ID** and **Client secret**, enable the provider.
   - **Authentication → URL configuration**: set **Site URL** to your primary app URL (e.g. `http://localhost:8000` for local dev). Under **Redirect URLs**, add every origin you use (e.g. `http://localhost:8000/**`, and your production URL). OAuth will not work when opening the UI as a `file://` page; use a local HTTP server as described in “Run a local server” below.
5. Deploy the Edge Function `openai-kitchen` (see `supabase/functions/openai-kitchen/`) and set the secret `OPENAI_API_KEY` for AI meal plans.

## 2) Configure the web app

**Fastest (Supabase CLI):** from `app/recipes-ui/`:

```bash
supabase login
python3 write_supabase_local.py
```

The script reads `project_id` from `supabase/config.toml`, calls `supabase projects api-keys`, and writes gitignored **`supabase-config.local.js`**. Reload the Recipes UI.

**Manual:** copy `supabase-config.local.example.js` to `supabase-config.local.js` and paste **Project URL** + **anon** key from **Project Settings → API**. Never put the **service_role** key in the browser.

`index.html` loads `supabase-config.js` then `supabase-config.local.js`. A **404** for `supabase-config.local.js` in the Network tab is normal until the file exists.

## 3) Run a local server

From the repo root:

```
python3 -m http.server 8000
```

## 4) Open in your browser

```
http://localhost:8000/app/recipes-ui/
```

Sign in with email/password (same Supabase project as iOS). The Plan tab loads `meal_plans` for the current week and can call the Edge Function for an AI-generated draft.
