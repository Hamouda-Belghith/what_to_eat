-- Ajoute la collation comme créneau de repas, entre le déjeuner et le
-- dîner. `meal_slot_type` est utilisé par `planned_meals` et
-- `meal_cycle_entries` : les deux colonnes acceptent donc la nouvelle
-- valeur sans autre modification.
alter type meal_slot_type add value if not exists 'snack' before 'dinner';
