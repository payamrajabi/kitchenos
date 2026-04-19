import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { macroCaloriesFromPerson } from "@/lib/people-macros";
import { PersonMacroPieCard } from "@/components/person-macro-pie-card";
import { PeopleAddFab } from "@/components/people-add-fab";
import type { PersonRow } from "@/types/database";

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
            No profiles yet. Tap the plus button to add your first person.
          </p>
        </div>
        <PeopleAddFab />
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

  return (
    <section className="grid people-view people-view--charts-only">
      <div className="people-card-grid">
        {rowsWithMacros.map(({ person, macros }) => (
          <PersonMacroPieCard
            key={person.id}
            personId={person.id}
            name={person.name || "Unnamed"}
            macros={macros}
          />
        ))}
      </div>
      <PeopleAddFab />
    </section>
  );
}
