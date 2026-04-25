"use server";

import { revalidatePath } from "next/cache";
import {
  saveReviewFile,
  writeApprovedUnitCleanupSql,
} from "@/lib/inventory-unit-cleanup/review-file-server";
import type { UnitCleanupReviewFile } from "@/lib/inventory-unit-cleanup/recommendations";

export async function saveUnitCleanupReviewAction(
  fileName: string,
  review: UnitCleanupReviewFile,
) {
  try {
    await saveReviewFile(fileName, review);
    revalidatePath("/admin/unit-cleanup");
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not save review file.",
    };
  }
}

export async function generateUnitCleanupSqlAction(
  fileName: string,
  review: UnitCleanupReviewFile,
) {
  try {
    await saveReviewFile(fileName, review);
    const outputPath = await writeApprovedUnitCleanupSql(review);
    revalidatePath("/admin/unit-cleanup");
    return { ok: true as const, outputPath };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not generate SQL.",
    };
  }
}
