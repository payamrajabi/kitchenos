#!/usr/bin/env node
/**
 * Writes supabase-config.local.js for production builds (e.g. Vercel).
 * Set SUPABASE_URL and SUPABASE_ANON_KEY in the Vercel project → Settings → Environment Variables.
 */
const fs = require("fs");
const path = require("path");

const outPath = path.join(__dirname, "..", "supabase-config.local.js");
const url = process.env.SUPABASE_URL || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";
const onVercel = process.env.VERCEL === "1";

if (!url || !anonKey) {
  if (onVercel) {
    console.error(
      "Vercel build: set SUPABASE_URL and SUPABASE_ANON_KEY in Project → Settings → Environment Variables."
    );
    process.exit(1);
  }
  console.log(
    "Skipping supabase-config.local.js (no SUPABASE_URL / SUPABASE_ANON_KEY). Use write_supabase_local.py or copy the example for local dev."
  );
  process.exit(0);
}

const supabaseConfig = {
  url,
  anonKey,
  bucket: process.env.SUPABASE_STORAGE_BUCKET || "recipe-images",
};

const openaiConfig = {
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
};

const content = `// Generated at build time — do not commit. See scripts/write-config-from-env.js
window.SUPABASE_CONFIG = ${JSON.stringify(supabaseConfig, null, 2)};
window.OPENAI_CONFIG = ${JSON.stringify(openaiConfig, null, 2)};
`;

fs.writeFileSync(outPath, content, "utf8");
console.log("Wrote supabase-config.local.js for deploy.");
