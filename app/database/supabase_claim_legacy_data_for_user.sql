-- Claim all legacy KitchenOS rows (owner_id IS NULL) and mirror global equipment toggles
-- into user_equipment for one account.
--
-- When to use:
--   After kitchenos v2 migration, data that existed under "open" RLS often has
--   owner_id NULL. Authenticated users only see rows where owner_id = auth.uid().
--
-- Prerequisite:
--   The account must already exist (Authentication → Users). Sign in once if needed.
--
-- How to run:
--   Supabase Dashboard → SQL Editor → paste → Run (as postgres).
--
-- Edit the email below if needed.

-- ---------------------------------------------------------------------------
-- 1) Assign every legacy owner-scoped row to this user
-- ---------------------------------------------------------------------------
do $$
declare
  target uuid;
  n bigint;
begin
  begin
    select id into strict target
    from auth.users
    where lower(trim(email)) = lower(trim('payam.rajabi@gmail.com'))
    limit 1;
  exception
    when no_data_found then
      raise exception
        'No auth.users row for that email. Create the account (sign up) first, then re-run.';
    when too_many_rows then
      raise exception 'Multiple auth users matched that email; resolve duplicates first.';
  end;

  update public.recipes set owner_id = target where owner_id is null;
  get diagnostics n = row_count;
  raise notice 'recipes: claimed % rows', n;

  update public.ingredients set owner_id = target where owner_id is null;
  get diagnostics n = row_count;
  raise notice 'ingredients: claimed % rows', n;

  update public.shopping_items set owner_id = target where owner_id is null;
  get diagnostics n = row_count;
  raise notice 'shopping_items: claimed % rows', n;

  update public.people set owner_id = target where owner_id is null;
  get diagnostics n = row_count;
  raise notice 'people: claimed % rows', n;

  if to_regclass('public.inventory_items') is not null then
    update public.inventory_items set owner_id = target where owner_id is null;
    get diagnostics n = row_count;
    raise notice 'inventory_items: claimed % rows', n;
  end if;

  if to_regclass('public.meal_plans') is not null then
    update public.meal_plans set owner_id = target where owner_id is null;
    get diagnostics n = row_count;
    raise notice 'meal_plans: claimed % rows', n;
  end if;
end $$;

-- recipe_ingredients has no owner_id; visibility follows recipe + ingredient ownership.

-- ---------------------------------------------------------------------------
-- 2) Copy equipment.has_item (pre–per-user model) into user_equipment
--    The insert trigger normally forces user_id := auth.uid(), which is NULL in
--    the SQL editor — disable it for this backfill only.
-- ---------------------------------------------------------------------------
do $$
declare
  target uuid;
begin
  select id into strict target
  from auth.users
  where lower(trim(email)) = lower(trim('payam.rajabi@gmail.com'))
  limit 1;

  if to_regclass('public.user_equipment') is null then
    raise notice 'user_equipment missing — run supabase_migration_kitchenos_v2.sql first.';
    return;
  end if;

  alter table public.user_equipment disable trigger kitchenos_user_equipment_uid;

  begin
    insert into public.user_equipment (user_id, equipment_id, has_item, updated_at)
    select target, e.id, e.has_item, now()
    from public.equipment e
    on conflict (user_id, equipment_id) do update
    set
      has_item = excluded.has_item,
      updated_at = excluded.updated_at;
  exception
    when others then
      alter table public.user_equipment enable trigger kitchenos_user_equipment_uid;
      raise;
  end;

  alter table public.user_equipment enable trigger kitchenos_user_equipment_uid;
exception
  when no_data_found then
    raise exception 'No auth user for that email (sign up first).';
  when too_many_rows then
    raise exception 'Multiple auth users matched that email.';
end $$;
