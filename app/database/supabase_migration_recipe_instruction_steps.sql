-- Recipe instruction steps (ordered lines, replaces monolithic recipes.instructions for editing).
-- Run in Supabase SQL Editor as role postgres on the Primary database.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_instruction_steps (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references public.recipes (id) on delete cascade,
  sort_order integer not null default 0,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists recipe_instruction_steps_recipe_sort
  on public.recipe_instruction_steps (recipe_id, sort_order);

comment on table public.recipe_instruction_steps is 'Ordered recipe method steps; legacy text lives in recipes.instructions until migrated.';

-- ---------------------------------------------------------------------------
-- RLS (recipe ownership, same pattern as recipe_ingredients)
-- ---------------------------------------------------------------------------
alter table public.recipe_instruction_steps enable row level security;

drop policy if exists "ris_steps_select" on public.recipe_instruction_steps;
create policy "ris_steps_select" on public.recipe_instruction_steps for select to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_instruction_steps.recipe_id
        and r.owner_id = auth.uid ()
    )
  );

drop policy if exists "ris_steps_insert" on public.recipe_instruction_steps;
create policy "ris_steps_insert" on public.recipe_instruction_steps for insert to authenticated
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_instruction_steps.recipe_id
        and r.owner_id = auth.uid ()
    )
  );

drop policy if exists "ris_steps_update" on public.recipe_instruction_steps;
create policy "ris_steps_update" on public.recipe_instruction_steps for update to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_instruction_steps.recipe_id
        and r.owner_id = auth.uid ()
    )
  )
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_instruction_steps.recipe_id
        and r.owner_id = auth.uid ()
    )
  );

drop policy if exists "ris_steps_delete" on public.recipe_instruction_steps;
create policy "ris_steps_delete" on public.recipe_instruction_steps for delete to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_instruction_steps.recipe_id
        and r.owner_id = auth.uid ()
    )
  );

-- ---------------------------------------------------------------------------
-- Community: read steps for published recipes
-- ---------------------------------------------------------------------------
drop policy if exists "ris_steps_select_community" on public.recipe_instruction_steps;
create policy "ris_steps_select_community" on public.recipe_instruction_steps for select to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_instruction_steps.recipe_id
        and r.is_published_to_community = true
    )
  );
