-- Un seul motif de répétition par utilisateur.
-- Les cycles nommés multiples disparaissent au profit d'une
-- répétition pilotée depuis le Planning (1 ou 2 semaines).

-- Conserve le cycle le plus récent par user_id, supprime les autres.
delete from meal_cycles a
using meal_cycles b
where a.user_id is not distinct from b.user_id
  and a.created_at < b.created_at;

create unique index if not exists idx_meal_cycles_one_per_user
  on meal_cycles (user_id);
