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
import { addDays, parseISODate, toISODate } from "@/lib/date";
import type { MealSlot } from "@/lib/supabase/database.types";
import type { MealCycle } from "@/features/cycles/types";
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

interface CycleRow {
  id: string;
  name: string;
  duration_days: number;
  start_date: string;
}

interface EntryRow {
  day_offset: number;
  meal_slot: MealSlot;
  dish_id: string;
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

async function fetchPatternById(cycleId: string): Promise<MealCycle | null> {
  if (isDemoMode()) {
    const cycles = await fetchDemoMealCycles();
    return cycles.find((c) => c.id === cycleId) ?? null;
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: cycles, error } = (await supabase
    .from("meal_cycles")
    .select("id, name, duration_days, start_date")
    .eq("id", cycleId)
    .limit(1)) as Result<CycleRow>;

  if (error || !cycles?.[0]) return null;

  const cycle = cycles[0];
  const { data: entries, error: entriesError } = (await supabase
    .from("meal_cycle_entries")
    .select("day_offset, meal_slot, dish_id")
    .eq("meal_cycle_id", cycle.id)) as Result<EntryRow>;

  if (entriesError || !entries) return null;

  return {
    id: cycle.id,
    name: cycle.name,
    durationDays: cycle.duration_days,
    startDate: cycle.start_date,
    entries: entries.map((e) => ({
      dayOffset: e.day_offset,
      mealSlot: e.meal_slot,
      dishId: e.dish_id,
    })),
  };
}

/**
 * Remplit les cases vides d'une plage depuis un motif de répétition.
 * Les overrides manuels (cases déjà remplies) ne sont pas écrasés.
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

  const cycle = await fetchPatternById(cycleId);
  if (!cycle) throw new Error("Motif de répétition introuvable");

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
    const diffDays = Math.round(
      (cursor.getTime() - cycleStart.getTime()) / msPerDay
    );
    const cycleOffset =
      ((diffDays % cycle.durationDays) + cycle.durationDays) % cycle.durationDays;
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
    .insert(
      inserts.map((insert) => ({ ...insert, user_id: userId })) as never
    )) as MutateResult;

  if (error) {
    console.warn("Impossible d'appliquer le motif au planning", error);
    throw new Error("Application du motif impossible");
  }
}
