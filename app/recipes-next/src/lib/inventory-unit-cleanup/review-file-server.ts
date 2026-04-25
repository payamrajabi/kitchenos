import "server-only";

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  generateApprovedUnitCleanupSql,
  renderReviewMarkdown,
  type UnitCleanupReviewFile,
} from "./recommendations";

const APP_ROOT = process.cwd();
const REVIEW_OUTPUT_DIR = path.join(APP_ROOT, "scripts", "output");
const SQL_OUTPUT_PATH = path.join(
  APP_ROOT,
  "..",
  "database",
  "supabase_migration_inventory_unit_cleanup.sql",
);

export type LoadedUnitCleanupReview = {
  fileName: string;
  markdownFileName: string;
  review: UnitCleanupReviewFile;
};

export async function loadLatestUnitCleanupReview(): Promise<
  LoadedUnitCleanupReview | { error: string }
> {
  let fileNames: string[];
  try {
    fileNames = await readdir(REVIEW_OUTPUT_DIR);
  } catch {
    return {
      error:
        "No review files found yet. Run the inventory unit cleanup recommendation script first.",
    };
  }

  const jsonFiles = fileNames
    .filter(
      (name) =>
        name.startsWith("inventory-unit-cleanup-review-") &&
        name.endsWith(".json"),
    )
    .sort()
    .reverse();

  if (jsonFiles.length === 0) {
    return {
      error:
        "No review JSON file found. Run the inventory unit cleanup recommendation script first.",
    };
  }

  const fileName = jsonFiles[0];
  const review = await readReviewFile(fileName);
  return {
    fileName,
    markdownFileName: fileName.replace(/\.json$/i, ".md"),
    review,
  };
}

export async function readReviewFile(
  fileName: string,
): Promise<UnitCleanupReviewFile> {
  const filePath = reviewFilePath(fileName);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as UnitCleanupReviewFile;
}

export async function saveReviewFile(
  fileName: string,
  review: UnitCleanupReviewFile,
): Promise<void> {
  const filePath = reviewFilePath(fileName);
  const markdownPath = filePath.replace(/\.json$/i, ".md");
  await writeFile(filePath, `${JSON.stringify(review, null, 2)}\n`);
  await writeFile(markdownPath, renderReviewMarkdown(review));
}

export async function writeApprovedUnitCleanupSql(
  review: UnitCleanupReviewFile,
): Promise<string> {
  const sql = generateApprovedUnitCleanupSql(review);
  await writeFile(SQL_OUTPUT_PATH, sql);
  return SQL_OUTPUT_PATH;
}

function reviewFilePath(fileName: string): string {
  const safeName = path.basename(fileName);
  if (
    safeName !== fileName ||
    !safeName.startsWith("inventory-unit-cleanup-review-") ||
    !safeName.endsWith(".json")
  ) {
    throw new Error("Invalid review file name.");
  }
  return path.join(REVIEW_OUTPUT_DIR, safeName);
}
