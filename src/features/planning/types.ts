import type { MealSlot } from "@/lib/supabase/database.types";

/**
 * Repas "spécial" : pas un plat, une case du planning qui représente
 * autre chose (ex. manger dehors). Liste fermée pour l'instant — voir
 * `supabase/migrations/0008_planned_meal_special.sql`.
 */
export type SpecialMeal = "eating_out";

export const SPECIAL_MEAL_LABELS: Record<SpecialMeal, string> = {
  eating_out: "Manger dehors",
};

export interface PlannedMeal {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  mealSlot: MealSlot;
  /** Mutuellement exclusif avec `special` : jamais les deux renseignés. */
  dishId: string | null;
  dishName: string | null;
  dishCalories: number | null;
  dishProteinG: number | null;
  special: SpecialMeal | null;
  mealCycleId: string | null;
}
