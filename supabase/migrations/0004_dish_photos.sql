-- Photo de plat : URL publique stockée sur le plat, fichier dans un
-- bucket Supabase Storage dédié. En mode démo (sans Supabase), la
-- photo est stockée en base64 directement dans localStorage.
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
