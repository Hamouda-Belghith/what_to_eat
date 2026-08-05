-- Schema initial pour un projet Supabase neuf.
-- Pour une base déjà existante, utiliser la migration incrémentale
-- supabase/migrations/0002_user_scoping.sql à la place.
create extension if not exists "pgcrypto";

-- Repas de la journée
create type meal_slot_type as enum ('breakfast', 'lunch', 'dinner');

-- Ingrédients : référentiel unique, réutilisable entre plats
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  name text not null,
  default_unit text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Plats
create table dishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Association plat <-> ingrédients (table de liaison avec quantité)
create table dish_ingredients (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references dishes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity numeric not null,
  unit text not null,
  unique (dish_id, ingredient_id)
);

-- Motif de répétition du planning (au plus un par utilisateur).
-- Piloté depuis le Planning : répétition chaque semaine ou toutes les 2 semaines.
create table meal_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  name text not null,
  duration_days integer not null,
  start_date date not null,
  created_at timestamptz not null default now()
);

-- Positionnement des plats dans un cycle (jour relatif dans le cycle)
create table meal_cycle_entries (
  id uuid primary key default gen_random_uuid(),
  meal_cycle_id uuid not null references meal_cycles(id) on delete cascade,
  day_offset integer not null,
  meal_slot meal_slot_type not null,
  dish_id uuid not null references dishes(id) on delete restrict,
  unique (meal_cycle_id, day_offset, meal_slot)
);

-- Planning réel (jour calendaire précis, permet override ponctuel sans casser le cycle)
create table planned_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  meal_slot meal_slot_type not null,
  dish_id uuid not null references dishes(id) on delete restrict,
  meal_cycle_id uuid references meal_cycles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, date, meal_slot)
);

-- Statut d'achat des ingrédients (coché ou non lors des courses)
create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  quantity numeric not null,
  unit text not null,
  is_checked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, ingredient_id, period_start, period_end)
);

-- RLS : activé sur toutes les tables. Vu qu'il n'y a que 2 utilisateurs
-- de confiance partageant les mêmes données (pas de cloisonnement par
-- utilisateur), la policy autorise simplement tout utilisateur authentifié
-- à lire/écrire. C'est volontairement simple, cohérent avec l'usage privé.
alter table ingredients enable row level security;
alter table dishes enable row level security;
alter table dish_ingredients enable row level security;
alter table meal_cycles enable row level security;
alter table meal_cycle_entries enable row level security;
alter table planned_meals enable row level security;
alter table shopping_list_items enable row level security;

create policy "authenticated_full_access" on ingredients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on dishes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on dish_ingredients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on meal_cycles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on meal_cycle_entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on planned_meals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_full_access" on shopping_list_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
