-- Trois contraintes unique héritées d'avant le passage aux données par
-- compte (migration 0002_user_scoping.sql) n'ont jamais été retirées.
-- Elles ignorent `user_id` alors qu'un index/contrainte équivalent
-- scopé par utilisateur existe déjà à côté, et bloquent silencieusement
-- des opérations légitimes dès que deux comptes (ou de nouvelles
-- sections de la liste de courses) touchent la même clé "globale" :
--
-- - planned_meals_date_meal_slot_key (date, meal_slot) : bloque la
--   planification d'un repas dès qu'un AUTRE compte a déjà un repas ce
--   jour-là sur ce créneau (idx_planned_meals_user_date_slot, scopé par
--   user_id, suffit déjà).
-- - ingredients_name_key (name) : bloque la création d'un ingrédient
--   dès qu'un AUTRE compte a déjà un ingrédient de ce nom
--   (idx_ingredients_user_id_name suffit déjà).
-- - shopping_list_items_ingredient_id_period_start_period_end_key
--   (ingredient_id, period_start, period_end) : ignore aussi l'unité et
--   la section — bloque le bouton "Exporter" (0009) dès qu'un article
--   existe déjà dans une autre section de la même période
--   (idx_shopping_list_items_user_ingredient_unit_period_section, ajouté
--   en 0009, suffit déjà).
--
-- Confirmé en reproduisant les trois échecs directement sur la base de
-- production avant ce correctif (voir .ia/decisions.md, 2026-09-22).
alter table planned_meals drop constraint if exists planned_meals_date_meal_slot_key;
alter table ingredients drop constraint if exists ingredients_name_key;
alter table shopping_list_items
  drop constraint if exists shopping_list_items_ingredient_id_period_start_period_end_key;
