import Link from "next/link";

export default function RecipeNotFound() {
  return (
    <section className="grid is-empty">
      <div className="empty-state">
        <p className="empty-state-message">Recipe not found.</p>
        <Link href="/recipes" className="primary">
          Back to recipes
        </Link>
      </div>
    </section>
  );
}
