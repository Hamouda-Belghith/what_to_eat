-- Réorganisation de la liste de courses (écran /courses) :
-- - "dishes" reste lié à une période (généré depuis le planning sur une
--   durée choisie) — inchangé.
-- - "extra" (courses supplémentaires) et "final" (liste "à acheter")
--   deviennent des listes continues, sans période : on y ajoute/exporte
--   au fil de l'eau, et on les vide manuellement (bouton "Vider" pour
--   la liste finale) plutôt que de les regénérer par période.
alter table shopping_list_items alter column period_start drop not null;
alter table shopping_list_items alter column period_end drop not null;

-- `origin_section` (0009) servait à remplacer sélectivement les lignes
-- exportées d'une section donnée. Le nouveau comportement d'export
-- fusionne simplement les quantités dans la liste finale (le bouton
-- "Vider" est désormais l'unique façon de la remettre à zéro) : cette
-- colonne n'a plus d'usage.
alter table shopping_list_items drop constraint if exists shopping_list_items_origin_check;
alter table shopping_list_items drop column if exists origin_section;
