import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { fetchDemoDishesForCycles, isDemoMode } from "@/lib/localDemo";
import type { Dish } from "@/features/dishes/types";
import type { MealSlot } from "@/lib/supabase/database.types";

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner"];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Petit-déj",
  lunch: "Déjeuner",
  dinner: "Dîner",
};

/** Liste légère des plats pour le sélecteur du planning. */
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
