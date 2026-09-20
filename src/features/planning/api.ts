import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";
import {
  fetchDemoMealCycles,
  fetchDemoPlannedMeals,
  fetchDemoOccupiedSlots,
  setDemoPlannedMeal,
  clearDemoPlannedMeal,
  clearAllDemoPlannedMeals,
  applyDemoCycleToRange,
  isDemoMode,
} from "@/lib/localDemo";
import { addDays, parseISODate, toISODate } from "@/lib/date";
import type { MealSlot } from "@/lib/supabase/database.types";
import { MEAL_SLOTS, type MealCycle } from "@/features/cycles/types";
import type { PlannedMeal } from "./types";

type Result<T> = { data: T[] | null; error: PostgrestError | null };
type MutateResult = { error: PostgrestError | null };

interface PlannedMealRow {
  id: string;
  date: string;
  meal_slot: MealSlot;
  dish_id: string | null;
  meal_cycle_id: string | null;
  dishes?: { name: string; calories: number | null; protein_g: number | null } | null;
}

interface OccupiedSlot {
  id: string;
  date: string;
  mealSlot: MealSlot;
  dishId: string | null;
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
    .select("id, date, meal_slot, dish_id, meal_cycle_id, dishes(name, calories, protein_g)")
    .eq("user_id", userId)
    .gte("date", periodStart)
    .lte("date", periodEnd)) as Result<PlannedMealRow>;

  if (error || !data) {
    console.warn("Impossible de charger le planning", error);
    return [];
  }

  // dish_id null = case explicitement vidée (voir setMealWithScope) : ne
  // représente pas un vrai repas, on la cache de tout le reste de l'app.
  return data
    .filter((row): row is PlannedMealRow & { dish_id: string } => row.dish_id !== null)
    .map((row) => ({
      id: row.id,
      date: row.date,
      mealSlot: row.meal_slot,
      dishId: row.dish_id,
      dishName: row.dishes?.name ?? "",
      dishCalories: row.dishes?.calories ?? null,
      // numeric(6,1) : PostgREST peut le renvoyer sous forme de chaîne.
      dishProteinG:
        row.dishes?.protein_g == null ? null : Number(row.dishes.protein_g),
      mealCycleId: row.meal_cycle_id,
    }));
}

/**
 * Emplacements (date + repas) occupés sur la période, dish_id inclus
 * même s'il est `null` (case explicitement vidée). Sert uniquement à
 * `applyCycleToRange` pour savoir où NE PAS réappliquer le motif —
 * contrairement à `fetchPlannedMeals`, qui cache ces cases vidées.
 */
async function fetchOccupiedSlots(
  periodStart: string,
  periodEnd: string
): Promise<OccupiedSlot[]> {
  if (isDemoMode()) {
    return fetchDemoOccupiedSlots(periodStart, periodEnd);
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = (await supabase
    .from("planned_meals")
    .select("id, date, meal_slot, dish_id")
    .eq("user_id", userId)
    .gte("date", periodStart)
    .lte("date", periodEnd)) as Result<{
    id: string;
    date: string;
    meal_slot: MealSlot;
    dish_id: string | null;
  }>;

  if (error || !data) {
    console.warn("Impossible de charger les emplacements occupés", error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    date: row.date,
    mealSlot: row.meal_slot,
    dishId: row.dish_id,
  }));
}

export async function setPlannedMeal(
  date: string,
  mealSlot: MealSlot,
  dishId: string | null,
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

/** Supprime tous les repas planifiés (passés et futurs) de l'utilisateur. */
export async function clearAllPlannedMeals(): Promise<void> {
  if (isDemoMode()) {
    await clearAllDemoPlannedMeals();
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = (await supabase
    .from("planned_meals")
    .delete()
    .eq("user_id", userId)) as MutateResult;

  if (error) {
    console.warn("Impossible de vider le planning", error);
    throw new Error("Suppression du planning impossible");
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
 * Remplit les cases d'une plage depuis un motif de répétition. Par
 * défaut, les cases déjà remplies (overrides manuels) ne sont pas
 * écrasées ; avec `overwrite: true`, une case déjà remplie avec un
 * plat différent de celui du motif est remplacée (utilisé après
 * confirmation d'un chevauchement, voir `repeat.ts`).
 */
export async function applyCycleToRange(
  cycleId: string,
  periodStart: string,
  periodEnd: string,
  overwrite = false
): Promise<void> {
  if (isDemoMode()) {
    await applyDemoCycleToRange(cycleId, periodStart, periodEnd, overwrite);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const cycle = await fetchPatternById(cycleId);
  if (!cycle) throw new Error("Motif de répétition introuvable");

  // Inclut les cases explicitement vidées (dish_id null) : le motif ne
  // doit pas les réappliquer, contrairement aux cases jamais visitées.
  const existing = await fetchOccupiedSlots(periodStart, periodEnd);
  const existingByKey = new Map(
    existing.map((slot) => [`${slot.date}-${slot.mealSlot}`, slot])
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
  const updates: Array<{ id: string; dish_id: string }> = [];

  const msPerDay = 24 * 60 * 60 * 1000;
  let cursor = new Date(startDate);

  while (cursor <= endDate) {
    const diffDays = Math.round(
      (cursor.getTime() - cycleStart.getTime()) / msPerDay
    );
    const cycleOffset =
      ((diffDays % cycle.durationDays) + cycle.durationDays) % cycle.durationDays;
    const dateStr = toISODate(cursor);

    for (const slot of MEAL_SLOTS) {
      const entry = cycleEntriesByOffset.get(`${cycleOffset}-${slot}`);
      if (!entry) continue;
      const key = `${dateStr}-${slot}`;
      const existingMeal = existingByKey.get(key);
      if (!existingMeal) {
        inserts.push({
          date: dateStr,
          meal_slot: slot,
          dish_id: entry.dishId,
          meal_cycle_id: cycleId,
        });
      } else if (overwrite && existingMeal.dishId !== entry.dishId) {
        updates.push({ id: existingMeal.id, dish_id: entry.dishId });
      }
    }

    cursor = addDays(cursor, 1);
  }

  const userId = await getCurrentUserId();
  if (!userId) return;

  if (inserts.length > 0) {
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

  for (const update of updates) {
    const { error } = (await supabase
      .from("planned_meals")
      .update({ dish_id: update.dish_id, meal_cycle_id: cycleId } as never)
      .eq("id", update.id)) as MutateResult;
    if (error) {
      console.warn("Impossible de remplacer un repas en conflit", error);
    }
  }
}
