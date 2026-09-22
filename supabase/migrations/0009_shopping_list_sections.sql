-- La liste de courses se divise désormais en trois sections :
-- - "dishes"  : générée automatiquement depuis les plats planifiés
--               (comportement historique de generate_shopping_list).
-- - "extra"   : articles ajoutés à la main, hors plats.
-- - "final"   : la liste réellement utilisée au supermarché (cochable),
--               remplie par les boutons "Exporter" des deux sections
--               précédentes.
alter table shopping_list_items add column if not exists section text not null default 'dishes';
alter table shopping_list_items add constraint shopping_list_items_section_check
  check (section in ('dishes', 'extra', 'final'));

-- Pour une ligne de la section "final", indique de quelle section elle a
-- été exportée : permet à "Exporter" de ne remplacer que ses propres
-- lignes dans la liste finale, sans toucher à celles de l'autre section.
-- Toujours null en dehors de "final".
alter table shopping_list_items add column if not exists origin_section text;
alter table shopping_list_items add constraint shopping_list_items_origin_check
  check (
    (section = 'final' and origin_section in ('dishes', 'extra'))
    or (section <> 'final' and origin_section is null)
  );

-- L'ancien index unique (user_id, ingredient_id, period_start, period_end)
-- ne tenait compte ni de l'unité ni de la section. Il aurait empêché un
-- même ingrédient d'exister dans deux sections différentes sur la même
-- période (désormais nécessaire), et empêchait déjà en théorie un même
-- ingrédient dans deux unités différentes sur la même période (bug
-- préexistant, corrigé au passage puisque cet index est de toute façon
-- réécrit ici).
drop index if exists idx_shopping_list_items_user_ingredient_period;
create unique index if not exists idx_shopping_list_items_user_ingredient_unit_period_section
  on shopping_list_items (user_id, ingredient_id, unit, period_start, period_end, section);
