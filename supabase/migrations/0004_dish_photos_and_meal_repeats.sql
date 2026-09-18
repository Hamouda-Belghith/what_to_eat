-- 1) Photo de plat : URL publique stockée sur le plat, fichier dans un
--    bucket Supabase Storage dédié. En mode démo (sans Supabase), la
--    photo est stockée en base64 directement dans localStorage.
alter table dishes add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', true)
on conflict (id) do nothing;

drop policy if exists "dish_photos_read" on storage.objects;
drop policy if exists "dish_photos_write" on storage.objects;
drop policy if exists "dish_photos_update" on storage.objects;
drop policy if exists "dish_photos_delete" on storage.objects;

-- Lecture publique (les photos affichées dans l'app n'ont pas besoin
-- d'être protégées : usage privé, pas de donnée sensible).
create policy "dish_photos_read" on storage.objects
  for select using (bucket_id = 'dish-photos');

-- Écriture réservée aux utilisateurs authentifiés, dans leur propre
-- dossier (premier segment du chemin = leur user id), cohérent avec le
-- reste du schéma (voir 0002_user_scoping.sql).
create policy "dish_photos_write" on storage.objects
  for insert with check (
    bucket_id = 'dish-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dish_photos_update" on storage.objects
  for update using (
    bucket_id = 'dish-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dish_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'dish-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2) Répétition légère par repas (en plus du motif hebdomadaire global
--    de meal_cycles) : depuis une case du planning, un repas peut se
--    répéter chaque semaine pour un nombre de semaines donné, ou
--    indéfiniment (weeks_total null). Contrairement au motif global,
--    modifier une occurrence ne touche que cette case (pas de scope
--    "cette semaine / toutes les semaines futures" à choisir).
create table if not exists meal_repeats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  meal_slot meal_slot_type not null,
  dish_id uuid not null references dishes(id) on delete restrict,
  start_date date not null,
  weeks_total integer,
  created_at timestamptz not null default now(),
  constraint meal_repeats_weeks_total_positive
    check (weeks_total is null or weeks_total > 0)
);

alter table planned_meals
  add column if not exists meal_repeat_id uuid references meal_repeats(id) on delete set null;

alter table meal_repeats enable row level security;

drop policy if exists "authenticated_full_access" on meal_repeats;
create policy "authenticated_full_access" on meal_repeats
  for all
  using (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()))
  with check (auth.role() = 'authenticated' and (user_id is null or user_id = auth.uid()));
