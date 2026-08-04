import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";
import {
  fetchDemoMealCycles,
  fetchDemoPlannedMeals,
  setDemoPlannedMeal,
  clearDemoPlannedMeal,
  applyDemoCycleToRange,
  isDemoMode,
} from "@/lib/localDemo";
import { fetchMealCycles } from "@/features/cycles/api";
import { addDays, parseISODate, toISODate } from "@/lib/date";
import type { MealSlot } from "@/lib/supabase/database.types";
import type { PlannedMeal } from "./types";

type Result<T> = { data: T[] | null; error: PostgrestError | null };
type MutateResult = { error: PostgrestError | null };

interface PlannedMealRow {
  id: string;
  date: string;
  meal_slot: MealSlot;
  dish_id: string;
  meal_cycle_id: string | null;
  dishes?: { name: string } | null;
}

/**
 * Récupère les repas planifiés entre deux dates incluses.
 */
export async function fetchPlannedMeals(
  periodStart: string,
  periodEnd: string
): Promise<PlannedMeal[]> {
  if (isDemoMode()) {
    return fetchDemoPlannedMeals(periodStart, periodEnd);
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = (await supabase
    .from("planned_meals")
    .select("id, date, meal_slot, dish_id, meal_cycle_id, dishes(name)")
    .eq("user_id", userId)
    .gte("date", periodStart)
    .lte("date", periodEnd)) as Result<PlannedMealRow>;

  if (error || !data) {
    console.warn("Impossible de charger le planning", error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    date: row.date,
    mealSlot: row.meal_slot,
    dishId: row.dish_id,
    dishName: row.dishes?.name ?? "",
    mealCycleId: row.meal_cycle_id,
  }));
}

export async function setPlannedMeal(
  date: string,
  mealSlot: MealSlot,
  dishId: string,
  mealCycleId: string | null = null
): Promise<void> {
  if (isDemoMode()) {
    await setDemoPlannedMeal(date, mealSlot, dishId, mealCycleId);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  // Upsert : si un plat est déjà prévu à ce créneau, il est remplacé
  // (contrainte unique (date, meal_slot)).
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = (await supabase.from("planned_meals").upsert(
    {
      user_id: userId,
      date,
      meal_slot: mealSlot,
      dish_id: dishId,
      meal_cycle_id: mealCycleId,
    } as never,
    { onConflict: "user_id, date, meal_slot" } as never
  )) as MutateResult;

  if (error) {
    console.warn("Impossible d'enregistrer le repas", error);
    throw new Error("Enregistrement du repas impossible");
  }
}

export async function clearPlannedMeal(
  date: string,
  mealSlot: MealSlot
): Promise<void> {
  if (isDemoMode()) {
    await clearDemoPlannedMeal(date, mealSlot);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = (await supabase
    .from("planned_meals")
    .delete()
    .eq("user_id", userId)
    .eq("date", date)
    .eq("meal_slot", mealSlot)) as MutateResult;

  if (error) {
    console.warn("Impossible de retirer le repas", error);
    throw new Error("Suppression du repas impossible");
  }
}

/**
 * Génère les repas d'un cycle sur une plage de dates. Les cases déjà
 * remplies (override manuel) ne sont pas écrasées.
 */
export async function applyCycleToRange(
  cycleId: string,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  if (isDemoMode()) {
    await applyDemoCycleToRange(cycleId, periodStart, periodEnd);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const cycles = await fetchMealCycles();
  const cycle = cycles.find((c) => c.id === cycleId);
  if (!cycle) throw new Error("Cycle introuvable");

  const existing = await fetchPlannedMeals(periodStart, periodEnd);
  const existingKeys = new Set(
    existing.map((meal) => `${meal.date}-${meal.mealSlot}`)
  );

  const cycleEntriesByOffset = new Map(
    cycle.entries.map((e) => [`${e.dayOffset}-${e.mealSlot}`, e])
  );

  const cycleStart = parseISODate(cycle.startDate);
  const startDate = parseISODate(periodStart);
  const endDate = parseISODate(periodEnd);
  const inserts: Array<{
    date: string;
    meal_slot: MealSlot;
    dish_id: string;
    meal_cycle_id: string;
  }> = [];

  const msPerDay = 24 * 60 * 60 * 1000;
  let cursor = new Date(startDate);

  while (cursor <= endDate) {
    const diffDays = Math.round((cursor.getTime() - cycleStart.getTime()) / msPerDay);
    const cycleOffset = ((diffDays % cycle.durationDays) + cycle.durationDays) % cycle.durationDays;
    const dateStr = toISODate(cursor);

    for (const slot of ["breakfast", "lunch", "dinner"] as MealSlot[]) {
      const entry = cycleEntriesByOffset.get(`${cycleOffset}-${slot}`);
      if (!entry) continue;
      const key = `${dateStr}-${slot}`;
      if (!existingKeys.has(key)) {
        inserts.push({
          date: dateStr,
          meal_slot: slot,
          dish_id: entry.dishId,
          meal_cycle_id: cycleId,
        });
      }
    }

    cursor = addDays(cursor, 1);
  }

  if (inserts.length === 0) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = (await supabase
    .from("planned_meals")
    .insert(inserts.map((insert) => ({ ...insert, user_id: userId })) as never)) as MutateResult;

  if (error) {
    console.warn("Impossible de générer le planning depuis le cycle", error);
    throw new Error("Génération du planning impossible");
  }
}
