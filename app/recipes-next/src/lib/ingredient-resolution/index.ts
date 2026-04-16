export { resolveRecipeIngredients } from "./resolve-pipeline";
export type { PipelineDeps } from "./resolve-pipeline";
export { applyResolutionPlan } from "./apply-plan";
export { normalizeForMatch, cleanDisplayName, deterministicMatch, toTitleCaseAP } from "./normalize";
export type {
  InventoryIngredient,
  IngredientResolution,
  ResolutionPlan,
  AppliedIngredient,
  ApplyPlanResult,
  ExactMatchResolution,
  CreateVariantResolution,
  CreateSiblingVariantResolution,
  CreateStandaloneResolution,
} from "./types";
