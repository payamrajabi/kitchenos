import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { macroCaloriesFromPerson, pieDiameterForTarget } from "@/lib/people-macros";
import { PersonMacroPie } from "@/components/person-macro-pie";
import type { PersonRow } from "@/types/database";
import type { CSSProperties } from "react";
import Link from "next/link";

/** Largest pie should nearly fill one grid cell at four columns (~300px); smallest stays readable. */
const PIE_MIN_PX = 140;
const PIE_MAX_PX = 300;

export default async function PeoplePage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="grid people-view is-empty">
        <p>Configure Supabase in <code>.env.local</code>.</p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="grid people-view is-empty">
        <div className="empty-state">
          <p className="empty-state-message">Sign in to see people profiles.</p>
        </div>
      </section>
    );
  }

  const { data: rows, error } = await supabase.from("people").select("*");

  if (error) {
    return (
      <section className="grid people-view is-empty">
        <p>{error.message}</p>
      </section>
    );
  }

  const people = (rows ?? []) as PersonRow[];

  if (!people.length) {
    return (
      <section className="grid people-view is-empty">
        <div className="empty-state">
          <p className="empty-state-message">
            No profiles yet. Add people in the classic UI (or your database), then open them here to edit.
          </p>
        </div>
      </section>
    );
  }

  const rowsWithMacros = people.map((person) => ({
    person,
    macros: macroCaloriesFromPerson(person),
  }));

  rowsWithMacros.sort((a, b) => {
    const ta = a.macros?.targetCalories ?? -1;
    const tb = b.macros?.targetCalories ?? -1;
    if (tb !== ta) return tb - ta;
    return (a.person.name || "").localeCompare(b.person.name || "", undefined, {
      sensitivity: "base",
    });
  });

  const targets = rowsWithMacros
    .map((r) => r.macros?.targetCalories)
    .filter((n): n is number => n != null);
  const maxTarget = targets.length ? Math.max(...targets) : 1;

  return (
    <section className="grid people-view people-view--charts-only">
      <div className="people-card-grid">
        {rowsWithMacros.map(({ person, macros }) => {
          const name = person.name || "Unnamed";
          const diameter = macros
            ? pieDiameterForTarget(macros.targetCalories, maxTarget, PIE_MIN_PX, PIE_MAX_PX)
            : PIE_MIN_PX;

          return (
            <Link
              key={person.id}
              href={`/people/${person.id}`}
              className="people-card-link"
              aria-label={
                macros
                  ? `${name}, macro mix pie chart, ${macros.targetCalories} calories per day target`
                  : `${name}, open profile`
              }
            >
              <article
                className="people-card"
                style={{ "--pie-d": `${diameter}px` } as CSSProperties}
              >
                <div className="people-card-pie">
                  {macros ? (
                    <PersonMacroPie name={name} macros={macros} />
                  ) : (
                    <div className="people-card-pie-placeholder" aria-hidden />
                  )}
                </div>
                <h3 className="people-card-name">{name}</h3>
              </article>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
