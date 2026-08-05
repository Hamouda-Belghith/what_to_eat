-- Migration incrémentale pour ajouter l'isolation par utilisateur
-- sur une base déjà existante (tables créées par 0001_init.sql).

create extension if not exists "pgcrypto";

-- 1) Ajouter les colonnes user_id si elles n'existent pas.
alter table ingredients add column if not exists user_id uuid;
alter table dishes add column if not exists user_id uuid;
alter table meal_cycles add column if not exists user_id uuid;
alter table planned_meals add column if not exists user_id uuid;
alter table shopping_list_items add column if not exists user_id uuid;

-- 2) Conserver les lignes déjà présentes comme données héritées.
-- Elles restent visibles tant qu'elles n'ont pas encore été réécrites
-- avec un user_id réel. Les nouvelles écritures sauvegarderont le user_id.

-- 3) Ajouter les index utiles.
create unique index if not exists idx_ingredients_user_id_name on ingredients (user_id, name);
create unique index if not exists idx_planned_meals_user_date_slot on planned_meals (user_id, date, meal_slot);
create unique index if not exists idx_shopping_list_items_user_ingredient_period on shopping_list_items (user_id, ingredient_id, period_start, period_end);

-- 4) RLS plus restrictif : un utilisateur voit seulement ses propres lignes.
-- Pour les tables sans colonne user_id (dish_ingredients, meal_cycle_entries),
-- on relie via la table parente (dishes / meal_cycles).

drop policy if exists "authenticated_full_access" on ingredients;
drop policy if exists "authenticated_full_access" on dishes;
drop policy if exists "authenticated_full_access" on dish_ingredients;
drop policy if exists "authenticated_full_access" on meal_cycles;
drop policy if exists "authenticated_full_access" on meal_cycle_entries;
drop policy if exists "authenticated_full_access" on planned_meals;
drop policy if exists "authenticated_full_access" on shopping_list_items;

create policy "authenticated_full_access" on ingredients
  for all
  using (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()))
  with check (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));

create policy "authenticated_full_access" on dishes
  for all
  using (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()))
  with check (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));

create policy "authenticated_full_access" on dish_ingredients
  for all
  using (
    auth.role() = 'authenticated' and exists (
      select 1
      from dishes d
      where d.id = dish_ingredients.dish_id
        and (d.user_id is null or d.user_id = auth.uid())
    )
  )
  with check (
    auth.role() = 'authenticated' and exists (
      select 1
      from dishes d
      where d.id = dish_ingredients.dish_id
        and (d.user_id is null or d.user_id = auth.uid())
    )
  );

create policy "authenticated_full_access" on meal_cycles
  for all
  using (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()))
  with check (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));

create policy "authenticated_full_access" on meal_cycle_entries
  for all
  using (
    auth.role() = 'authenticated' and exists (
      select 1
      from meal_cycles mc
      where mc.id = meal_cycle_entries.meal_cycle_id
        and (mc.user_id is null or mc.user_id = auth.uid())
    )
  )
  with check (
    auth.role() = 'authenticated' and exists (
      select 1
      from meal_cycles mc
      where mc.id = meal_cycle_entries.meal_cycle_id
        and (mc.user_id is null or mc.user_id = auth.uid())
    )
  );

create policy "authenticated_full_access" on planned_meals
  for all
  using (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()))
  with check (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));

create policy "authenticated_full_access" on shopping_list_items
  for all
  using (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()))
  with check (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));
