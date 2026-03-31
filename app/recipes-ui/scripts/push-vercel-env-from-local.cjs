#!/usr/bin/env node
/**
 * One-off helper: copy url + anonKey from supabase-config.local.js into Vercel env (production).
 * Requires: vercel CLI linked (app/recipes-ui/.vercel), logged in.
 * Usage: node scripts/push-vercel-env-from-local.cjs
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const localPath = path.join(root, "supabase-config.local.js");
const text = fs.readFileSync(localPath, "utf8");
const url = text.match(/url:\s*"([^"]+)"/)?.[1];
const anonKey = text.match(/anonKey:\s*"([^"]+)"/)?.[1];
if (!url || !anonKey) {
  console.error("Could not parse url/anonKey from supabase-config.local.js");
  process.exit(1);
}

function vercel(args) {
  execFileSync("vercel", ["--non-interactive", ...args], {
    stdio: "inherit",
    cwd: root,
  });
}

vercel(["env", "add", "SUPABASE_URL", "production", "--value", url, "--yes", "--force"]);
vercel([
  "env",
  "add",
  "SUPABASE_ANON_KEY",
  "production",
  "--sensitive",
  "--value",
  anonKey,
  "--yes",
  "--force",
]);
console.log("Vercel production env updated. Redeploy with: vercel --prod --yes");
