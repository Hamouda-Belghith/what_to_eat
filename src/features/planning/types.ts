import type { MealSlot } from "@/lib/supabase/database.types";

export interface PlannedMeal {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  mealSlot: MealSlot;
  dishId: string;
  dishName: string;
  dishPhotoUrl: string | null;
  mealCycleId: string | null;
  mealRepeatId: string | null;
}

export type MealRepeatDuration = 3 | 4 | null;

export interface MealRepeat {
  id: string;
  mealSlot: MealSlot;
  dishId: string;
  startDate: string;
  weeksTotal: MealRepeatDuration;
}
