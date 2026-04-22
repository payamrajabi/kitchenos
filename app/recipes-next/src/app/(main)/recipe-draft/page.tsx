import { RecipeDraftReview } from "@/components/recipe-draft-review";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review Imported Recipe",
};

// This page deliberately lives outside `/recipes/*` so the recipe-detail
// modal interceptor (@modal/(.)recipes/[id]) doesn't catch soft navigations
// to it. When `draft` was a child of `/recipes/`, the interceptor saw the
// `draft` segment as a dynamic `[id]`, bailed out, and left the underlying
// page frozen on the recipes grid — so clicking a draft card did nothing
// until the user manually refreshed.
export default function RecipeDraftPage() {
  return <RecipeDraftReview />;
}
