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
