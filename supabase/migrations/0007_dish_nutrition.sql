-- Apports nutritionnels d'un plat (pour une portion), optionnels.
-- `null` = non renseigné, distinct de 0 : le planning s'en sert pour
-- signaler qu'une somme est incomplète.
alter table dishes add column if not exists calories integer check (calories >= 0);
alter table dishes add column if not exists protein_g numeric(6, 1) check (protein_g >= 0);
