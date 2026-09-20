import type { MealSlot } from "@/lib/supabase/database.types";

export interface MealCycleEntry {
  dayOffset: number;
  mealSlot: MealSlot;
  dishId: string;
}

export interface MealCycle {
  id: string;
  name: string;
  durationDays: number;
  startDate: string;
  entries: MealCycleEntry[];
}

/** Créneaux de repas dans l'ordre d'affichage de la journée. */
export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
