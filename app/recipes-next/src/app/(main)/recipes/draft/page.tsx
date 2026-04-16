import { RecipeDraftReview } from "@/components/recipe-draft-review";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review Imported Recipe",
};

export default function RecipeDraftPage() {
  return <RecipeDraftReview />;
}
