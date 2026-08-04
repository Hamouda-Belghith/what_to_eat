import type { MealSlot } from "@/lib/supabase/database.types";

export interface PlannedMeal {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  mealSlot: MealSlot;
  dishId: string;
  dishName: string;
  mealCycleId: string | null;
}
