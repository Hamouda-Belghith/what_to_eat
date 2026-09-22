-- Repas planifié "spécial" : quelque chose qu'on peut choisir sur une
-- case du planning à la place d'un plat (ex. "Manger dehors"). Reste
-- distinct d'une case explicitement vidée (dish_id et special tous
-- deux null, voir 0005_nullable_planned_meal_dish.sql) : une case
-- spéciale a dish_id null MAIS special renseigné, et reste donc
-- affichée (fetchPlannedMeals ne la filtre pas).
--
-- Liste fermée pour l'instant (une seule valeur) ; ajouter une valeur
-- future = étendre la contrainte dans une nouvelle migration.
alter table planned_meals add column if not exists special text;
alter table planned_meals add constraint planned_meals_special_check
  check (special is null or special in ('eating_out'));

-- Un repas planifié a soit un plat, soit un repas spécial, jamais les
-- deux (une case vidée a les deux à null).
alter table planned_meals add constraint planned_meals_dish_xor_special_check
  check (dish_id is null or special is null);
