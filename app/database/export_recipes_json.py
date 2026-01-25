#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path


def main():
    db_path = Path(__file__).parent / "recipes.db"
    output_path = Path(__file__).parent / "recipes.json"

    if not db_path.exists():
        raise SystemExit(f"Missing database: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
          id,
          name,
          image_url,
          notes,
          ingredients,
          instructions,
          source_url,
          servings,
          prep_time_minutes,
          cook_time_minutes,
          total_time_minutes,
          calories,
          protein_grams,
          fat_grams,
          carbs_grams,
          created_at,
          updated_at
        FROM recipes
        ORDER BY name COLLATE NOCASE
        """
    )

    recipes = [dict(row) for row in cursor.fetchall()]
    conn.close()

    payload = {
        "generated_at": output_path.stat().st_mtime if output_path.exists() else None,
        "count": len(recipes),
        "recipes": recipes,
    }

    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(recipes)} recipes to {output_path}")


if __name__ == "__main__":
    main()
