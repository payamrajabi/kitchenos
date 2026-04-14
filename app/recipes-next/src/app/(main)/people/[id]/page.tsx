import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { PersonMacroPie } from "@/components/person-macro-pie";
import { PersonDetailForm } from "@/components/person-detail-form";
import { macroCaloriesFromPerson } from "@/lib/people-macros";
import type { PersonRow } from "@/types/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return { title: "Person" };
  }
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("name").eq("id", id).maybeSingle();
  const row = data as { name: string } | null;
  if (!row?.name) return { title: "Person" };
  return { title: row.name, description: `Profile: ${row.name}` };
}

export default async function PersonDetailPage({ params }: Props) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <section className="grid people-view is-empty">
        <p>Configure Supabase in <code>.env.local</code>.</p>
      </section>
    );
  }

  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="grid people-view is-empty">
        <div className="empty-state">
          <p className="empty-state-message">Sign in to edit this profile.</p>
        </div>
      </section>
    );
  }

  const { data: row, error } = await supabase
    .from("people")
    .select("*")
    .eq("id", numId)
    .maybeSingle();

  if (error) {
    return (
      <section className="grid people-view is-empty">
        <p>{error.message}</p>
      </section>
    );
  }

  if (!row) {
    notFound();
  }

  const person = row as PersonRow;
  const displayName = person.name || "Unnamed";
  const macros = macroCaloriesFromPerson(person);

  return (
    <section className="grid people-view person-detail-page">
      <div className="person-detail-layout">
        <PersonDetailForm
          key={`${person.id}-${person.updated_at ?? person.created_at ?? ""}`}
          person={person}
        />
        <aside className="person-detail-macro-aside" aria-label="Macro mix">
          <div className="person-detail-macro-pie-wrap">
            {macros ? (
              <PersonMacroPie name={displayName} macros={macros} />
            ) : (
              <div className="person-detail-macro-pie-placeholder" aria-hidden />
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
