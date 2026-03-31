-- Fix: PostgREST cannot use expression indexes (owner_id, lower(name)) for
-- ON CONFLICT resolution.  Add a plain unique constraint that matches the
-- on_conflict=owner_id,name the app sends.
--
-- The existing expression index (ingredients_owner_name_lower) already prevents
-- case-variant duplicates for the same owner, so this constraint is safe to add
-- on top of it — it simply lets PostgREST find something it can target.
--
-- Run in Supabase SQL Editor.

-- Step 1: safety check — surface any exact (owner_id, name) dupes that would
-- block the constraint.  In practice there should be none because the
-- expression index already prevents them.
do $$
declare
  dupes int;
begin
  select count(*) into dupes
  from (
    select owner_id, name
    from public.ingredients
    group by owner_id, name
    having count(*) > 1
  ) t;

  if dupes > 0 then
    raise exception 'Found % duplicate (owner_id, name) pairs — resolve before adding constraint.', dupes;
  end if;
end;
$$;

-- Step 2: add the plain unique constraint.
alter table public.ingredients
  add constraint ingredients_owner_name_unique unique (owner_id, name);
