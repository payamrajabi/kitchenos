#!/usr/bin/env node
/**
 * Compare expected public-schema columns (from supabase_*.sql in this folder)
 * to a live snapshot from Supabase.
 *
 * schema.sql is SQLite-only — it is ignored here.
 *
 * Export snapshot from Supabase SQL editor (or MCP):
 *
 *   select json_agg(x order by table_name, column_name) as columns
 *   from (
 *     select table_name, column_name
 *     from information_schema.columns
 *     where table_schema = 'public'
 *   ) x;
 *
 * Save the JSON array as db-columns.json (array of { table_name, column_name }).
 *
 * Usage:
 *   node drift_check.mjs
 *   node drift_check.mjs ./db-columns.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const KEY = (t, c) => `${t}.${c}`;

function loadSqlFiles() {
  const dir = __dirname;
  return fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith("supabase") &&
        f.endsWith(".sql") &&
        f !== "supabase_fix_identity.sql",
    )
    .map((f) => path.join(dir, f));
}

/**
 * Parse add column if not exists from migrations.
 * Handles multiple columns in one ALTER (comma-separated).
 */
function extractAddedColumns(sql, fileLabel) {
  const found = new Map();
  const alterRe =
    /alter\s+table\s+public\.(\w+)\s+([\s\S]*?);/gi;
  let m;
  while ((m = alterRe.exec(sql)) !== null) {
    const table = m[1];
    const block = m[2];
    const addRe =
      /add\s+column\s+if\s+not\s+exists\s+(\w+)/gi;
    let am;
    while ((am = addRe.exec(block)) !== null) {
      found.set(KEY(table, am[1]), { table, column: am[1], file: fileLabel });
    }
  }
  return found;
}

/** create table if not exists public.name — column names on following lines */
function extractCreateTableColumns(sql, fileLabel) {
  const found = new Map();
  const lines = sql.split(/\r?\n/);
  let inCreate = null;
  for (const line of lines) {
    const ct = /^create\s+table\s+if\s+not\s+exists\s+public\.(\w+)\s*\(/i.exec(
      line,
    );
    if (ct) {
      inCreate = ct[1];
      continue;
    }
    if (inCreate && /^\)\s*;?\s*$/.test(line.trim())) {
      inCreate = null;
      continue;
    }
    if (!inCreate) continue;
    const col = /^\s*(\w+)\s+/i.exec(line);
    if (
      col &&
      !["primary", "unique", "foreign", "constraint", "check"].includes(
        col[1].toLowerCase(),
      )
    ) {
      const cname = col[1];
      if (cname.toLowerCase() === "on") continue;
      found.set(KEY(inCreate, cname), {
        table: inCreate,
        column: cname,
        file: fileLabel,
      });
    }
  }
  return found;
}

function main() {
  const files = loadSqlFiles();
  let expected = new Map();

  for (const file of files) {
    const base = path.basename(file);
    const sql = fs.readFileSync(file, "utf8");
    for (const [k, v] of extractCreateTableColumns(sql, base)) {
      expected.set(k, v);
    }
    for (const [k, v] of extractAddedColumns(sql, base)) {
      expected.set(k, v);
    }
  }

  // Parser gaps: nested CHECK(…) breaks line-based CREATE parse; DO blocks omit ADD COLUMN.
  const PARSER_PATCH = [
    ["inventory_items", "quantity"],
    ["inventory_items", "unit"],
    ["inventory_items", "notes"],
    ["inventory_items", "created_at"],
    ["inventory_items", "updated_at"],
    ["recipe_ingredients", "id"],
  ];
  for (const [t, c] of PARSER_PATCH) {
    expected.set(KEY(t, c), { table: t, column: c, file: "(parser patch)" });
  }

  const snapshotPath = process.argv[2];
  console.log(
    `Expected column keys from repo (supabase_*.sql): ${expected.size}\n`,
  );

  if (!snapshotPath) {
    console.log(
      "Pass a JSON snapshot file to diff, e.g. node drift_check.mjs ./db-columns.json",
    );
    console.log("\nFirst 40 keys:");
    [...expected.keys()].sort().slice(0, 40).forEach((k) => console.log(" ", k));
    if (expected.size > 40) console.log(`  ... and ${expected.size - 40} more`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const rows = Array.isArray(raw) ? raw : raw.columns ?? raw;
  const actual = new Set();
  for (const row of rows) {
    const t = row.table_name ?? row.table;
    const c = row.column_name ?? row.column;
    if (t && c) actual.add(KEY(t, c));
  }

  const missing = [...expected.keys()].filter((k) => !actual.has(k)).sort();
  const extra = [...actual].filter((k) => !expected.has(k)).sort();

  console.log("--- Drift vs snapshot ---");
  console.log(`Missing in DB (${missing.length}):`);
  missing.forEach((k) => {
    const meta = expected.get(k);
    console.log(`  - ${k}  (from ${meta?.file ?? "?"})`);
  });
  console.log(`\nExtra in DB not parsed from migrations (${extra.length}) — often OK:`);
  extra.slice(0, 60).forEach((k) => console.log(`  + ${k}`));
  if (extra.length > 60) console.log(`  ... and ${extra.length - 60} more`);

  if (missing.length === 0) {
    console.log("\nNo missing columns vs parsed migrations.");
  }
}

main();
