import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import {
  fetchDemoDishesForCycles,
  fetchDemoMealCycles,
  deleteDemoMealCycle,
  saveDemoMealCycle,
  isDemoMode,
} from "@/lib/localDemo";
import type { Dish } from "@/features/dishes/types";
import type { MealSlot } from "@/lib/supabase/database.types";
import type { MealCycle, MealCycleEntry } from "./types";

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Petit-déj",
  lunch: "Déjeuner",
  dinner: "Dîner",
};

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

export async function fetchDishesForCycles(): Promise<Dish[]> {
  if (isDemoMode()) {
    return fetchDemoDishesForCycles();
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = (await supabase
    .from("dishes")
    .select("id, name")
    .order("name")) as {
    data: { id: string; name: string }[] | null;
    error: PostgrestError | null;
  };

  if (error || !data) {
    console.warn("Impossible de charger les plats", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: null,
    ingredients: [],
  }));
}

export async function fetchMealCycles(): Promise<MealCycle[]> {
  if (isDemoMode()) {
    return fetchDemoMealCycles();
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: cycles, error } = (await supabase
    .from("meal_cycles")
    .select("id, name, duration_days, start_date")
    .order("created_at")) as {
    data: CycleRow[] | null;
    error: PostgrestError | null;
  };

  if (error || !cycles) {
    console.warn("Impossible de charger les cycles", error);
    return [];
  }

  const cyclesWithEntries: MealCycle[] = [];
  for (const cycle of cycles) {
    const { data: entries, error: entriesError } = (await supabase
      .from("meal_cycle_entries")
      .select("day_offset, meal_slot, dish_id")
      .eq("meal_cycle_id", cycle.id)) as {
      data: EntryRow[] | null;
      error: PostgrestError | null;
    };

    if (entriesError || !entries) {
      console.warn("Impossible de charger les entrées du cycle", cycle.id, entriesError);
      continue;
    }

    cyclesWithEntries.push({
      id: cycle.id,
      name: cycle.name,
      durationDays: cycle.duration_days,
      startDate: cycle.start_date,
      entries: entries.map((e) => ({
        dayOffset: e.day_offset,
        mealSlot: e.meal_slot,
        dishId: e.dish_id,
      })),
    });
  }

  return cyclesWithEntries;
}

export async function deleteMealCycle(id: string): Promise<void> {
  if (isDemoMode()) {
    return deleteDemoMealCycle(id);
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = (await supabase
    .from("meal_cycles")
    .delete()
    .eq("id", id)) as { error: PostgrestError | null };

  if (error) {
    console.warn("Impossible de supprimer le cycle", error);
    throw new Error("Suppression du cycle impossible");
  }
}

export async function saveMealCycle(cycle: {
  id?: string;
  name: string;
  durationDays: number;
  entries: MealCycleEntry[];
}): Promise<MealCycle | null> {
  if (isDemoMode()) {
    return saveDemoMealCycle(cycle);
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  const today = new Date().toISOString().slice(0, 10);
  let startDate = today;

  if (cycle.id) {
    const { data: existing, error: fetchError } = (await supabase
      .from("meal_cycles")
      .select("start_date")
      .eq("id", cycle.id)
      .limit(1)) as {
      data: { start_date: string }[] | null;
      error: PostgrestError | null;
    };

    if (fetchError) {
      console.warn("Impossible de récupérer la date de démarrage du cycle", fetchError);
    } else if (existing && existing[0]) {
      startDate = existing[0].start_date;
    }
  }

  const { data: savedRows, error: cycleError } = (await supabase
    .from("meal_cycles")
    .upsert(
      {
        id: cycle.id,
        name: cycle.name.trim(),
        duration_days: Math.max(1, Math.floor(cycle.durationDays)),
        start_date: startDate,
      } as never,
      { onConflict: "id" } as never
    )
    .select("id, name, duration_days, start_date")) as {
    data: CycleRow[] | null;
    error: PostgrestError | null;
  };

  if (cycleError || !savedRows?.[0]) {
    console.warn("Impossible d'enregistrer le cycle", cycleError);
    return null;
  }

  const cycleId = savedRows[0].id;

  const { error: delError } = (await supabase
    .from("meal_cycle_entries")
    .delete()
    .eq("meal_cycle_id", cycleId)) as { error: PostgrestError | null };
  if (delError) {
    console.warn("Impossible de remplacer les entrées du cycle", delError);
    return null;
  }

  for (const entry of cycle.entries) {
    if (entry.dayOffset < 0 || entry.dayOffset >= cycle.durationDays) continue;
    if (!entry.dishId) continue;

    const { error: insertError } = (await supabase
      .from("meal_cycle_entries")
      .insert({
        meal_cycle_id: cycleId,
        day_offset: entry.dayOffset,
        meal_slot: entry.mealSlot,
        dish_id: entry.dishId,
      } as never)) as { error: PostgrestError | null };
    if (insertError) {
      console.warn("Impossible d'ajouter une entrée au cycle", insertError);
    }
  }

  return (await fetchMealCycles()).find((c) => c.id === cycleId) ?? null;
}
